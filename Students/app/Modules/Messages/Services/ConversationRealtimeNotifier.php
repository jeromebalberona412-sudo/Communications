<?php

namespace App\Modules\Messages\Services;

use App\Modules\Messages\Models\Conversation;
use App\Modules\Messages\Models\ConversationParticipant;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Push group metadata changes (name, photo) through Supabase Realtime HTTP
 * broadcast so every member sees the update without polling.
 */
class ConversationRealtimeNotifier
{
    public function notifyGroupUpdated(Conversation $conversation, array $payload = []): void
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

        $body = array_merge([
            'type' => 'group-updated',
            'conversation_id' => (int) $conversation->id,
            'name' => (string) ($conversation->name ?? ''),
            'avatar_url' => (string) ($conversation->avatar_url ?? ''),
            'conversation_type' => (string) ($conversation->conversation_type ?? ''),
            'updated_at' => now()->toIso8601String(),
        ], $payload);

        $topics = $this->participantTopics($conversation);
        $topics[] = 'comms-signal-'.(int) $conversation->id;
        $topics = array_values(array_unique(array_filter($topics)));

        if ($topics === []) {
            return;
        }

        $messages = [];
        foreach ($topics as $topic) {
            $messages[] = [
                'topic' => $topic,
                'event' => 'webrtc',
                'payload' => $body,
            ];
        }

        try {
            Http::timeout(3)
                ->withHeaders([
                    'apikey' => $key,
                    'Authorization' => 'Bearer '.$key,
                    'Content-Type' => 'application/json',
                ])
                ->post($url.'/realtime/v1/api/broadcast', ['messages' => $messages]);
        } catch (\Throwable $e) {
            Log::warning('comms.conversation_realtime_notify_failed', [
                'conversation_id' => $conversation->id,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Fan a stored message out after the database commit.
     * The sender is skipped; their own screen already has the saved row.
     *
     * @param  array<string, mixed>  $message
     */
    public function notifyMessage(Conversation $conversation, array $message, int $senderId, string $senderType): void
    {
        $this->publish($conversation, 'message', ['message' => $message], $senderId, $senderType);
    }

    public function notifyRead(Conversation $conversation, int $readerId, string $readerType, int $lastReadMessageId): void
    {
        if ($lastReadMessageId <= 0) {
            return;
        }

        $this->publish($conversation, 'message-read', [
            'type' => 'read',
            'conversation_id' => (int) $conversation->id,
            'reader_id' => $readerId,
            'reader_type' => $readerType,
            'last_read_message_id' => $lastReadMessageId,
        ], $readerId, $readerType);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    protected function publish(Conversation $conversation, string $event, array $payload, int $exceptUserId, string $exceptUserType): void
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

        $except = $this->identityKeys($exceptUserId, $exceptUserType);
        $topics = [];
        foreach ($this->participantTopics($conversation) as $topic) {
            $identity = $this->topicIdentity($topic);
            if ($identity !== '' && isset($except[$identity])) {
                continue;
            }
            $topics[] = $topic;
        }
        $topics[] = 'comms-signal-'.(int) $conversation->id;
        $topics = array_values(array_unique(array_filter($topics)));
        if ($topics === []) {
            return;
        }

        $messages = [];
        foreach ($topics as $topic) {
            $messages[] = [
                'topic' => $topic,
                'event' => $event,
                'payload' => $payload,
            ];
        }

        try {
            Http::timeout(2)
                ->withHeaders([
                    'apikey' => $key,
                    'Authorization' => 'Bearer '.$key,
                    'Content-Type' => 'application/json',
                ])
                ->post($url.'/realtime/v1/api/broadcast', ['messages' => $messages]);
        } catch (\Throwable $e) {
            Log::warning('comms.message_realtime_notify_failed', [
                'conversation_id' => $conversation->id,
                'event' => $event,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @return array<string, true>
     */
    protected function identityKeys(int $userId, string $userType): array
    {
        if ($userId <= 0) {
            return [];
        }
        $resolver = app(ParticipantTypeResolver::class);
        $aliases = $resolver->equivalentTypes($userType);
        if ($aliases === []) {
            $aliases = [$userType];
        }
        $keys = [];
        foreach ($aliases as $alias) {
            $alias = strtolower(trim((string) $alias));
            if ($alias === '') {
                continue;
            }
            $keys[$alias.'-'.$userId] = true;
        }

        return $keys;
    }

    protected function topicIdentity(string $topic): string
    {
        $prefix = 'comms-inbox-';
        if (! str_starts_with($topic, $prefix)) {
            return '';
        }

        return substr($topic, strlen($prefix));
    }

    /**
     * @return list<string>
     */
    protected function participantTopics(Conversation $conversation): array
    {
        $resolver = app(ParticipantTypeResolver::class);

        $rows = ConversationParticipant::query()
            ->where('conversation_id', $conversation->id)
            ->get(['user_id', 'user_type']);

        $topics = [];
        foreach ($rows as $row) {
            $userId = (int) $row->user_id;
            if ($userId <= 0) {
                continue;
            }

            $aliases = $resolver->equivalentTypes((string) $row->user_type);
            if ($aliases === []) {
                $aliases = [(string) $row->user_type];
            }

            foreach ($aliases as $alias) {
                $alias = strtolower(trim((string) $alias));
                if ($alias === '') {
                    continue;
                }
                $topics[] = 'comms-inbox-'.$alias.'-'.$userId;
            }
        }

        return $topics;
    }
}
