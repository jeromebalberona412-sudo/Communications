<?php

namespace App\Modules\Communications\Services;

use App\Modules\Communications\Models\Call;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Push incoming-call signals through Supabase Realtime HTTP broadcast
 * so the callee gets the modal even when the browser missed a client broadcast.
 */
class CallRealtimeNotifier
{
    /**
     * @param  list<array{id:int,type:string}>  $extraReceivers  Group invitees (id + portal type).
     * @param  array<string, mixed>  $callerProfile  Caller identity for the incoming modal.
     */
    public function notifyIncoming(
        Call $call,
        string $peerName = 'Incoming caller',
        array $extraReceivers = [],
        array $callerProfile = []
    ): void {
        $url = rtrim((string) (env('SUPABASE_URL') ?: env('VITE_SUPABASE_URL') ?: ''), '/');
        $key = (string) (env('SUPABASE_SECRET_KEY')
            ?: env('SUPABASE_SERVICE_ROLE_KEY')
            ?: env('SUPABASE_PUBLISHABLE_KEY')
            ?: env('VITE_SUPABASE_PUBLISHABLE_KEY')
            ?: '');

        if ($url === '' || $key === '') {
            return;
        }

        $isGroup = (int) $call->caller_id === (int) $call->receiver_id
            && (string) $call->caller_type === (string) $call->receiver_type;

        $callerProfile = array_merge([
            'name' => $peerName,
            'profile_image_url' => '',
            'user_type' => (string) $call->caller_type,
            'user_id' => (int) $call->caller_id,
        ], $callerProfile);

        $payload = [
            'type' => $isGroup ? 'group-invite' : 'incoming-call',
            'call_id' => (int) $call->id,
            'conversation_id' => (int) $call->conversation_id,
            'call_type' => (string) $call->call_type,
            'caller_id' => (int) $call->caller_id,
            'caller_type' => (string) $call->caller_type,
            'receiver_id' => (int) $call->receiver_id,
            'receiver_type' => (string) $call->receiver_type,
            'is_group_call' => $isGroup,
            'peer_name' => $peerName,
            'from_name' => $peerName,
            'from_user_id' => (int) $call->caller_id,
            'from_user_type' => (string) $call->caller_type,
            'caller_profile' => $callerProfile,
            // The receiver must ignore invitations that already expired.
            'created_at' => optional($call->created_at)?->toIso8601String(),
            'expires_at' => optional($call->created_at)?->copy()
                ->addSeconds((int) config('communications.call_ring_timeout_seconds', 60))
                ->toIso8601String(),
        ];

        $topics = [];
        if ($isGroup) {
            foreach ($extraReceivers as $receiver) {
                $id = (int) ($receiver['id'] ?? 0);
                $type = (string) ($receiver['type'] ?? '');
                if ($id <= 0) {
                    continue;
                }
                $topics[] = $this->primaryInboxTopic($type, $id);
            }
        } else {
            $topics[] = $this->primaryInboxTopic((string) $call->receiver_type, (int) $call->receiver_id);
        }

        if ($call->conversation_id) {
            $topics[] = 'comms-signal-'.(int) $call->conversation_id;
        }
        $topics = array_values(array_unique(array_filter($topics)));

        if ($topics === []) {
            return;
        }

        $endpoint = $url.'/realtime/v1/api/broadcast';
        // Publish once per topic (no realtime: duplicate). Client-side shownIncomingIds
        // also dedupes; double fan-out caused duplicate ring UI / ringtone restarts.
        $messages = [];
        foreach ($topics as $topic) {
            $messages[] = [
                'topic' => $topic,
                'event' => 'webrtc',
                'payload' => $payload,
            ];
        }

        try {
            Http::timeout(3)
                ->withHeaders([
                    'apikey' => $key,
                    'Authorization' => 'Bearer '.$key,
                    'Content-Type' => 'application/json',
                ])
                ->post($endpoint, ['messages' => $messages]);
        } catch (\Throwable $e) {
            Log::warning('comms.call_realtime_notify_failed', [
                'call_id' => $call->id,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * The single inbox topic a receiver listens on.
     *
     * The client subscribes to its portal inbox topic, so publishing the
     * invitation once keeps the delivery fast and avoids the same event
     * arriving several times.
     */
    protected function primaryInboxTopic(string $receiverType, int $receiverId): string
    {
        if ($receiverId <= 0) {
            return '';
        }

        $type = strtolower(trim((string) $receiverType));
        if ($type === '') {
            return '';
        }

        return 'comms-inbox-'.$type.'-'.$receiverId;
    }

    /**
     * @return list<string>
     */
    protected function inboxTopics(string $receiverType, int $receiverId): array
    {
        if ($receiverId <= 0) {
            return [];
        }

        $aliases = app(ParticipantTypeResolver::class)->equivalentTypes($receiverType);
        if ($aliases === []) {
            $aliases = [$receiverType];
        }

        $topics = [];
        foreach ($aliases as $alias) {
            $alias = strtolower(trim((string) $alias));
            if ($alias === '') {
                continue;
            }
            $topics[] = 'comms-inbox-'.$alias.'-'.$receiverId;
        }

        return $topics;
    }
}
