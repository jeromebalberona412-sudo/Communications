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

    /** Shared Students + Teachers group (iLearnU Capstone). */
    public const TYPE_CAPSTONE = 'CAPSTONE_2';

    public const MAX_SK_OFFICIALS = 260;

    public const MAX_SK_FEDERATIONS = 26;

    public const MAX_CAPSTONE = 500;

    public const DEFAULT_NAME_SK_OFFICIALS = 'SK Officials';

    public const DEFAULT_NAME_SK_FEDERATIONS = 'SK Federations';

    public const DEFAULT_NAME_CAPSTONE = 'Capstone 2';

    /**
     * Advisory-lock key so Students and Teachers cannot create the shared
     * group concurrently (they share one PostgreSQL database).
     */
    protected const CAPSTONE_LOCK_KEY = 20251021;

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

        $portal = strtolower(trim((string) config('communications.portal_user_type', '')));
        if (in_array($portal, ['students', 'student', 'teachers', 'teacher'], true)) {
            return null;
        }

        if (! SchemaCache::hasTable('conversations')
            || ! SchemaCache::hasColumn('conversations', 'default_group_type')
            || ! SchemaCache::hasTable('official_profiles')
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
        $portal = strtolower(trim((string) config('communications.portal_user_type', '')));
        if (in_array($portal, ['students', 'student', 'teachers', 'teacher'], true)) {
            try {
                $this->ensureCapstoneGroup();
            } catch (\Throwable $e) {
                report($e);
            }

            return;
        }

        if (! SchemaCache::hasTable('official_profiles')) {
            return;
        }

        $tenantId = (int) ($user->tenant_id ?? 0);
        if ($tenantId <= 0) {
            return;
        }

        $this->ensureForTenant($tenantId);
    }

    /**
     * Idempotently create the single shared Capstone 2 group and sync memberships.
     */
    public function ensureCapstoneGroup(): ?Conversation
    {
        if (! SchemaCache::hasTable('conversations')
            || ! SchemaCache::hasTable('conversation_participants')
            || ! SchemaCache::hasColumn('conversations', 'default_group_type')
        ) {
            return null;
        }

        return DB::transaction(function () {
            $this->lockCapstoneInit();

            $existing = Conversation::query()
                ->where('default_group_type', self::TYPE_CAPSTONE)
                ->orderBy('id')
                ->first();

            // Groups created before the default-group marker existed are
            // "Capstone" / "Capstone 2" rows with a NULL default_group_type.
            // Adopt one of them instead of creating a third copy.
            $legacy = $this->legacyCapstoneGroups();

            if (! $existing) {
                $existing = $legacy->first();
            }

            if (! $existing) {
                $payload = [
                    'conversation_type' => Conversation::TYPE_GROUP,
                    'name' => self::DEFAULT_NAME_CAPSTONE,
                    'default_group_type' => self::TYPE_CAPSTONE,
                    'max_members' => self::MAX_CAPSTONE,
                ];
                if (SchemaCache::hasColumn('conversations', 'tenant_id')) {
                    $payload['tenant_id'] = null;
                }
                $existing = Conversation::query()->create($payload);
            } else {
                $dirty = false;
                if ($existing->conversation_type !== Conversation::TYPE_GROUP) {
                    $existing->conversation_type = Conversation::TYPE_GROUP;
                    $dirty = true;
                }
                if ((string) $existing->default_group_type !== self::TYPE_CAPSTONE) {
                    $existing->default_group_type = self::TYPE_CAPSTONE;
                    $dirty = true;
                }
                if ((int) ($existing->max_members ?: 0) !== self::MAX_CAPSTONE) {
                    $existing->max_members = self::MAX_CAPSTONE;
                    $dirty = true;
                }
                if (trim((string) $existing->name) === '') {
                    $existing->name = self::DEFAULT_NAME_CAPSTONE;
                    $dirty = true;
                }
                if ($dirty) {
                    $existing->save();
                }
            }

            // Collapse accidental duplicates into the canonical Capstone group.
            // Members, messages and call history are moved, never dropped.
            $legacy
                ->filter(fn (Conversation $dup) => (int) $dup->id !== (int) $existing->id)
                ->each(fn (Conversation $dup) => $this->mergeGroupInto($existing, $dup));

            Conversation::query()
                ->where('default_group_type', self::TYPE_CAPSTONE)
                ->where('id', '!=', $existing->id)
                ->orderBy('id')
                ->get()
                ->each(fn (Conversation $dup) => $this->mergeGroupInto($existing, $dup));

            $this->syncCapstoneMembers($existing);

            return $existing->fresh(['participants.user']);
        });
    }

    /**
     * Serialise group creation between the Students and Teachers applications.
     * Both portals share one PostgreSQL database, so an advisory lock keeps
     * them from provisioning two groups at the same time.
     */
    protected function lockCapstoneInit(): void
    {
        try {
            if (DB::connection()->getDriverName() === 'pgsql') {
                DB::select('select pg_advisory_xact_lock(?)', [self::CAPSTONE_LOCK_KEY]);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Pre-marker "Capstone" groups (default_group_type IS NULL).
     *
     * The group that already carries the canonical name wins, so the shared
     * group keeps the "Capstone 2" identity the portals advertise.
     *
     * @return Collection<int, Conversation>
     */
    protected function legacyCapstoneGroups(): Collection
    {
        $default = mb_strtolower(trim(self::DEFAULT_NAME_CAPSTONE));

        return Conversation::query()
            ->where('conversation_type', Conversation::TYPE_GROUP)
            ->whereNull('default_group_type')
            ->whereRaw("lower(trim(coalesce(name, ''))) like ?", ['capstone%'])
            ->orderBy('id')
            ->get()
            ->sortBy(fn (Conversation $group) => (
                mb_strtolower(trim((string) $group->name)) === $default ? 0 : 1
            ) . ':' . str_pad((string) $group->id, 10, '0', STR_PAD_LEFT))
            ->values();
    }

    /**
     * Move every record of $source into $target, then drop the empty duplicate.
     */
    protected function mergeGroupInto(Conversation $target, Conversation $source): void
    {
        if ((int) $target->id === (int) $source->id) {
            return;
        }

        $targetUserIds = ConversationParticipant::query()
            ->where('conversation_id', $target->id)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        ConversationParticipant::query()
            ->where('conversation_id', $source->id)
            ->orderBy('id')
            ->get()
            ->each(function (ConversationParticipant $row) use ($target, $targetUserIds): void {
                // Never create a duplicate membership for the same person.
                if (in_array((int) $row->user_id, $targetUserIds, true)) {
                    $row->delete();

                    return;
                }
                $row->conversation_id = $target->id;
                $row->save();
            });

        $this->reassignColumn('messages', 'conversation_id', (int) $source->id, (int) $target->id);
        $this->reassignColumn('calls', 'conversation_id', (int) $source->id, (int) $target->id);

        $source->delete();
    }

    /**
     * Point a conversation foreign key from one conversation to another.
     */
    protected function reassignColumn(string $table, string $column, int $fromId, int $toId): void
    {
        if (! SchemaCache::hasTable($table) || ! SchemaCache::hasColumn($table, $column)) {
            return;
        }

        try {
            DB::table($table)->where($column, $fromId)->update([$column => $toId]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function syncCapstoneMembers(Conversation $conversation): void
    {
        if ((string) $conversation->default_group_type !== self::TYPE_CAPSTONE) {
            return;
        }

        $eligible = $this->eligibleCapstoneUserIds();
        $ownerTeacherId = $this->capstoneOwnerTeacherId();

        $existing = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->orderBy('id')
            ->get();

        // The unique key is (conversation_id, user_id, user_type) so the same
        // person can be present twice with a different type. Keep one row.
        foreach ($existing->groupBy(fn (ConversationParticipant $p) => (int) $p->user_id) as $rows) {
            $rows->slice(1)->each(fn (ConversationParticipant $row) => $row->delete());
        }

        $existing = $existing
            ->groupBy(fn (ConversationParticipant $p) => (int) $p->user_id)
            ->map(fn ($rows) => $rows->first())
            ->keyBy(fn (ConversationParticipant $p) => (int) $p->user_id);

        foreach ($eligible as $row) {
            $userId = (int) $row['id'];
            $userType = (string) $row['type'];
            $role = ($ownerTeacherId !== null && $userId === $ownerTeacherId)
                ? ConversationParticipant::ROLE_ADMIN
                : ConversationParticipant::ROLE_MEMBER;

            $participant = $existing->get($userId);
            if ($participant) {
                $updates = [];
                if ($participant->user_type !== $userType) {
                    $updates['user_type'] = $userType;
                }
                if (SchemaCache::hasColumn('conversation_participants', 'participant_role')
                    && ($participant->participant_role ?? ConversationParticipant::ROLE_MEMBER) !== $role
                    && $role === ConversationParticipant::ROLE_ADMIN
                ) {
                    $updates['participant_role'] = $role;
                }
                if ($updates !== []) {
                    $participant->fill($updates)->save();
                }
                $existing->forget($userId);

                continue;
            }

            if ($this->memberCount($conversation) >= self::MAX_CAPSTONE) {
                break;
            }

            $create = [
                'conversation_id' => $conversation->id,
                'user_id' => $userId,
                'user_type' => $userType,
                'joined_at' => now(),
            ];
            if (SchemaCache::hasColumn('conversation_participants', 'participant_role')) {
                $create['participant_role'] = $role;
            }
            ConversationParticipant::query()->create($create);
        }

        // Drop memberships for users who are no longer eligible (inactive / wrong role).
        foreach ($existing as $stale) {
            $stale->delete();
        }
    }

    /**
     * @return list<array{id:int,type:string}>
     */
    public function eligibleCapstoneUserIds(): array
    {
        $query = User::query()->orderBy('id');

        if (SchemaCache::hasColumn('users', 'is_active')) {
            $query->where('is_active', true);
        } elseif (SchemaCache::hasColumn('users', 'status')) {
            $query->where('status', User::STATUS_ACTIVE);
        }

        if (SchemaCache::hasColumn('users', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $query->whereIn('role', [
            User::ROLE_STUDENTS ?? 'students',
            User::ROLE_TEACHERS ?? 'teachers',
            'students',
            'teachers',
            'student',
            'teacher',
        ]);

        return $query->get(['id', 'role'])
            ->map(function (User $user) {
                try {
                    $type = $this->types->fromUser($user);
                } catch (\InvalidArgumentException) {
                    $type = str_contains(strtolower((string) $user->role), 'teach')
                        ? ParticipantTypeResolver::TEACHERS
                        : ParticipantTypeResolver::STUDENTS;
                }

                return [
                    'id' => (int) $user->id,
                    'type' => $type,
                ];
            })
            ->unique('id')
            ->values()
            ->all();
    }

    /**
     * Add one user to the shared Capstone 2 group.
     *
     * Idempotent: calling it twice for the same person never creates a second
     * membership row. Used by the Teachers portal when a new student account
     * is created, so the student can see the group right after logging in.
     */
    public function addUserToCapstoneGroup(int $userId, ?string $userType = null): ?ConversationParticipant
    {
        if ($userId <= 0) {
            return null;
        }

        $group = $this->ensureCapstoneGroup();
        if (! $group) {
            return null;
        }

        $userType = trim((string) $userType);
        if ($userType === '') {
            $userType = $this->resolveUserType($userId);
        }

        $existing = ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $userId)
            ->orderBy('id')
            ->get();

        $role = ($this->capstoneOwnerTeacherId() === $userId)
            ? ConversationParticipant::ROLE_ADMIN
            : ConversationParticipant::ROLE_MEMBER;

        // Keep exactly one membership row per person.
        $existing->slice(1)->each(fn (ConversationParticipant $row) => $row->delete());

        $participant = $existing->first();
        if ($participant) {
            $updates = [];
            if ($userType !== '' && $participant->user_type !== $userType) {
                $updates['user_type'] = $userType;
            }
            if (SchemaCache::hasColumn('conversation_participants', 'participant_role')
                && ($participant->participant_role ?? ConversationParticipant::ROLE_MEMBER) !== $role
            ) {
                $updates['participant_role'] = $role;
            }
            if ($updates !== []) {
                $participant->fill($updates)->save();
            }

            return $participant->fresh();
        }

        if ($this->memberCount($group) >= self::MAX_CAPSTONE) {
            return null;
        }

        $create = [
            'conversation_id' => $group->id,
            'user_id' => $userId,
            'user_type' => $userType,
            'joined_at' => now(),
        ];
        if (SchemaCache::hasColumn('conversation_participants', 'participant_role')) {
            $create['participant_role'] = $role;
        }

        return ConversationParticipant::query()->create($create);
    }

    /**
     * Portal type of a user, derived from the shared users table.
     */
    public function resolveUserType(int $userId): string
    {
        $role = (string) (User::query()->whereKey($userId)->value('role') ?? '');

        $type = $this->types->normalizeSearchRole($role);
        if ($type !== null) {
            return $type;
        }

        return str_contains(mb_strtolower($role), 'teach')
            ? ParticipantTypeResolver::TEACHERS
            : ParticipantTypeResolver::STUDENTS;
    }

    public function capstoneOwnerTeacherId(): ?int
    {
        $query = User::query()->orderBy('id');
        if (SchemaCache::hasColumn('users', 'is_active')) {
            $query->where('is_active', true);
        }
        if (SchemaCache::hasColumn('users', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }
        $query->whereIn('role', [
            User::ROLE_TEACHERS ?? 'teachers',
            'teachers',
            'teacher',
        ]);

        $id = $query->value('id');

        return $id ? (int) $id : null;
    }

    public function isCapstoneGroup(Conversation $conversation): bool
    {
        return $conversation->isGroup()
            && (string) $conversation->default_group_type === self::TYPE_CAPSTONE;
    }

    public function isLmsPortal(): bool
    {
        $portal = strtolower(trim((string) config('communications.portal_user_type', '')));

        return in_array($portal, ['students', 'student', 'teachers', 'teacher'], true);
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
        $fallback = $this->isLmsPortal()
            ? '/favicon.ico'
            : '/images/SK_OnePortal_logo.png';
        $path = (string) config('communications.default_group_avatar', $fallback);
        if ($path === '') {
            $path = $fallback;
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
        if (! SchemaCache::hasTable('official_profiles')) {
            return collect();
        }

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
                SchemaCache::hasColumn('official_profiles', 'federation_position')
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

        if ($this->isCapstoneGroup($conversation)) {
            return $this->types->portalType() === ParticipantTypeResolver::TEACHERS
                && $this->isGroupAdmin($conversation, $user);
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

        if ($this->isCapstoneGroup($conversation)) {
            return $this->types->portalType() === ParticipantTypeResolver::TEACHERS
                && $this->isGroupAdmin($conversation, $user);
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
        if (! $this->isMember($conversation, $user)) {
            return false;
        }

        if (! SchemaCache::hasColumn('conversation_participants', 'participant_role')) {
            if ($this->isCapstoneGroup($conversation)) {
                return $this->types->portalType() === ParticipantTypeResolver::TEACHERS;
            }

            // Without roles, any member may manage a custom (non-default) group.
            return ! $conversation->isDefaultGroup();
        }

        $isAdmin = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', (int) $user->id)
            ->where('participant_role', ConversationParticipant::ROLE_ADMIN)
            ->exists();

        if ($isAdmin) {
            return true;
        }

        // Capstone fallback: any teacher member may manage if no admin row was assigned yet.
        if ($this->isCapstoneGroup($conversation)
            && $this->types->portalType() === ParticipantTypeResolver::TEACHERS
        ) {
            $hasAnyAdmin = ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('participant_role', ConversationParticipant::ROLE_ADMIN)
                ->exists();

            return ! $hasAnyAdmin;
        }

        return false;
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
            abort(403, $this->isCapstoneGroup($conversation)
                ? 'Only a teacher group admin can rename this group.'
                : ($conversation->isDefaultGroup()
                    ? 'Only the SK Federation President or Vice President can rename this group.'
                    : 'Only a group admin can rename this group.'));
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

    public function updateAvatar(Conversation $conversation, Authenticatable $user, ?UploadedFile $file = null): Conversation
    {
        if (! $this->canChangeAvatar($conversation, $user)) {
            abort(403, $this->isCapstoneGroup($conversation)
                ? 'Only a teacher group admin can change this group photo.'
                : ($conversation->isDefaultGroup()
                    ? 'Only the SK Federation President can change this group photo.'
                    : 'Only a group admin can change this group photo.'));
        }

        if (! $conversation->isGroup()) {
            abort(422, 'Only group chats support a custom photo.');
        }

        // Restore default avatar (no file).
        if ($file === null) {
            $previous = (string) ($conversation->avatar_url ?? '');
            $conversation->avatar_url = null;
            $conversation->save();
            $this->deleteLocalAvatar($previous);

            return $conversation->fresh();
        }

        $url = '';
        if (class_exists(CloudinaryService::class)) {
            try {
                $cloudinary = app(CloudinaryService::class);
                if (method_exists($cloudinary, 'isConfigured') && $cloudinary->isConfigured()) {
                    $uploaded = $cloudinary->uploadGroupChatAvatar($file);
                    $url = trim((string) ($uploaded['url'] ?? ''));
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        if ($url === '') {
            $path = $file->store('comms/group-avatars', 'public');
            $url = $path ? url(\Illuminate\Support\Facades\Storage::disk('public')->url($path)) : '';
        }

        if ($url === '') {
            abort(502, 'Unable to upload group photo.');
        }

        $previous = (string) ($conversation->avatar_url ?? '');

        $conversation->avatar_url = $url;
        $conversation->save();
        $this->deleteLocalAvatar($previous);

        return $conversation->fresh();
    }

    /**
     * Remove a previously uploaded local group photo so replaced files do not
     * pile up in storage.
     */
    protected function deleteLocalAvatar(?string $url): void
    {
        $url = trim((string) $url);
        if ($url === '' || str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return;
        }

        $path = parse_url($url, PHP_URL_PATH) ?: $url;
        $marker = '/storage/';
        if (! str_contains($path, $marker)) {
            return;
        }

        $relative = ltrim(substr($path, strpos($path, $marker) + strlen($marker)), '/');
        if ($relative === '') {
            return;
        }

        try {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($relative);
        } catch (\Throwable $e) {
            report($e);
        }
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
        $hasOfficialProfiles = SchemaCache::hasTable('official_profiles');
        $hasBarangays = SchemaCache::hasTable('barangays');

        $load = ['participants.user'];
        if ($hasOfficialProfiles) {
            $load[] = 'participants.user.officialProfile';
        }
        if ($hasBarangays) {
            $load[] = 'participants.user.barangay';
        }
        $conversation->loadMissing($load);

        $rankMap = $hasOfficialProfiles ? $this->federationPositionRankMap() : [];
        $isFederationGroup = $hasOfficialProfiles
            && $conversation->default_group_type === self::TYPE_SK_FEDERATIONS;

        return $conversation->participants
            ->sortBy(function (ConversationParticipant $participant) use ($rankMap, $isFederationGroup, $hasOfficialProfiles) {
                $user = $participant->user;
                $name = mb_strtolower((string) ($user?->name ?? ''), 'UTF-8');

                if (! $hasOfficialProfiles) {
                    return $name;
                }

                $profile = ($user && $user->relationLoaded('officialProfile'))
                    ? $user->getRelation('officialProfile')
                    : null;

                if ($isFederationGroup) {
                    $fed = mb_strtolower(trim((string) ($profile?->federation_position ?? '')), 'UTF-8');
                    $rank = $rankMap[$fed] ?? 1000;

                    return sprintf('%04d-%s', $rank, $name);
                }

                $position = mb_strtolower(trim((string) ($profile?->position ?? '')), 'UTF-8');
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
            ->map(function (ConversationParticipant $participant) use ($conversations, $hasOfficialProfiles) {
                return $this->serializeMember($participant, $conversations, $hasOfficialProfiles);
            })
            ->all();
    }

    /**
     * Serialize a single participant row.
     *
     * @return array<string, mixed>
     */
    public function serializeMember(
        ConversationParticipant $participant,
        ConversationService $conversations,
        bool $hasOfficialProfiles = false
    ): array {
        $user = $participant->user;
        $serialized = $conversations->serializeUser($user, $participant->user_type) ?? [
            'id' => (int) $participant->user_id,
            'name' => 'User',
        ];

        $serialized['participant_role'] = $participant->participant_role
            ?? ConversationParticipant::ROLE_MEMBER;
        $serialized['joined_at'] = optional($participant->joined_at)?->toIso8601String();

        $profile = ($hasOfficialProfiles && $user && $user->relationLoaded('officialProfile'))
            ? $user->getRelation('officialProfile')
            : null;
        $serialized['federation_position'] = $profile?->federation_position;
        $serialized['position'] = $profile?->federation_position
            ?: $profile?->position
            ?: ($serialized['position'] ?? null);

        return $serialized;
    }

    /**
     * Paginated member list. The page is resolved in the database so large
     * groups never load every participant into memory.
     *
     * @return array{members: list<array<string,mixed>>, total: int, page: int, per_page: int, has_more: bool}
     */
    public function memberPage(
        Conversation $conversation,
        ConversationService $conversations,
        int $page = 1,
        int $perPage = 50
    ): array {
        $perPage = max(1, min($perPage, 100));
        $page = max(1, $page);

        $base = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id);

        $total = (clone $base)->count();

        $rows = $base->orderBy('id')->forPage($page, $perPage)->get();

        $users = User::query()
            ->whereIn('id', $rows->pluck('user_id')->map(fn ($id) => (int) $id)->all())
            ->get()
            ->keyBy('id');

        $members = $rows->map(function (ConversationParticipant $participant) use ($users, $conversations) {
            $participant->setRelation('user', $users->get((int) $participant->user_id));

            return $this->serializeMember($participant, $conversations);
        })->values()->all();

        return [
            'members' => $members,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'has_more' => ($page * $perPage) < $total,
        ];
    }
}
