<?php

namespace App\Modules\Communications\Services;

use App\Models\Barangay;
use App\Models\User;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Models\Message;
use App\Services\BarangayLogoUrlService;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use App\Modules\Communications\Support\SchemaCache;
use Illuminate\Support\Facades\Storage;

class ConversationService
{
    /** @var array<int, string|null> */
    protected array $logoCache = [];

    public function __construct(
        protected ParticipantTypeResolver $types,
        protected BarangayLogoUrlService $barangayLogos,
        protected DefaultGroupChatService $defaultGroups,
    ) {}

    public function isParticipant(Conversation $conversation, Authenticatable $user, ?string $userType = null): bool
    {
        if ($conversation->isGroup()) {
            return ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('user_id', (int) $user->id)
                ->exists();
        }

        $userType ??= $this->types->portalType();
        $types = $this->types->equivalentTypes($userType);
        if ($types === []) {
            $types = [$userType];
        }

        return ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', (int) $user->id)
            ->whereIn('user_type', $types)
            ->exists();
    }

    public function findOrCreatePrivate(Authenticatable $authUser, int $otherUserId): Conversation
    {
        $authType = $this->types->portalType();
        $other = User::query()->findOrFail($otherUserId);

        if ((int) $other->id === (int) $authUser->id) {
            abort(422, 'Cannot start a conversation with yourself.');
        }

        if (! $this->canMessage($authUser, $other)) {
            abort(403, 'You are not allowed to message this account.');
        }

        $otherType = $this->types->fromUser($other);

        $existingId = $this->findPrivateConversationId(
            (int) $authUser->id,
            $authType,
            (int) $other->id,
            $otherType
        );

        if ($existingId) {
            return Conversation::query()->findOrFail($existingId);
        }

        return DB::transaction(function () use ($authUser, $authType, $other, $otherType) {
            $conversation = Conversation::query()->create([
                'conversation_type' => 'private',
            ]);

            ConversationParticipant::query()->create([
                'conversation_id' => $conversation->id,
                'user_id' => (int) $authUser->id,
                'user_type' => $authType,
                'joined_at' => now(),
            ]);

            ConversationParticipant::query()->create([
                'conversation_id' => $conversation->id,
                'user_id' => (int) $other->id,
                'user_type' => $otherType,
                'joined_at' => now(),
            ]);

            return $conversation;
        });
    }

    /**
     * Create a custom (non-default) group chat with the given members.
     *
     * @param  list<int>  $memberUserIds
     */
    public function createGroup(Authenticatable $authUser, array $memberUserIds, ?string $name = null): Conversation
    {
        if ($this->defaultGroups->isLmsPortal()) {
            abort(403, 'Creating additional groups is not allowed. Use the shared Capstone 2 group.');
        }

        $authType = $this->types->portalType();
        $authId = (int) $authUser->id;
        $maxMembers = max(3, (int) config('communications.custom_group_max_members', 50));

        $uniqueIds = collect($memberUserIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0 && $id !== $authId)
            ->unique()
            ->values();

        if ($uniqueIds->count() < 1) {
            abort(422, 'Add at least one other person to create a group.');
        }

        if ($uniqueIds->count() + 1 > $maxMembers) {
            abort(422, 'Groups can have at most '.$maxMembers.' members.');
        }

        $members = User::query()->whereIn('id', $uniqueIds->all())->get()->keyBy('id');
        if ($members->count() !== $uniqueIds->count()) {
            abort(422, 'One or more selected users were not found.');
        }

        foreach ($members as $member) {
            if (! $this->canMessage($authUser, $member)) {
                abort(403, 'You are not allowed to add '.$member->name.' to a group.');
            }
        }

        $groupName = trim(preg_replace('/\s+/u', ' ', (string) $name) ?? '');
        if ($groupName === '') {
            $labels = $members->take(3)->map(fn (User $u) => trim((string) $u->name))->filter()->values();
            $groupName = $labels->isEmpty()
                ? 'Group chat'
                : ($labels->implode(', ').($members->count() > 3 ? '…' : ''));
        }
        if (mb_strlen($groupName) > 120) {
            $groupName = mb_substr($groupName, 0, 120);
        }

        $tenantId = (int) ($authUser->tenant_id ?? 0);

        return DB::transaction(function () use ($authUser, $authType, $authId, $members, $groupName, $maxMembers, $tenantId) {
            $payload = [
                'conversation_type' => Conversation::TYPE_GROUP,
                'name' => $groupName,
                'max_members' => $maxMembers,
            ];
            if (SchemaCache::hasColumn('conversations', 'tenant_id') && $tenantId > 0) {
                $payload['tenant_id'] = $tenantId;
            }

            $conversation = Conversation::query()->create($payload);

            $creatorRow = [
                'conversation_id' => $conversation->id,
                'user_id' => $authId,
                'user_type' => $authType,
                'joined_at' => now(),
            ];
            if (SchemaCache::hasColumn('conversation_participants', 'participant_role')) {
                $creatorRow['participant_role'] = ConversationParticipant::ROLE_ADMIN;
            }
            ConversationParticipant::query()->create($creatorRow);

            foreach ($members as $member) {
                $row = [
                    'conversation_id' => $conversation->id,
                    'user_id' => (int) $member->id,
                    'user_type' => $this->types->fromUser($member),
                    'joined_at' => now(),
                ];
                if (SchemaCache::hasColumn('conversation_participants', 'participant_role')) {
                    $row['participant_role'] = ConversationParticipant::ROLE_MEMBER;
                }
                ConversationParticipant::query()->create($row);
            }

            return $conversation->fresh(['participants.user']);
        });
    }

    public function listForUser(Authenticatable $user, ?string $search = null): Collection
    {
        if (! SchemaCache::hasTable('conversations')
            || ! SchemaCache::hasTable('conversation_participants')
            || ! SchemaCache::hasTable('messages')
        ) {
            return collect();
        }

        $this->defaultGroups->ensureForUser($user);

        $userType = $this->types->portalType();
        $userId = (int) $user->id;

        $conversationIds = ConversationParticipant::query()
            ->where('user_id', $userId)
            ->pluck('conversation_id')
            ->unique()
            ->values();

        if ($conversationIds->isEmpty()) {
            return collect();
        }

        $with = ['participants.user'];
        if (SchemaCache::hasTable('official_profiles')) {
            $with[] = 'participants.user.officialProfile';
        }
        if (SchemaCache::hasTable('barangays')) {
            $with[] = 'participants.user.barangay';
        }

        $conversations = Conversation::query()
            ->whereIn('id', $conversationIds)
            ->with($with)
            ->get();

        $lastMessages = $this->latestVisibleMessages($conversationIds, $userId, $userType);
        $unreadByConversation = $this->unreadCountsByConversation($conversationIds, $userId, $userType);

        $barangayIds = $conversations
            ->flatMap(fn (Conversation $c) => $c->participants)
            ->map(fn (ConversationParticipant $p) => (int) ($p->user?->barangay_id ?? 0))
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values()
            ->all();
        if ($barangayIds !== []) {
            $this->logoCache = $this->barangayLogos->resolveMany($barangayIds) + $this->logoCache;
        }

        $items = $conversations->map(function (Conversation $conversation) use ($user, $userId, $userType, $lastMessages, $unreadByConversation) {
            $last = $lastMessages->get($conversation->id);
            $unread = (int) ($unreadByConversation[$conversation->id] ?? 0);
            $lastBody = $last?->body;
            if ($last && $last->deleted_for_all_at) {
                $lastBody = 'This message was deleted';
            } elseif ($last && (! $lastBody || trim((string) $lastBody) === '')) {
                $lastBody = match ((string) $last->message_type) {
                    'image' => 'Sent a photo',
                    'file' => 'Sent a file',
                    'automation' => 'Sent a message',
                    default => $lastBody,
                };
            } elseif ($last && in_array((string) $last->message_type, ['image', 'file'], true) && is_string($lastBody) && trim($lastBody) !== '') {
                $lastBody = ((string) $last->message_type === 'image' ? '📷 ' : '📎 ').$lastBody;
            }

            $payload = [
                'id' => $conversation->id,
                'conversation_type' => $conversation->conversation_type,
                'name' => $conversation->name,
                'default_group_type' => $conversation->default_group_type,
                'max_members' => $conversation->max_members,
                'member_count' => $conversation->participants->count(),
                'is_default_group' => $conversation->isDefaultGroup(),
                'can_rename' => false,
                'can_change_avatar' => false,
                'member_previews' => [],
                'other_user' => null,
                'last_message' => $last ? [
                    'id' => $last->id,
                    'body' => $lastBody,
                    'message_type' => $last->deleted_for_all_at ? 'deleted' : $last->message_type,
                    'sender_id' => $last->sender_id,
                    'deleted_for_all' => $last->deleted_for_all_at !== null,
                    'created_at' => optional($last->created_at)?->toIso8601String(),
                ] : null,
                'unread_count' => $unread,
                'updated_at' => optional($last?->created_at ?? $conversation->updated_at)?->toIso8601String(),
            ];

            if ($conversation->isGroup()) {
                $groupName = trim((string) ($conversation->name ?: 'Group chat'));
                $max = (int) ($conversation->max_members ?: 0);
                $count = (int) $payload['member_count'];
                $avatar = $this->defaultGroups->groupAvatarUrl($conversation);
                $payload['avatar_url'] = $avatar;
                $payload['can_rename'] = $this->defaultGroups->canRename($conversation, $user);
                $payload['can_change_avatar'] = $this->defaultGroups->canChangeAvatar($conversation, $user);
                $payload['member_previews'] = $conversation->participants
                    ->take(4)
                    ->map(function (ConversationParticipant $p) {
                        $serialized = $this->serializeUser($p->user, $p->user_type);

                        return [
                            'id' => (int) $p->user_id,
                            'name' => (string) ($serialized['name'] ?? $p->user?->name ?? 'User'),
                            'profile_image_url' => (string) ($serialized['profile_image_url'] ?? ''),
                        ];
                    })
                    ->values()
                    ->all();
                $payload['other_user'] = [
                    'id' => null,
                    'name' => $groupName,
                    'user_type' => 'group',
                    'user_type_label' => $this->groupTypeLabel($conversation),
                    'position' => $max > 0 ? ($count.' / '.$max.' members') : ($count.' members'),
                    'barangay_name' => null,
                    'profile_image_url' => $avatar,
                    'online_status' => null,
                    'is_group' => true,
                ];
                if ($payload['last_message'] === null) {
                    $payload['last_message'] = [
                        'id' => null,
                        'body' => 'No messages yet',
                        'message_type' => 'system',
                        'sender_id' => null,
                        'deleted_for_all' => false,
                        'created_at' => optional($conversation->created_at)?->toIso8601String(),
                    ];
                }

                return $payload;
            }

            $other = $conversation->participants
                ->first(fn (ConversationParticipant $p) => ! ((int) $p->user_id === $userId && $p->user_type === $userType));

            if ($other?->user && $this->isPureSkFedAdministrator($other->user)) {
                return null;
            }

            $payload['other_user'] = $this->serializeUser($other?->user, $other?->user_type);

            return $payload;
        })->filter()->values();

        if ($search !== null && trim($search) !== '') {
            $q = mb_strtolower(trim($search));
            $items = $items->filter(function (array $item) use ($q) {
                $name = mb_strtolower((string) ($item['other_user']['name'] ?? $item['name'] ?? ''));

                return str_contains($name, $q);
            })->values();
        }

        return $items->sortByDesc(function (array $item): int {
            $iso = (string) ($item['updated_at'] ?? '');
            $ts = $iso !== '' ? strtotime($iso) : false;

            return $ts !== false ? (int) $ts : 0;
        })->values();
    }

    public function groupTypeLabel(Conversation $conversation): string
    {
        return match ((string) $conversation->default_group_type) {
            DefaultGroupChatService::TYPE_SK_OFFICIALS => 'SK Officials group',
            DefaultGroupChatService::TYPE_SK_FEDERATIONS => 'SK Federations group',
            DefaultGroupChatService::TYPE_CAPSTONE => 'Shared class group',
            default => 'Group chat',
        };
    }

    public function showPayload(Conversation $conversation, Authenticatable $user): array
    {
        $userType = $this->types->portalType();
        $userId = (int) $user->id;

        $conversation->load(['participants.user']);

        if ($conversation->isGroup()) {
            $memberCount = $conversation->participants->count();
            $max = (int) ($conversation->max_members ?: 0);
            $groupName = trim((string) ($conversation->name ?: 'Group chat'));
            $avatar = $this->defaultGroups->groupAvatarUrl($conversation);

            $owner = null;
            if ($this->defaultGroups->isCapstoneGroup($conversation)) {
                $admin = $conversation->participants->first(
                    fn (ConversationParticipant $p) => ($p->participant_role ?? '') === ConversationParticipant::ROLE_ADMIN
                );
                if (! $admin) {
                    $admin = $conversation->participants->first(
                        fn (ConversationParticipant $p) => in_array(
                            strtolower((string) $p->user_type),
                            ['teachers', 'teacher', 'sk_official'],
                            true
                        )
                    );
                }
                if ($admin) {
                    $owner = $this->serializeUser($admin->user, $admin->user_type);
                }
            }

            return [
                'id' => $conversation->id,
                'conversation_type' => $conversation->conversation_type,
                'name' => $groupName,
                'default_group_type' => $conversation->default_group_type,
                'max_members' => $max ?: null,
                'member_count' => $memberCount,
                'is_default_group' => $conversation->isDefaultGroup(),
                'is_capstone_group' => $this->defaultGroups->isCapstoneGroup($conversation),
                'can_rename' => $this->defaultGroups->canRename($conversation, $user),
                'can_change_avatar' => $this->defaultGroups->canChangeAvatar($conversation, $user),
                'call_max_participants' => (int) config('communications.call_max_participants', 8),
                'avatar_url' => $avatar,
                'created_at' => optional($conversation->created_at)?->toIso8601String(),
                'owner' => $owner,
                'member_previews' => $conversation->participants
                    ->take(4)
                    ->map(function (ConversationParticipant $p) {
                        $serialized = $this->serializeUser($p->user, $p->user_type);

                        return [
                            'id' => (int) $p->user_id,
                            'name' => (string) ($serialized['name'] ?? $p->user?->name ?? 'User'),
                            'profile_image_url' => (string) ($serialized['profile_image_url'] ?? ''),
                        ];
                    })
                    ->values()
                    ->all(),
                'other_user' => [
                    'id' => null,
                    'name' => $groupName,
                    'user_type' => 'group',
                    'user_type_label' => $this->groupTypeLabel($conversation),
                    'position' => $max > 0 ? ($memberCount.' / '.$max.' members') : ($memberCount.' members'),
                    'barangay_name' => null,
                    'profile_image_url' => $avatar,
                    'online_status' => null,
                    'is_group' => true,
                ],
                'members' => $this->defaultGroups->serializeMembers($conversation, $this),
            ];
        }

        $other = $conversation->participants
            ->first(fn (ConversationParticipant $p) => ! ((int) $p->user_id === $userId && $p->user_type === $userType));

        return [
            'id' => $conversation->id,
            'conversation_type' => $conversation->conversation_type,
            'name' => null,
            'default_group_type' => null,
            'max_members' => null,
            'member_count' => $conversation->participants->count(),
            'is_default_group' => false,
            'can_rename' => false,
            'can_change_avatar' => false,
            'call_max_participants' => (int) config('communications.call_max_participants', 8),
            'other_user' => $this->serializeUser($other?->user, $other?->user_type),
            'members' => [],
        ];
    }

    public function markRead(Conversation $conversation, Authenticatable $user): void
    {
        $userType = $this->types->portalType();
        $userId = (int) $user->id;

        $latestMessageId = (int) (Message::query()
            ->where('conversation_id', $conversation->id)
            ->max('id') ?? 0);

        $types = $this->types->equivalentTypes($userType);
        if ($types === []) {
            $types = [$userType];
        }

        $payload = ['last_read_at' => now()];
        if (SchemaCache::hasColumn('conversation_participants', 'last_read_message_id') && $latestMessageId > 0) {
            // The read cursor never moves backwards. It is resolved in PHP so
            // the statement stays portable across database drivers.
            $current = (int) (ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('user_id', $userId)
                ->whereIn('user_type', $types)
                ->max('last_read_message_id') ?? 0);

            $payload['last_read_message_id'] = max($current, $latestMessageId);
        }

        ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $userId)
            ->whereIn('user_type', $types)
            ->update($payload);
    }

    public function markAllRead(Authenticatable $user): void
    {
        $this->advanceReadCursor((int) $user->id, $this->viewerTypes());
    }

    public function unreadTotalForUser(Authenticatable $user): int
    {
        $row = $this->unreadMessagesQuery((int) $user->id, $this->viewerTypes())
            ->selectRaw('COUNT(DISTINCT m.id) as unread')
            ->first();

        return (int) ($row->unread ?? 0);
    }

    public function searchUsers(Authenticatable $authUser, string $query): Collection
    {
        $q = trim($query);
        if ($q === '') {
            return collect();
        }

        $limit = (int) config('communications.search_limit', 20);
        $viewerType = $this->types->portalType();

        $builder = User::query()
            ->where('is_active', true)
            ->where('id', '!=', (int) $authUser->id)
            ->where(function (Builder $inner) use ($q) {
                $like = '%'.$q.'%';
                if (DB::connection()->getDriverName() === 'pgsql') {
                    $inner->where('name', 'ilike', $like)
                        ->orWhere('username', 'ilike', $like)
                        ->orWhere('student_id', 'ilike', $like);
                } else {
                    $inner->whereRaw('LOWER(COALESCE(name, \'\')) LIKE ?', [mb_strtolower($like)])
                        ->orWhereRaw('LOWER(COALESCE(username, \'\')) LIKE ?', [mb_strtolower($like)])
                        ->orWhereRaw('LOWER(COALESCE(student_id, \'\')) LIKE ?', [mb_strtolower($like)]);
                }
            });

        if ($viewerType === ParticipantTypeResolver::STUDENTS) {
            $builder->where('role', 'teachers');
        } elseif ($viewerType === ParticipantTypeResolver::TEACHERS) {
            $builder->whereIn('role', ['students', 'teachers']);
        } else {
            $builder->whereIn('role', $this->types->searchableRoles());
        }

        return $builder->orderBy('name')
            ->limit($limit)
            ->get()
            ->filter(fn (User $user) => $this->canMessage($authUser, $user))
            ->values()
            ->map(fn (User $user) => $this->serializeUser($user, $this->types->fromUser($user)));
    }

    /**
     * Directory listing for quick message/call.
     * Filters: chairpersons | officials | federation
     *
     * @return array{users: Collection, groups: array<int, array{title: string, users: array}>}
     */
    public function directory(Authenticatable $authUser, string $filter = 'officials', ?int $barangayId = null): array
    {
        $viewerType = $this->types->portalType();
        $role = $viewerType === ParticipantTypeResolver::STUDENTS ? 'teachers' : null;

        $query = User::query()
            ->where('is_active', true)
            ->where('id', '!=', (int) $authUser->id);

        if ($role) {
            $query->where('role', $role);
        } else {
            $query->whereIn('role', ['students', 'teachers']);
        }

        $users = $query->orderBy('name')
            ->limit(300)
            ->get()
            ->filter(fn (User $user) => $this->canMessage($authUser, $user))
            ->values();

        $mapped = $users->map(fn (User $user) => $this->serializeUser($user, $this->types->fromUser($user)));

        $title = $viewerType === ParticipantTypeResolver::STUDENTS ? 'Teachers' : 'People';

        return [
            'users' => $mapped,
            'groups' => [
                [
                    'title' => $title,
                    'users' => $mapped->values()->all(),
                ],
            ],
        ];
    }

    /**
     * @return Collection<int, array{id:int,name:string}>
     */
    public function barangayOptions(): Collection
    {
        $barangayClass = Barangay::class;
        if (! class_exists($barangayClass) || ! SchemaCache::hasTable('barangays')) {
            return collect();
        }

        return $barangayClass::query()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
            ])
            ->values();
    }

    /**
     * Messaging rules:
     * - Kabataan: SK Officials (same barangay when known; otherwise any active official)
     * - SK Official: any active Kabataan, any SK Official (not pure sk_fed admins)
     * - SK Federation: active kabataan / sk_official accounts
     */
    public function canMessage(Authenticatable $from, User $to): bool
    {
        if ((int) $from->id === (int) $to->id) {
            return false;
        }

        if (! $this->userIsActive($to)) {
            return false;
        }

        $toType = $this->types->normalizeSearchRole((string) $to->role);
        if ($toType === null) {
            return false;
        }

        $fromType = $this->types->portalType();

        // Students may message teachers. Teachers may message students and other teachers.
        return match ($fromType) {
            ParticipantTypeResolver::STUDENTS => $toType === ParticipantTypeResolver::TEACHERS,
            ParticipantTypeResolver::TEACHERS => in_array($toType, [
                ParticipantTypeResolver::STUDENTS,
                ParticipantTypeResolver::TEACHERS,
            ], true),
            default => false,
        };
    }

    protected function userIsActive(User $user): bool
    {
        if (array_key_exists('is_active', $user->getAttributes()) || isset($user->is_active)) {
            return (bool) $user->is_active;
        }

        return strtoupper((string) ($user->status ?? '')) === User::STATUS_ACTIVE;
    }

    public function assertCanMessagePeer(Conversation $conversation, Authenticatable $user): void
    {
        if ($conversation->isGroup()) {
            if (! $this->isParticipant($conversation, $user)) {
                abort(403, 'You are not a member of this group.');
            }

            return;
        }

        $peer = $this->resolvePrivatePeerUser($conversation, $user);
        if (! $peer || ! $this->canMessage($user, $peer)) {
            abort(403, 'You are not allowed to message this account.');
        }
    }

    /**
     * Call authorization for an existing conversation.
     * Allows SK Official ↔ Kabataan (and other canMessage pairs).
     * Existing 1:1 participants may call when roles are call-compatible
     * even if barangay messaging filters would otherwise block.
     */
    public function assertCanCallPeer(Conversation $conversation, Authenticatable $user): void
    {
        if (! $this->isParticipant($conversation, $user)) {
            abort(403, 'You are not allowed to call this account.');
        }

        if ($conversation->isGroup()) {
            return;
        }

        $peer = $this->resolvePrivatePeerUser($conversation, $user);
        if (! $peer) {
            abort(403, 'Conversation peer not found.');
        }

        if ($this->canMessage($user, $peer) || $this->rolesAllowCall($user, $peer)) {
            return;
        }

        abort(403, 'You are not allowed to call this account.');
    }

    public function resolvePrivatePeerUser(Conversation $conversation, Authenticatable $user): ?User
    {
        $userType = $this->types->portalType();
        $callerTypes = $this->types->equivalentTypes($userType);
        if ($callerTypes === []) {
            $callerTypes = [$userType];
        }

        $other = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where(function ($query) use ($user, $callerTypes) {
                $query->where('user_id', '!=', (int) $user->id)
                    ->orWhereNotIn('user_type', $callerTypes);
            })
            ->orderByRaw('CASE WHEN user_id = ? THEN 1 ELSE 0 END', [(int) $user->id])
            ->first();

        if (! $other || ((int) $other->user_id === (int) $user->id && $this->types->typesMatch($other->user_type, $userType))) {
            return null;
        }

        return User::query()->find($other->user_id);
    }

    public function rolesAllowCall(Authenticatable $from, User $to): bool
    {
        return $this->canMessage($from, $to);
    }

    /**
     * Resolve barangay from users.barangay_id, then kabataan_registrations when needed.
     */
    public function resolveUserBarangayId(Authenticatable|User $user): int
    {
        $barangayId = (int) ($user->barangay_id ?? 0);
        if ($barangayId > 0) {
            return $barangayId;
        }

        $userId = (int) ($user->id ?? 0);
        if ($userId <= 0 || ! SchemaCache::hasTable('kabataan_registrations')) {
            return 0;
        }

        $registrationBarangayId = DB::table('kabataan_registrations')
            ->where('user_id', $userId)
            ->orderByDesc('id')
            ->value('barangay_id');

        return $registrationBarangayId !== null ? (int) $registrationBarangayId : 0;
    }

    /**
     * Pure SK Federations portal administrators (role sk_fed / admin),
     * plus the bootstrap "SK Federation Administrator" account by name/email.
     * SK Officials who also hold a federation_position remain messageable.
     */
    public function isPureSkFedAdministrator(User $user): bool
    {
        $role = strtolower(trim((string) ($user->role ?? '')));
        if ($role === User::ROLE_SK_FED || $role === 'admin') {
            return true;
        }

        return $this->isBootstrapFederationAdministratorName($user);
    }

    public function isBootstrapFederationAdministratorName(User $user): bool
    {
        $name = mb_strtolower(trim((string) ($user->name ?? '')), 'UTF-8');
        if ($name === 'sk federation administrator'
            || str_contains($name, 'federation administrator')
            || str_contains($name, 'sk federation admin')
        ) {
            return true;
        }

        $email = strtolower(trim((string) ($user->email ?? '')));

        return $email === 'skoneportal@gmail.com';
    }

    public function isSearchableUser(User $user, ?Authenticatable $viewer = null): bool
    {
        if ($viewer) {
            return $this->canMessage($viewer, $user);
        }

        if (! $this->userIsActive($user)) {
            return false;
        }

        return $this->types->normalizeSearchRole((string) $user->role) !== null;
    }

    /**
     * @return array{online_status: string, last_seen: ?string}
     */
    protected function resolvePresence(User $user): array
    {
        $lastSeen = null;
        if (SchemaCache::hasColumn('users', 'last_seen') && $user->last_seen) {
            try {
                $lastSeen = $user->last_seen instanceof \Illuminate\Support\Carbon
                    ? $user->last_seen
                    : \Illuminate\Support\Carbon::parse($user->last_seen);
            } catch (\Throwable) {
                $lastSeen = null;
            }
        }

        $status = '';
        if (SchemaCache::hasColumn('users', 'online_status')) {
            $status = strtolower(trim((string) ($user->online_status ?? '')));
        }

        $isOnline = false;
        if ($status === 'offline') {
            $isOnline = false;
        } elseif ($status === 'online' && $lastSeen) {
            // Heartbeat every ~45s; allow a generous window for remote DB latency.
            $isOnline = $lastSeen->gte(now()->subMinutes(3));
        } elseif ($status === 'online') {
            $isOnline = true;
        } elseif ($lastSeen) {
            $isOnline = $lastSeen->gte(now()->subMinutes(3));
        }

        return [
            'online_status' => $isOnline ? 'online' : 'offline',
            'last_seen' => $lastSeen?->toIso8601String(),
        ];
    }

    public function serializeUser(?User $user, ?string $type = null): ?array
    {
        if (! $user) {
            return null;
        }

        $type ??= $this->types->normalizeSearchRole((string) $user->role) ?? $this->types->fromUser($user);

        $presence = $this->resolvePresence($user);
        $online = $presence['online_status'];
        $lastSeen = $presence['last_seen'];

        $hasBarangays = SchemaCache::hasTable('barangays');
        $hasOfficialProfiles = SchemaCache::hasTable('official_profiles');

        if ($hasBarangays && ! $user->relationLoaded('barangay') && method_exists($user, 'barangay')) {
            try {
                $user->loadMissing('barangay');
            } catch (\Throwable) {
                // Optional relation for SK portals only.
            }
        }
        if ($hasOfficialProfiles && ! $user->relationLoaded('officialProfile') && method_exists($user, 'officialProfile')) {
            try {
                $user->loadMissing('officialProfile');
            } catch (\Throwable) {
                // Optional relation for SK portals only.
            }
        }

        $position = null;
        if ($hasOfficialProfiles && $user->relationLoaded('officialProfile')) {
            $profile = $user->getRelation('officialProfile');
            $position = $profile?->position
                ?: $profile?->federation_position
                ?: null;
        }

        $barangayName = null;
        if ($hasBarangays && $user->relationLoaded('barangay')) {
            $barangayName = $user->getRelation('barangay')?->name;
        }

        return [
            'id' => (int) $user->id,
            'name' => (string) ($user->name ?: (method_exists($user, 'displayName') ? $user->displayName() : 'User')),
            'role' => (string) $user->role,
            'user_type' => $type,
            'user_type_label' => $this->types->label($type),
            'profile_image_url' => $this->resolveAvatarUrl($user, (string) $type),
            'online_status' => $online,
            'last_seen' => $lastSeen,
            'barangay_id' => (int) ($user->barangay_id ?? 0) ?: null,
            'barangay_name' => $barangayName,
            'position' => $position,
        ];
    }

    /**
     * Match Community Feed avatar rules:
     * Kabataan → profile photo; Officials/Federation → barangay logo (Federation fallback = portal logo).
     */
    protected function resolveAvatarUrl(User $user, string $type): ?string
    {
        $profile = '';
        if (SchemaCache::hasColumn('users', 'profile_image_url')) {
            $profile = trim((string) ($user->profile_image_url ?? ''));
        }
        if ($profile === '' && SchemaCache::hasColumn('users', 'profile_image')) {
            $profile = trim((string) ($user->profile_image ?? ''));
        }

        return $profile !== '' ? $this->normalizeMediaUrl($profile) : null;
    }

    protected function normalizeMediaUrl(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return $value;
        }

        if (preg_match('#^https?://#i', $value) === 1) {
            return $value;
        }

        if (str_starts_with($value, '//')) {
            return 'https:'.$value;
        }

        if (str_starts_with($value, '/')) {
            return url($value);
        }

        if (str_starts_with($value, 'storage/')) {
            return asset($value);
        }

        try {
            return Storage::disk('public')->url($value);
        } catch (\Throwable $e) {
            return asset($value);
        }
    }

    protected function findPrivateConversationId(int $aId, string $aType, int $bId, string $bType): ?int
    {
        $rows = DB::table('conversation_participants as cp1')
            ->join('conversation_participants as cp2', 'cp1.conversation_id', '=', 'cp2.conversation_id')
            ->join('conversations as c', 'c.id', '=', 'cp1.conversation_id')
            ->where('c.conversation_type', 'private')
            ->where('cp1.user_id', $aId)
            ->where('cp1.user_type', $aType)
            ->where('cp2.user_id', $bId)
            ->where('cp2.user_type', $bType)
            ->select('c.id')
            ->limit(1)
            ->value('id');

        return $rows ? (int) $rows : null;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, int>|array<int, int>  $conversationIds
     * @return \Illuminate\Support\Collection<int, Message>
     */
    protected function latestVisibleMessages($conversationIds, int $userId, string $userType): Collection
    {
        $ids = collect($conversationIds)->filter()->values();
        if ($ids->isEmpty()) {
            return collect();
        }

        $latest = Message::query()
            ->selectRaw('MAX(id) as id')
            ->whereIn('conversation_id', $ids);

        if (SchemaCache::hasTable('message_hides')) {
            $latest->whereDoesntHave('hides', function ($hideQuery) use ($userId, $userType) {
                $hideQuery->where('user_id', $userId);
                if (SchemaCache::hasColumn('message_hides', 'user_type')) {
                    $hideQuery->where('user_type', $userType);
                }
            });
        }

        $latestIds = $latest->groupBy('conversation_id')->pluck('id');
        if ($latestIds->isEmpty()) {
            return collect();
        }

        return Message::query()
            ->whereIn('id', $latestIds)
            ->get()
            ->keyBy('conversation_id');
    }

    /**
     * @param  \Illuminate\Support\Collection<int, int>|array<int, int>  $conversationIds
     * @return array<int, int>
     */
    protected function unreadCountsByConversation($conversationIds, int $userId, string $userType): array
    {
        $ids = collect($conversationIds)->filter()->map(fn ($id) => (int) $id)->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }

        return $this->unreadMessagesQuery($userId, $this->viewerTypes($userType))
            ->whereIn('m.conversation_id', $ids->all())
            ->selectRaw('m.conversation_id, COUNT(DISTINCT m.id) as unread')
            ->groupBy('m.conversation_id')
            ->pluck('unread', 'conversation_id')
            ->mapWithKeys(fn ($count, $id) => [(int) $id => (int) $count])
            ->all();
    }

    /**
     * @return list<string>
     */
    protected function viewerTypes(?string $userType = null): array
    {
        $userType ??= $this->types->portalType();
        $types = $this->types->equivalentTypes($userType);

        return $types === [] ? [$userType] : $types;
    }

    /**
     * Move this user's read cursor to the latest message in every chat they belong to.
     *
     * @param  list<string>  $types
     */
    protected function advanceReadCursor(int $userId, array $types): void
    {
        if ($types === []) {
            return;
        }

        $hasCursor = SchemaCache::hasColumn('conversation_participants', 'last_read_message_id');
        $now = now();
        $placeholders = implode(',', array_fill(0, count($types), '?'));
        $bindings = array_merge([$now, $userId], $types);
        $pgsql = DB::connection()->getDriverName() === 'pgsql';

        DB::transaction(function () use ($hasCursor, $pgsql, $placeholders, $bindings, $now, $userId, $types): void {
            // GREATEST() is not available on every driver, MAX() with two
            // arguments works on SQLite and MySQL as well.
            $cursorSql = $hasCursor
                ? ($pgsql
                    ? ', last_read_message_id = GREATEST(COALESCE(cp.last_read_message_id, 0), COALESCE(latest.max_id, 0))'
                    : ', cp.last_read_message_id = MAX(COALESCE(cp.last_read_message_id, 0), COALESCE(latest.max_id, 0))')
                : '';

            if ($pgsql) {
                DB::update(
                    "UPDATE conversation_participants AS cp
                     SET last_read_at = ?{$cursorSql}
                     FROM (
                         SELECT conversation_id, MAX(id) AS max_id
                         FROM messages
                         GROUP BY conversation_id
                     ) AS latest
                     WHERE cp.conversation_id = latest.conversation_id
                       AND cp.user_id = ?
                       AND cp.user_type IN ({$placeholders})",
                    $bindings
                );
            } else {
                DB::update(
                    "UPDATE conversation_participants AS cp
                     INNER JOIN (
                         SELECT conversation_id, MAX(id) AS max_id
                         FROM messages
                         GROUP BY conversation_id
                     ) AS latest ON latest.conversation_id = cp.conversation_id
                     SET cp.last_read_at = ?{$cursorSql}
                     WHERE cp.user_id = ?
                       AND cp.user_type IN ({$placeholders})",
                    $bindings
                );
            }

            DB::table('conversation_participants')
                ->where('user_id', $userId)
                ->whereIn('user_type', $types)
                ->update(['last_read_at' => $now]);
        });
    }

    /**
     * Messages still unread for this user: one join from messages to that user's read cursor.
     *
     * @param  list<string>  $types
     */
    protected function unreadMessagesQuery(int $userId, array $types)
    {
        $hasCursor = SchemaCache::hasColumn('conversation_participants', 'last_read_message_id');
        $cursors = DB::table('conversation_participants')
            ->select('conversation_id')
            ->where('user_id', $userId)
            ->whereIn('user_type', $types)
            ->groupBy('conversation_id');

        if ($hasCursor) {
            $cursors->selectRaw('MAX(COALESCE(last_read_message_id, 0)) as last_read_message_id');
        } else {
            $cursors->selectRaw('MAX(last_read_at) as last_read_at');
        }

        $query = DB::table('messages as m')
            ->joinSub($cursors, 'cp', 'cp.conversation_id', '=', 'm.conversation_id')
            ->where('m.sender_id', '!=', $userId);

        if (SchemaCache::hasColumn('messages', 'deleted_for_all_at')) {
            $query->whereNull('m.deleted_for_all_at');
        }

        if (SchemaCache::hasTable('message_hides')) {
            $query->whereNotExists(function ($hidden) use ($userId, $types) {
                $hidden->selectRaw('1')
                    ->from('message_hides as h')
                    ->whereColumn('h.message_id', 'm.id')
                    ->where('h.user_id', $userId);
                if (SchemaCache::hasColumn('message_hides', 'user_type')) {
                    $hidden->whereIn('h.user_type', $types);
                }
            });
        }

        if ($hasCursor) {
            $query->whereRaw('m.id > cp.last_read_message_id');
        } else {
            $query->where(function ($q) {
                $q->whereNull('cp.last_read_at')
                    ->orWhereColumn('m.created_at', '>', 'cp.last_read_at');
            });
        }

        return $query;
    }

    protected function unreadCountForParticipant(
        int $conversationId,
        ?ConversationParticipant $mine,
        int $userId,
        string $userType
    ): int {
        $query = Message::query()
            ->where('conversation_id', $conversationId)
            ->where('sender_id', '!=', $userId);

        if (SchemaCache::hasColumn('messages', 'deleted_for_all_at')) {
            $query->whereNull('deleted_for_all_at');
        }

        $lastReadMessageId = (int) ($mine?->last_read_message_id ?? 0);
        if ($lastReadMessageId > 0 && SchemaCache::hasColumn('conversation_participants', 'last_read_message_id')) {
            $query->where('id', '>', $lastReadMessageId);
        } elseif ($mine?->last_read_at) {
            $query->where('created_at', '>', $mine->last_read_at);
        }

        return (int) $query->count();
    }
}
