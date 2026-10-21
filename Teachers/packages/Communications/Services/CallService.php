<?php

namespace App\Modules\Communications\Services;

use App\Models\User;
use App\Modules\Communications\Models\Call;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Models\Message;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CallService
{
    /** Unanswered rings older than this are treated as missed. */
    protected const STALE_RINGING_SECONDS = 60;

    /**
     * Accepted calls that stopped sending heartbeats for this long are treated
     * as ended (tab closed / browser crashed). The client heartbeats every
     * 30s while connected, so three missed beats mean the call is really dead.
     */
    protected const STALE_ACCEPTED_SECONDS = 180;

    protected ?Message $lastCallNotice = null;

    public function pullLastCallNotice(): ?Message
    {
        $notice = $this->lastCallNotice;
        $this->lastCallNotice = null;

        return $notice;
    }
    public function __construct(
        protected ParticipantTypeResolver $types,
        protected ConversationService $conversations,
        protected CallRealtimeNotifier $realtimeNotifier
    ) {}

    public function start(
        Conversation $conversation,
        Authenticatable $caller,
        string $callType,
        ?int $receiverUserId = null
    ): Call {
        if (! $this->conversations->isParticipant($conversation, $caller)) {
            abort(403);
        }

        $this->conversations->assertCanCallPeer($conversation, $caller);

        $callType = strtolower(trim($callType));
        if (! in_array($callType, [Call::TYPE_VOICE, Call::TYPE_VIDEO], true)) {
            abort(422, 'Invalid call type.');
        }

        $callMax = max(2, (int) config('communications.call_max_participants', 8));
        if ($callMax < 2) {
            $callMax = 2;
        }

        $callerType = $this->types->portalType();
        $callerId = (int) $caller->id;
        $isGroupCall = false;
        $other = null;
        $receiverType = null;
        $receiverId = null;

        $otherQuery = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', '!=', $callerId);

        if ($conversation->isGroup()) {
            if ($receiverUserId !== null) {
                $other = (clone $otherQuery)->where('user_id', $receiverUserId)->first();
                if (! $other) {
                    abort(403, 'Call recipient must be a member of this group.');
                }
            } else {
                $others = $otherQuery->get();
                if ($others->isEmpty()) {
                    abort(422, 'No call recipients found in this group.');
                }
                $isGroupCall = true;
                $other = null;
            }
        } else {
            $callerTypes = $this->types->equivalentTypes($callerType);
            if ($callerTypes === []) {
                $callerTypes = [$callerType];
            }
            $other = ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where(function ($query) use ($callerId, $callerTypes) {
                    $query->where('user_id', '!=', $callerId)
                        ->orWhereNotIn('user_type', $callerTypes);
                })
                ->orderByRaw('CASE WHEN user_id = ? THEN 1 ELSE 0 END', [$callerId])
                ->first();
        }

        if (! $isGroupCall && ! $other) {
            abort(422, 'No call recipient found.');
        }

        if (! $isGroupCall && $other) {
            $receiverId = (int) $other->user_id;
            $peerUser = User::query()->find($receiverId);
            try {
                $receiverType = $peerUser
                    ? $this->types->fromUser($peerUser)
                    : ($this->types->canonicalType($other->user_type) ?: $other->user_type);
            } catch (\InvalidArgumentException) {
                $receiverType = $this->types->canonicalType($other->user_type) ?: $other->user_type;
            }
            $receiverType = $this->types->canonicalType($receiverType) ?: (string) $receiverType;
        }

        $memberCount = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->count();

        if ($isGroupCall && $memberCount > $callMax) {
            // Soft cap: still allow the call; clients limit connected mesh peers.
        }

        $call = DB::transaction(function () use (
            $conversation,
            $caller,
            $callType,
            $callerId,
            $callerType,
            $isGroupCall,
            $receiverId,
            $receiverType
        ) {
            $this->releaseStaleActiveCalls();
            // Caller is starting a new outbound call — abandon their own unanswered rings.
            $this->cancelCallerOutboundRinging($callerId);
            $this->assertParticipantsAvailableForCall($callerId, $isGroupCall ? null : $receiverId);

            $call = Call::query()->create([
                'conversation_id' => $conversation->id,
                'caller_id' => $callerId,
                'caller_type' => $callerType,
                'receiver_id' => $isGroupCall ? $callerId : $receiverId,
                'receiver_type' => $isGroupCall ? $callerType : $receiverType,
                'call_type' => $callType,
                'status' => Call::STATUS_RINGING,
            ]);

            Log::info('CALL_CREATED', [
                'call_id' => $call->id,
                'caller_id' => $callerId,
                'caller_type' => $callerType,
                'receiver_id' => $isGroupCall ? $callerId : $receiverId,
                'receiver_type' => $isGroupCall ? $callerType : $receiverType,
                'call_type' => $callType,
                'conversation_id' => $conversation->id,
                'is_group' => $isGroupCall,
                'status' => $call->status,
            ]);

            // Chat bubble while ringing — not "connected". Modal is the Answer/Decline UI.
            $label = $callType === Call::TYPE_VIDEO ? 'Video call' : 'Voice call';
            $prefix = $isGroupCall ? 'Group ' : '';
            $this->postCallMessage($call, $caller, $prefix.$label.' ringing…');

            return $call;
        });

        // After commit: push ring to callee inbox(es) so Students/Teachers get the modal immediately.
        $peerName = method_exists($caller, 'displayName')
            ? (string) $caller->displayName()
            : (string) ($caller->name ?? 'Incoming caller');
        $extraReceivers = [];
        if ($isGroupCall) {
            $extraReceivers = ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('user_id', '!=', $callerId)
                ->get(['user_id', 'user_type'])
                ->map(fn (ConversationParticipant $row) => [
                    'id' => (int) $row->user_id,
                    'type' => (string) $row->user_type,
                ])
                ->values()
                ->all();
        }
        $this->realtimeNotifier->notifyIncoming(
            $call,
            $peerName !== '' ? $peerName : 'Incoming caller',
            $extraReceivers,
            $this->callerProfile($caller)
        );

        return $call;
    }

    /**
     * Identity of the caller, broadcast with the invitation so the incoming
     * modal can show the real name and photo without another round trip.
     *
     * @return array<string, mixed>
     */
    public function callerProfile(Authenticatable $caller): array
    {
        $name = method_exists($caller, 'displayName')
            ? (string) $caller->displayName()
            : (string) ($caller->name ?? 'Incoming caller');

        $serialized = null;
        try {
            $serialized = $this->conversations->serializeUser(
                $caller instanceof User ? $caller : null,
                $this->types->portalType()
            );
        } catch (\Throwable $e) {
            report($e);
        }

        return [
            'name' => $name !== '' ? $name : 'Incoming caller',
            'profile_image_url' => (string) ($serialized['profile_image_url'] ?? ''),
            'user_type' => (string) $this->types->portalType(),
            'user_id' => (int) $caller->id,
        ];
    }

    /**
     * End any ringing/accepted calls for a user (logout / session teardown).
     *
     * @return list<Call>
     */
    public function endActiveCallsForUser(Authenticatable $user): array
    {
        $userId = (int) $user->id;
        $ended = [];

        DB::transaction(function () use ($userId, $user, &$ended) {
            $this->releaseStaleActiveCalls();

            $active = Call::query()
                ->whereIn('status', Call::ACTIVE_STATUSES)
                ->where(function ($q) use ($userId) {
                    $q->where('caller_id', $userId)->orWhere('receiver_id', $userId);
                })
                ->lockForUpdate()
                ->get();

            foreach ($active as $call) {
                $call->status = Call::STATUS_ENDED;
                $call->ended_at = now();
                $call->duration_seconds = $this->durationBetween($call, $call->ended_at);
                $call->save();
                $this->postCallMessage($call, $user, ($call->call_type === Call::TYPE_VIDEO ? 'Video call' : 'Voice call').' ended');
                $ended[] = $call;
            }
        });

        return $ended;
    }

    /**
     * Release abandoned ringing / accepted rows so they cannot permanently block new calls.
     */
    protected function releaseStaleActiveCalls(): void
    {
        $now = now();

        $staleRings = Call::query()
            ->where('status', Call::STATUS_RINGING)
            ->whereNull('started_at')
            ->where('created_at', '<', $now->copy()->subSeconds(self::STALE_RINGING_SECONDS))
            ->with('caller')
            ->get();

        foreach ($staleRings as $call) {
            $call->status = Call::STATUS_MISSED;
            $call->ended_at = $now;
            $call->save();
            $actor = $call->caller;
            if (! $actor instanceof User) {
                continue;
            }
            $alreadyNoted = Message::query()
                ->where('conversation_id', $call->conversation_id)
                ->where('message_type', 'call')
                ->where('body', 'like', 'Missed %')
                ->where('created_at', '>=', $call->created_at)
                ->exists();
            if ($alreadyNoted) {
                continue;
            }
            $this->postCallMessage($call, $actor, (string) $this->statusMessageBody($call, Call::STATUS_MISSED));
        }

        Call::query()
            ->where('status', Call::STATUS_ACCEPTED)
            ->where('updated_at', '<', $now->copy()->subSeconds(self::STALE_ACCEPTED_SECONDS))
            ->get()
            ->each(function (Call $call) use ($now): void {
                // Reconcile the dead call with a real terminal row so the
                // duration is preserved instead of silently lost.
                $call->status = Call::STATUS_ENDED;
                $call->ended_at = $now;
                $call->duration_seconds = $this->durationBetween($call, $now);
                $call->save();
            });
    }

    /**
     * Authoritative call duration in seconds.
     *
     * Uses the persisted connection timestamps (started_at / answered_at) and
     * the terminal timestamp, never a client-side timer.
     */
    public function durationBetween(Call $call, ?\DateTimeInterface $end = null): ?int
    {
        $start = $call->started_at ?: $call->answered_at;
        if (! $start) {
            return null;
        }

        $endTs = $end ? $end->getTimestamp() : ($call->ended_at ? $call->ended_at->getTimestamp() : null);
        if ($endTs === null) {
            return null;
        }

        return max(0, (int) $endTs - (int) $start->getTimestamp());
    }

    /**
     * Keep an active call alive while the browser is connected.
     *
     * Terminal calls are never revived — a completed call must not lock the
     * participant out of future calls.
     */
    public function heartbeat(Call $call, Authenticatable $user): Call
    {
        $this->assertCanActOnCall($call, $user);

        if (! in_array($call->status, Call::ACTIVE_STATUSES, true) || $call->ended_at !== null) {
            return $call;
        }

        $call->forceFill(['updated_at' => now()])->save();

        return $call;
    }

    /**
     * The one call the user is currently in, according to the database.
     *
     * Only `ringing` and `accepted` rows without `ended_at` count as active;
     * declined / cancelled / missed / failed / ended calls never do.
     */
    public function activeCallForUser(Authenticatable $user): ?Call
    {
        $userId = (int) $user->id;
        if ($userId <= 0) {
            return null;
        }

        $this->releaseStaleActiveCalls();

        $types = $this->types->equivalentTypes($this->types->portalType());
        if ($types === []) {
            $types = [$this->types->portalType()];
        }

        return Call::query()
            ->whereIn('status', Call::ACTIVE_STATUSES)
            ->whereNull('ended_at')
            ->where(function ($q) use ($userId, $types) {
                $q->where(function ($inner) use ($userId, $types) {
                    $inner->where('caller_id', $userId)->whereIn('caller_type', $types);
                })->orWhere(function ($inner) use ($userId, $types) {
                    $inner->where('receiver_id', $userId)->whereIn('receiver_type', $types);
                });
            })
            ->orderByDesc('id')
            ->first();
    }

    /**
     * When the same user starts another outbound call, cancel their unanswered rings.
     * Prevents false "already on a call" after a failed/cancelled client attempt left status=ringing.
     */
    protected function cancelCallerOutboundRinging(int $callerId): void
    {
        $now = now();
        Call::query()
            ->where('status', Call::STATUS_RINGING)
            ->where('caller_id', $callerId)
            ->update([
                'status' => Call::STATUS_CANCELLED,
                'ended_at' => $now,
                'updated_at' => $now,
            ]);
    }

    protected function assertParticipantsAvailableForCall(int $callerId, ?int $receiverId): void
    {
        $active = Call::query()
            ->whereIn('status', Call::ACTIVE_STATUSES)
            ->whereNull('ended_at')
            ->where(function ($q) use ($callerId, $receiverId) {
                $q->where('caller_id', $callerId)
                    ->orWhere('receiver_id', $callerId);

                if ($receiverId !== null && $receiverId > 0) {
                    $q->orWhere('caller_id', $receiverId)
                        ->orWhere('receiver_id', $receiverId);
                }
            })
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        // Re-filter after lock: ignore terminal rows and group-placeholder ringing
        // (caller_id == receiver_id) which must not permanently lock the host out.
        $active = $active->filter(function (Call $call) use ($callerId) {
            if (! in_array($call->status, Call::ACTIVE_STATUSES, true) || $call->ended_at !== null) {
                return false;
            }
            if ($this->isGroupCall($call) && $call->status === Call::STATUS_RINGING
                && (int) $call->caller_id === $callerId
            ) {
                return false;
            }

            return true;
        })->values();

        foreach ($active as $call) {
            $isGroupStub = $this->isGroupCall($call);
            $callIsCaller = (int) $call->caller_id === $callerId;
            $callIsReceiver = ! $isGroupStub && (int) $call->receiver_id === $callerId;

            // An *accepted* call means both sides are really connected.
            // A *ringing* call only means the caller is busy — being the
            // callee of an unanswered ring must never block the callee.
            $userIsBusy = $call->status === Call::STATUS_ACCEPTED
                ? ($callIsCaller || $callIsReceiver)
                : $callIsCaller;

            if (! $userIsBusy && $call->status === Call::STATUS_ACCEPTED && $isGroupStub) {
                // Accepted group call: every member of the room is busy.
                $userIsBusy = ConversationParticipant::query()
                    ->where('conversation_id', $call->conversation_id)
                    ->where('user_id', $callerId)
                    ->exists();
            }

            if ($userIsBusy) {
                Log::info('CALL VALIDATION', [
                    'user' => $callerId,
                    'recipient' => $receiverId,
                    'existing_active_call' => $call->id,
                    'caller_id' => $call->caller_id,
                    'receiver_id' => $call->receiver_id,
                    'status' => $call->status,
                    'created_at' => (string) $call->created_at,
                    'updated_at' => (string) $call->updated_at,
                    'result' => 'REJECT',
                    'reason' => 'caller_busy',
                ]);
                abort(409, 'You are currently on another call. Please end your current call first.');
            }

            if ($receiverId !== null && $receiverId > 0
                && ((int) $call->caller_id === $receiverId || (int) $call->receiver_id === $receiverId)
            ) {
                // The target is only busy when they are connected or placing
                // their own outbound ring.
                $targetBusy = $call->status === Call::STATUS_ACCEPTED
                    || (int) $call->caller_id === $receiverId;

                if ($targetBusy) {
                    Log::info('CALL VALIDATION', [
                        'user' => $callerId,
                        'recipient' => $receiverId,
                        'existing_active_call' => $call->id,
                        'caller_id' => $call->caller_id,
                        'receiver_id' => $call->receiver_id,
                        'status' => $call->status,
                        'created_at' => (string) $call->created_at,
                        'updated_at' => (string) $call->updated_at,
                        'result' => 'REJECT',
                        'reason' => 'recipient_busy',
                    ]);
                    abort(409, 'This person is currently on another call. Please wait.');
                }
            }
        }

        Log::info('CALL VALIDATION', [
            'user' => $callerId,
            'recipient' => $receiverId,
            'existing_active_call' => 'NONE',
            'result' => 'ALLOW',
        ]);
    }

    public function updateStatus(Call $call, Authenticatable $user, string $status): Call
    {
        $this->assertCanActOnCall($call, $user);

        $status = strtolower(trim($status));
        $allowed = [
            Call::STATUS_ACCEPTED,
            Call::STATUS_REJECTED,
            Call::STATUS_MISSED,
            Call::STATUS_CANCELLED,
            Call::STATUS_ENDED,
        ];

        if (! in_array($status, $allowed, true)) {
            abort(422, 'Invalid call status.');
        }

        $previous = $call->status;
        if ($previous === $status) {
            return $call;
        }

        $terminal = [
            Call::STATUS_ENDED,
            Call::STATUS_REJECTED,
            Call::STATUS_MISSED,
            Call::STATUS_CANCELLED,
        ];
        if (in_array($previous, $terminal, true)) {
            return $call;
        }
        if ($status === Call::STATUS_MISSED && ($previous === Call::STATUS_ACCEPTED || $call->started_at !== null)) {
            return $call;
        }

        $isGroupCall = $this->isGroupCall($call);
        if ($isGroupCall && in_array($status, [Call::STATUS_REJECTED, Call::STATUS_MISSED], true)
            && (int) $call->caller_id !== (int) $user->id) {
            return $call;
        }

        $call->status = $status;

        if ($status === Call::STATUS_ACCEPTED) {
            $answeredAt = now();
            if (! $call->answered_at) {
                $call->answered_at = $answeredAt;
            }
            if (! $call->started_at) {
                $call->started_at = $answeredAt;
            }
        }

        if (in_array($status, [Call::STATUS_ENDED, Call::STATUS_REJECTED, Call::STATUS_MISSED, Call::STATUS_CANCELLED], true)) {
            if ($isGroupCall && $status === Call::STATUS_ENDED && (int) $call->caller_id !== (int) $user->id) {
                return $call;
            }

            $call->ended_at = now();
            if ($status === Call::STATUS_ENDED) {
                // Authoritative duration from the persisted connection timestamps.
                $call->duration_seconds = $this->durationBetween($call, $call->ended_at);
            } else {
                $call->duration_seconds = null;
            }
        }

        $call->save();

        $body = $this->statusMessageBody($call, $status);
        if ($body !== null) {
            $this->postCallMessage($call, $user, $body);
        }

        return $call;
    }

    public function historyForUser(Authenticatable $user, int $limit = 50): Collection
    {
        $userId = (int) $user->id;
        $userType = $this->types->portalType();
        $types = $this->types->equivalentTypes($userType);
        if ($types === []) {
            $types = [$userType];
        }

        return Call::query()
            ->where(function ($q) use ($userId, $types) {
                $q->where(function ($inner) use ($userId, $types) {
                    $inner->where('caller_id', $userId)->whereIn('caller_type', $types);
                })->orWhere(function ($inner) use ($userId, $types) {
                    $inner->where('receiver_id', $userId)->whereIn('receiver_type', $types);
                })->orWhere(function ($inner) use ($userId) {
                    $inner->whereColumn('caller_id', 'receiver_id')
                        ->whereIn('conversation_id', function ($sub) use ($userId) {
                            $sub->select('conversation_id')
                                ->from('conversation_participants')
                                ->where('user_id', $userId);
                        });
                });
            })
            ->with(['caller', 'receiver', 'conversation'])
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (Call $call) => $this->serialize($call, $user));
    }

    /**
     * Active unanswered inbound rings for this portal user (fast poll for incoming modal).
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function ringingForUser(Authenticatable $user): Collection
    {
        $this->releaseStaleActiveCalls();

        $userId = (int) $user->id;
        $userType = $this->types->portalType();
        $types = $this->types->equivalentTypes($userType);
        if ($types === []) {
            $types = [$userType];
        }

        $direct = Call::query()
            ->where('status', Call::STATUS_RINGING)
            ->where('receiver_id', $userId)
            ->whereIn('receiver_type', $types)
            ->whereColumn('caller_id', '!=', 'receiver_id')
            ->with(['caller', 'receiver', 'conversation'])
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        // Group mesh rings store receiver_id = caller_id. Include rooms where this user
        // is a participant (not the host) so Answer/Decline can appear without a refresh.
        $memberConversationIds = ConversationParticipant::query()
            ->where('user_id', $userId)
            ->pluck('conversation_id')
            ->unique()
            ->values()
            ->all();

        $group = collect();
        if ($memberConversationIds !== []) {
            $group = Call::query()
                ->where('status', Call::STATUS_RINGING)
                ->whereIn('conversation_id', $memberConversationIds)
                ->whereColumn('caller_id', '=', 'receiver_id')
                ->where('caller_id', '!=', $userId)
                ->with(['caller', 'receiver', 'conversation'])
                ->orderByDesc('id')
                ->limit(5)
                ->get();
        }

        return $direct->concat($group)
            ->unique('id')
            ->sortByDesc('id')
            ->take(5)
            ->values()
            ->map(fn (Call $call) => $this->serialize($call, $user));
    }

    public function serialize(Call $call, Authenticatable $viewer): array
    {
        $viewerType = $this->types->portalType();
        $isGroupCall = $this->isGroupCall($call);
        $isCaller = (int) $call->caller_id === (int) $viewer->id && $this->types->typesMatch($call->caller_type, $viewerType);
        $peer = $isCaller ? $call->receiver : $call->caller;
        $peerType = $isCaller ? $call->receiver_type : $call->caller_type;

        $conversation = $call->relationLoaded('conversation')
            ? $call->conversation
            : $call->conversation()->first();

        $peerPayload = $isGroupCall
            ? [
                'id' => 0,
                'name' => $conversation?->name ?: 'Group call',
                'is_group' => true,
                'profile_image_url' => $conversation?->avatar_url,
            ]
            : $this->conversations->serializeUser($peer instanceof User ? $peer : null, $peerType);

        $invitees = [];
        if ($isGroupCall && $conversation) {
            $invitees = ConversationParticipant::query()
                ->where('conversation_id', $conversation->id)
                ->where('user_id', '!=', (int) $viewer->id)
                ->with('user')
                ->get()
                ->map(function (ConversationParticipant $row) {
                    return [
                        'id' => (int) $row->user_id,
                        'user_type' => $row->user_type,
                        'name' => $row->user?->name ?? 'Member',
                    ];
                })
                ->values()
                ->all();
        }

        return [
            'id' => $call->id,
            'conversation_id' => $call->conversation_id,
            'call_type' => $call->call_type,
            'status' => $call->status,
            'caller_id' => (int) $call->caller_id,
            'caller_type' => $call->caller_type,
            'receiver_id' => (int) $call->receiver_id,
            'receiver_type' => $call->receiver_type,
            'is_group_call' => $isGroupCall,
            'call_max_participants' => (int) config('communications.call_max_participants', 8),
            'invitees' => $invitees,
            'started_at' => optional($call->started_at)?->toIso8601String(),
            'answered_at' => optional($call->answered_at)?->toIso8601String(),
            'ended_at' => optional($call->ended_at)?->toIso8601String(),
            'duration_seconds' => $call->duration_seconds,
            'direction' => $isCaller ? 'outgoing' : 'incoming',
            'peer' => $peerPayload,
            'created_at' => optional($call->created_at)?->toIso8601String(),
            // Server clock reference: the browser uses it to correct its own
            // clock so both participants show the same call duration.
            'server_time' => now()->toIso8601String(),
        ];
    }

    public function isGroupCall(Call $call): bool
    {
        return (int) $call->caller_id === (int) $call->receiver_id
            && (string) $call->caller_type === (string) $call->receiver_type;
    }

    protected function statusMessageBody(Call $call, string $status): ?string
    {
        $isGroup = $this->isGroupCall($call);
        $label = ($isGroup ? 'Group ' : '').($call->call_type === Call::TYPE_VIDEO ? 'Video call' : 'Voice call');

        return match ($status) {
            Call::STATUS_ACCEPTED => $label.' answered',
            Call::STATUS_ENDED => $label.' ended'
                .($call->duration_seconds ? ' · '.$this->formatDuration((int) $call->duration_seconds) : ''),
            Call::STATUS_MISSED => 'Call ended. No pickup.',
            Call::STATUS_REJECTED => $label.' declined',
            Call::STATUS_CANCELLED => $label.' cancelled',
            default => null,
        };
    }

    protected function formatDuration(int $seconds): string
    {
        $m = intdiv(max(0, $seconds), 60);
        $s = max(0, $seconds) % 60;

        return sprintf('%d:%02d', $m, $s);
    }

    protected function postCallMessage(Call $call, Authenticatable $actor, string $body): Message
    {
        $message = Message::query()->create([
            'conversation_id' => $call->conversation_id,
            'sender_id' => (int) $actor->id,
            'sender_type' => $this->types->portalType(),
            'body' => $body,
            'message_type' => 'call',
        ]);
        $this->lastCallNotice = $message;

        Conversation::query()->whereKey($call->conversation_id)->update([
            'updated_at' => now(),
        ]);

        return $message;
    }

    protected function assertCanActOnCall(Call $call, Authenticatable $user): void
    {
        $userId = (int) $user->id;
        try {
            $userType = $this->types->fromUser($user);
        } catch (\InvalidArgumentException) {
            $userType = $this->types->portalType();
        }

        $isCaller = (int) $call->caller_id === $userId && $this->types->typesMatch($call->caller_type, $userType);
        $isReceiver = (int) $call->receiver_id === $userId && $this->types->typesMatch($call->receiver_type, $userType);

        if ($isCaller || $isReceiver) {
            return;
        }

        if ($this->isGroupCall($call)) {
            $inRoom = ConversationParticipant::query()
                ->where('conversation_id', $call->conversation_id)
                ->where('user_id', $userId)
                ->exists();
            if ($inRoom) {
                return;
            }
        }

        abort(403);
    }
}
