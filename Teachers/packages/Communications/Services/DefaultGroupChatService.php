<?php

namespace App\Modules\Communications\Services;

use App\Models\OfficialProfile;
use App\Models\User;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Services\CloudinaryService;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use App\Modules\Communications\Support\SchemaCache;
use Illuminate\Validation\ValidationException;

class DefaultGroupChatService
{
    public const TYPE_SK_OFFICIALS = 'SK_OFFICIALS';

    public const TYPE_SK_FEDERATIONS = 'SK_FEDERATIONS';

    public const MAX_SK_OFFICIALS = 260;

    public const MAX_SK_FEDERATIONS = 26;

    public const DEFAULT_NAME_SK_OFFICIALS = 'SK Officials';

    public const DEFAULT_NAME_SK_FEDERATIONS = 'SK Federations';

    public function __construct(
        protected ParticipantTypeResolver $types,
    ) {}

    /**
     * Idempotently create both default GCs and sync membership for the tenant.
     *
     * @return array{sk_officials: Conversation, sk_federations: Conversation}|null
     */
    public function ensureForTenant(?int $tenantId = null): ?array
    {
        if ($tenantId === null || $tenantId <= 0) {
            return null;
        }

        if (! SchemaCache::hasTable('conversations')
            || ! SchemaCache::hasColumn('conversations', 'default_group_type')
        ) {
            return null;
        }

        return DB::transaction(function () use ($tenantId) {
            $officials = $this->ensureGroup(
                $tenantId,
                self::TYPE_SK_OFFICIALS,
                self::DEFAULT_NAME_SK_OFFICIALS,
                self::MAX_SK_OFFICIALS
            );
            $federations = $this->ensureGroup(
                $tenantId,
                self::TYPE_SK_FEDERATIONS,
                self::DEFAULT_NAME_SK_FEDERATIONS,
                self::MAX_SK_FEDERATIONS
            );

            $this->syncMembers($officials);
            $this->syncMembers($federations);

            return [
                'sk_officials' => $officials->fresh(['participants.user']),
                'sk_federations' => $federations->fresh(['participants.user']),
            ];
        });
    }

    public function ensureForUser(Authenticatable $user): void
    {
        $tenantId = (int) ($user->tenant_id ?? 0);
        if ($tenantId <= 0) {
            return;
        }

        $this->ensureForTenant($tenantId);
    }

    /**
     * Safe hook for Manage Accounts create/delete/restore/batch.
     */
    public function syncTenant(?int $tenantId): void
    {
        if ($tenantId === null || $tenantId <= 0) {
            return;
        }

        try {
            $this->ensureForTenant($tenantId);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function defaultAvatarUrl(): string
    {
        $path = (string) config('communications.default_group_avatar', '/images/SK_OnePortal_logo.png');
        if ($path === '') {
            $path = '/images/SK_OnePortal_logo.png';
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return url($path);
    }

    public function groupAvatarUrl(Conversation $conversation): string
    {
        $custom = trim((string) ($conversation->avatar_url ?? ''));
        if ($custom !== '') {
            if (str_starts_with($custom, 'http://') || str_starts_with($custom, 'https://')) {
                return $custom;
            }

            return url($custom);
        }

        return $this->defaultAvatarUrl();
    }

    public function ensureGroup(
        int $tenantId,
        string $defaultGroupType,
        string $defaultName,
        int $maxMembers
    ): Conversation {
        $existing = Conversation::query()
            ->where('tenant_id', $tenantId)
            ->where('default_group_type', $defaultGroupType)
            ->first();

        if ($existing) {
            $dirty = false;
            if ($existing->conversation_type !== Conversation::TYPE_GROUP) {
                $existing->conversation_type = Conversation::TYPE_GROUP;
                $dirty = true;
            }
            if ((int) $existing->max_members !== $maxMembers) {
                $existing->max_members = $maxMembers;
                $dirty = true;
            }
            if ($existing->name === null || trim((string) $existing->name) === '') {
                $existing->name = $defaultName;
                $dirty = true;
            }
            if ($dirty) {
                $existing->save();
            }

            return $existing;
        }

        return Conversation::query()->create([
            'conversation_type' => Conversation::TYPE_GROUP,
            'name' => $defaultName,
            'default_group_type' => $defaultGroupType,
            'tenant_id' => $tenantId,
            'max_members' => $maxMembers,
        ]);
    }

    public function syncMembers(Conversation $conversation): void
    {
        if (! $conversation->isDefaultGroup()) {
            return;
        }

        $userType = $this->types->portalType();
        $eligible = $this->eligibleUserIds($conversation);
        $max = (int) ($conversation->max_members ?: $this->maxForType((string) $conversation->default_group_type));

        if ($eligible->count() > $max) {
            $eligible = $eligible->take($max)->values();
        }

        $eligibleIds = $eligible->all();
        $presidentId = $this->federationPresidentUserId((int) $conversation->tenant_id);

        $existing = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->get()
            ->keyBy(fn (ConversationParticipant $p) => (int) $p->user_id);

        foreach ($eligibleIds as $userId) {
            $role = ConversationParticipant::ROLE_MEMBER;
            if ($conversation->default_group_type === self::TYPE_SK_FEDERATIONS
                && $presidentId !== null
                && (int) $userId === $presidentId
            ) {
                $role = ConversationParticipant::ROLE_ADMIN;
            }
            if ($conversation->default_group_type === self::TYPE_SK_OFFICIALS
                && $presidentId !== null
                && (int) $userId === $presidentId
            ) {
                $role = ConversationParticipant::ROLE_ADMIN;
            }

            $row = $existing->get((int) $userId);
            if ($row) {
                $updates = [];
                if ($row->user_type !== $userType) {
                    $updates['user_type'] = $userType;
                }
                if (($row->participant_role ?? ConversationParticipant::ROLE_MEMBER) !== $role) {
                    $updates['participant_role'] = $role;
                }
                if ($updates !== []) {
                    $row->fill($updates)->save();
                }
                $existing->forget((int) $userId);

                continue;
            }

            if ($this->memberCount($conversation) >= $max) {
                break;
            }

            ConversationParticipant::query()->create([
                'conversation_id' => $conversation->id,
                'user_id' => (int) $userId,
                'user_type' => $userType,
                'participant_role' => $role,
                'joined_at' => now(),
            ]);
        }

        foreach ($existing as $stale) {
            $stale->delete();
        }
    }

    /**
     * @return Collection<int, int>
     */
    public function eligibleUserIds(Conversation $conversation): Collection
    {
        $tenantId = (int) $conversation->tenant_id;
        if ($tenantId <= 0) {
            return collect();
        }

        return match ((string) $conversation->default_group_type) {
            self::TYPE_SK_OFFICIALS => $this->eligibleSkOfficialIds($tenantId),
            self::TYPE_SK_FEDERATIONS => $this->eligibleSkFederationIds($tenantId),
            default => collect(),
        };
    }

    /**
     * All SK Officials for the tenant — never pure sk_fed portal administrators.
     *
     * @return Collection<int, int>
     */
    public function eligibleSkOfficialIds(int $tenantId): Collection
    {
        return User::query()
            ->where('tenant_id', $tenantId)
            ->where('role', User::ROLE_SK_OFFICIAL)
            ->whereNull('deleted_at')
            ->whereIn('status', [
                User::STATUS_ACTIVE,
                User::STATUS_PENDING_APPROVAL,
            ])
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values();
    }

    /**
     * Barangay chairpersons (one per barangay) plus officials with a federation_position.
     * Pure sk_fed portal administrators are never members.
     *
     * @return Collection<int, int>
     */
    public function eligibleSkFederationIds(int $tenantId): Collection
    {
        $chairpersons = User::query()
            ->where('tenant_id', $tenantId)
            ->where('role', User::ROLE_SK_OFFICIAL)
            ->whereNull('deleted_at')
            ->whereIn('status', [
                User::STATUS_ACTIVE,
                User::STATUS_PENDING_APPROVAL,
            ])
            ->whereHas('officialProfile', function ($profile) {
                $profile->where(function ($position) {
                    $position->whereIn('position', ['Chairperson', 'Chairman'])
                        ->orWhereRaw("LOWER(TRIM(position)) LIKE '%chair%'");
                });
            })
            ->orderBy('id')
            ->get(['id', 'barangay_id']);

        $chairIds = $chairpersons
            ->groupBy(fn (User $user) => (int) ($user->barangay_id ?? 0))
            ->map(fn (Collection $group) => (int) $group->first()->id)
            ->values();

        $federationPositionIds = User::query()
            ->where('tenant_id', $tenantId)
            ->where('role', User::ROLE_SK_OFFICIAL)
            ->whereNull('deleted_at')
            ->whereIn('status', [
                User::STATUS_ACTIVE,
                User::STATUS_PENDING_APPROVAL,
            ])
            ->whereHas('officialProfile', function ($profile) {
                $profile->whereIn('federation_position', OfficialProfile::FEDERATION_POSITIONS);
            })
            ->orderByRaw(
                SchemaCache::hasTable('official_profiles')
                    && SchemaCache::hasColumn('official_profiles', 'federation_position')
                    ? "CASE WHEN EXISTS (
                        SELECT 1 FROM official_profiles op
                        WHERE op.user_id = users.id
                          AND op.federation_position = 'President'
                    ) THEN 0 ELSE 1 END"
                    : 'id'
            )
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($id) => (int) $id);

        return $chairIds->merge($federationPositionIds)->unique()->values();
    }

    public function federationPresidentUserId(int $tenantId): ?int
    {
        return $this->federationPositionUserId($tenantId, 'President');
    }

    public function federationVicePresidentUserId(int $tenantId): ?int
    {
        return $this->federationPositionUserId($tenantId, 'Vice President');
    }

    public function federationPositionUserId(int $tenantId, string $position): ?int
    {
        if ($tenantId <= 0
            || ! SchemaCache::hasTable('official_profiles')
            || ! SchemaCache::hasColumn('official_profiles', 'federation_position')
        ) {
            return null;
        }

        $userId = OfficialProfile::query()
            ->where('federation_position', $position)
            ->whereHas('user', function ($query) use ($tenantId): void {
                $query->where('tenant_id', $tenantId)
                    ->whereNull('deleted_at')
                    ->where('status', User::STATUS_ACTIVE)
                    ->where('role', User::ROLE_SK_OFFICIAL);
            })
            ->value('user_id');

        return $userId ? (int) $userId : null;
    }

    public function canRename(Conversation $conversation, Authenticatable $user): bool
    {
        if (! $conversation->isGroup() || ! $this->isMember($conversation, $user)) {
            return false;
        }

        if (! $conversation->isDefaultGroup()) {
            return $this->isGroupAdmin($conversation, $user);
        }

        return $this->hasFederationLeadershipPosition(
            $conversation,
            $user,
            ['President', 'Vice President']
        );
    }

    public function canChangeAvatar(Conversation $conversation, Authenticatable $user): bool
    {
        if (! $conversation->isGroup() || ! $this->isMember($conversation, $user)) {
            return false;
        }

        if (! $conversation->isDefaultGroup()) {
            return $this->isGroupAdmin($conversation, $user);
        }

        return $this->hasFederationLeadershipPosition(
            $conversation,
            $user,
            ['President']
        );
    }

    public function isGroupAdmin(Conversation $conversation, Authenticatable $user): bool
    {
        if (! SchemaCache::hasColumn('conversation_participants', 'participant_role')) {
            // Without roles, any member may manage a custom group.
            return ! $conversation->isDefaultGroup() && $this->isMember($conversation, $user);
        }

        return ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', (int) $user->id)
            ->where('participant_role', ConversationParticipant::ROLE_ADMIN)
            ->exists();
    }

    /**
     * @param  list<string>  $positions
     */
    protected function hasFederationLeadershipPosition(
        Conversation $conversation,
        Authenticatable $user,
        array $positions
    ): bool {
        if (! $conversation->isDefaultGroup()) {
            return false;
        }

        if (! $this->isMember($conversation, $user)) {
            return false;
        }

        if ($positions === []) {
            return false;
        }

        if (! SchemaCache::hasTable('official_profiles')
            || ! SchemaCache::hasColumn('official_profiles', 'federation_position')
        ) {
            return false;
        }

        $userId = (int) $user->id;
        $tenantId = (int) ($conversation->tenant_id ?? 0);
        if ($tenantId <= 0) {
            $tenantId = (int) ($user->tenant_id ?? 0);
        }

        if ($tenantId > 0) {
            foreach ($positions as $position) {
                $leaderId = $this->federationPositionUserId($tenantId, $position);
                if ($leaderId !== null && $leaderId === $userId) {
                    return true;
                }
            }
        }

        $profile = OfficialProfile::query()
            ->where('user_id', $userId)
            ->first();

        if ($profile === null) {
            return false;
        }

        $current = mb_strtolower(trim((string) ($profile->federation_position ?? '')), 'UTF-8');
        if ($current === '') {
            return false;
        }

        $allowed = array_map(
            static fn (string $position): string => mb_strtolower(trim($position), 'UTF-8'),
            $positions
        );

        if (! in_array($current, $allowed, true)) {
            return false;
        }

        if ($tenantId > 0) {
            $userTenant = (int) (User::query()->whereKey($userId)->value('tenant_id') ?? 0);
            if ($userTenant > 0 && $userTenant !== $tenantId) {
                return false;
            }
        }

        $status = (string) (User::query()->whereKey($userId)->value('status') ?? '');
        if ($status !== '' && strtoupper($status) !== User::STATUS_ACTIVE) {
            return false;
        }

        return true;
    }

    public function rename(Conversation $conversation, Authenticatable $user, string $name): Conversation
    {
        if (! $this->canRename($conversation, $user)) {
            abort(403, $conversation->isDefaultGroup()
                ? 'Only the SK Federation President or Vice President can rename this group.'
                : 'Only a group admin can rename this group.');
        }

        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
        if ($name === '') {
            throw ValidationException::withMessages([
                'name' => 'Group name is required.',
            ]);
        }
        if (mb_strlen($name) > 120) {
            throw ValidationException::withMessages([
                'name' => 'Group name cannot exceed 120 characters.',
            ]);
        }

        $conversation->name = $name;
        $conversation->save();

        return $conversation->fresh();
    }

    public function updateAvatar(Conversation $conversation, Authenticatable $user, UploadedFile $file): Conversation
    {
        if (! $this->canChangeAvatar($conversation, $user)) {
            abort(403, $conversation->isDefaultGroup()
                ? 'Only the SK Federation President can change this group photo.'
                : 'Only a group admin can change this group photo.');
        }

        if (! $conversation->isGroup()) {
            abort(422, 'Only group chats support a custom photo.');
        }

        $cloudinary = app(CloudinaryService::class);
        if (! $cloudinary->isConfigured()) {
            abort(503, 'Image upload is not configured.');
        }

        $uploaded = $cloudinary->uploadGroupChatAvatar($file);
        $url = trim((string) ($uploaded['url'] ?? ''));
        if ($url === '') {
            abort(502, 'Unable to upload group photo.');
        }

        $conversation->avatar_url = $url;
        $conversation->save();

        return $conversation->fresh();
    }

    public function assertCanAddMember(Conversation $conversation): void
    {
        $max = (int) ($conversation->max_members ?: 0);
        if ($max <= 0) {
            return;
        }

        if ($this->memberCount($conversation) >= $max) {
            abort(422, 'This group has reached its maximum of '.$max.' members.');
        }
    }

    public function memberCount(Conversation $conversation): int
    {
        return ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->count();
    }

    public function isMember(Conversation $conversation, Authenticatable $user): bool
    {
        return ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', (int) $user->id)
            ->exists();
    }

    public function maxForType(string $defaultGroupType): int
    {
        return match ($defaultGroupType) {
            self::TYPE_SK_OFFICIALS => self::MAX_SK_OFFICIALS,
            self::TYPE_SK_FEDERATIONS => self::MAX_SK_FEDERATIONS,
            default => 0,
        };
    }

    /**
     * @return array<string, int>
     */
    protected function federationPositionRankMap(): array
    {
        $ranks = [];
        foreach (OfficialProfile::FEDERATION_POSITIONS as $index => $position) {
            $ranks[mb_strtolower(trim($position), 'UTF-8')] = $index;
        }

        return $ranks;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function serializeMembers(Conversation $conversation, ConversationService $conversations): array
    {
        $load = ['participants.user'];
        if (SchemaCache::hasTable('official_profiles')) {
            $load[] = 'participants.user.officialProfile';
        }
        if (SchemaCache::hasTable('barangays')) {
            $load[] = 'participants.user.barangay';
        }
        $conversation->loadMissing($load);

        $rankMap = $this->federationPositionRankMap();
        $isFederationGroup = $conversation->default_group_type === self::TYPE_SK_FEDERATIONS;

        return $conversation->participants
            ->sortBy(function (ConversationParticipant $participant) use ($rankMap, $isFederationGroup) {
                $user = $participant->user;
                $name = mb_strtolower((string) ($user?->name ?? ''), 'UTF-8');

                if ($isFederationGroup) {
                    $fed = mb_strtolower(trim((string) ($user?->officialProfile?->federation_position ?? '')), 'UTF-8');
                    $rank = $rankMap[$fed] ?? 1000;

                    return sprintf('%04d-%s', $rank, $name);
                }

                $position = mb_strtolower(trim((string) ($user?->officialProfile?->position ?? '')), 'UTF-8');
                $officialRank = match (true) {
                    str_contains($position, 'chair') => 0,
                    str_contains($position, 'secretary') => 1,
                    str_contains($position, 'treasurer') => 2,
                    str_contains($position, 'kagawad') => 3,
                    default => 50,
                };

                return sprintf('%04d-%s', $officialRank, $name);
            })
            ->values()
            ->map(function (ConversationParticipant $participant) use ($conversations) {
                $user = $participant->user;
                $serialized = $conversations->serializeUser($user, $participant->user_type) ?? [
                    'id' => (int) $participant->user_id,
                    'name' => 'User',
                ];

                $serialized['participant_role'] = $participant->participant_role
                    ?? ConversationParticipant::ROLE_MEMBER;
                $serialized['joined_at'] = optional($participant->joined_at)?->toIso8601String();
                $serialized['federation_position'] = $user?->officialProfile?->federation_position;
                $serialized['position'] = $user?->officialProfile?->federation_position
                    ?: $user?->officialProfile?->position
                    ?: ($serialized['position'] ?? null);

                return $serialized;
            })
            ->all();
    }
}
