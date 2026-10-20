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
    public function notifyIncoming(Call $call, string $peerName = 'Incoming caller'): void
    {
        $url = rtrim((string) (env('SUPABASE_URL') ?: env('VITE_SUPABASE_URL') ?: ''), '/');
        $key = (string) (env('SUPABASE_SECRET_KEY')
            ?: env('SUPABASE_SERVICE_ROLE_KEY')
            ?: env('SUPABASE_PUBLISHABLE_KEY')
            ?: env('VITE_SUPABASE_PUBLISHABLE_KEY')
            ?: '');

        if ($url === '' || $key === '') {
            return;
        }

        $payload = [
            'type' => 'incoming-call',
            'call_id' => (int) $call->id,
            'conversation_id' => (int) $call->conversation_id,
            'call_type' => (string) $call->call_type,
            'caller_id' => (int) $call->caller_id,
            'caller_type' => (string) $call->caller_type,
            'receiver_id' => (int) $call->receiver_id,
            'receiver_type' => (string) $call->receiver_type,
            'peer_name' => $peerName,
            'from_name' => $peerName,
            'from_user_id' => (int) $call->caller_id,
            'from_user_type' => (string) $call->caller_type,
        ];

        $topics = $this->inboxTopics((string) $call->receiver_type, (int) $call->receiver_id);
        if ($call->conversation_id) {
            $topics[] = 'comms-signal-'.(int) $call->conversation_id;
        }
        $topics = array_values(array_unique(array_filter($topics)));

        $endpoint = $url.'/realtime/v1/api/broadcast';
        $messages = [];
        foreach ($topics as $topic) {
            $messages[] = [
                'topic' => $topic,
                'event' => 'webrtc',
                'payload' => $payload,
            ];
            // Some Realtime deployments expect the realtime: prefix.
            $messages[] = [
                'topic' => 'realtime:'.$topic,
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
