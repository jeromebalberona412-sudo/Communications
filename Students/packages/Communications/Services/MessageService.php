<?php

namespace App\Modules\Communications\Services;

use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\Message;
use App\Modules\Communications\Models\MessageAttachment;
use App\Modules\Communications\Models\MessageHide;
use App\Modules\Communications\Models\MessageReaction;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use App\Modules\Communications\Support\SchemaCache;
use RuntimeException;

class MessageService
{
    public function __construct(
        protected ParticipantTypeResolver $types,
        protected ConversationService $conversations,
        protected MessageAttachmentStorageService $attachmentStorage,
        protected MessageAttachmentValidator $attachmentValidator
    ) {}

    /**
     * @return list<string>
     */
    public function allowedReactions(): array
    {
        $configured = config('communications.reaction_emojis', []);

        return is_array($configured) && $configured !== []
            ? array_values(array_map('strval', $configured))
            : ['👍', '❤️', '😆', '😮', '😢', '🙏'];
    }

    public function paginate(Conversation $conversation, Authenticatable $user, ?int $beforeId = null): Collection
    {
        if (! $this->conversations->isParticipant($conversation, $user)) {
            abort(403);
        }

        if (! SchemaCache::hasTable('messages')) {
            return collect();
        }

        $perPage = (int) config('communications.messages_per_page', 40);

        $userId = (int) $user->id;
        $userType = $this->types->portalType();

        $query = Message::query()
            ->where('conversation_id', $conversation->id);

        if (SchemaCache::hasTable('message_hides')) {
            $query->whereDoesntHave('hides', function ($hideQuery) use ($userId, $userType) {
                $hideQuery->where('user_id', $userId);
                if (SchemaCache::hasColumn('message_hides', 'user_type')) {
                    $hideQuery->where('user_type', $userType);
                }
            });
        }

        $with = ['sender'];
        if (SchemaCache::hasTable('message_reactions')) {
            $with[] = 'reactions.user';
        }
        if (SchemaCache::hasTable('message_attachments')) {
            $with[] = 'attachments';
        }

        $query->with($with)
            ->orderByDesc('id');

        if ($beforeId) {
            $query->where('id', '<', $beforeId);
        }

        return $query->limit($perPage)->get()->sortBy('id')->values()
            ->map(fn (Message $message) => $this->serialize($message, $user));
    }

    public function send(Conversation $conversation, Authenticatable $user, string $body): Message
    {
        return $this->sendMessage($conversation, $user, $body, null);
    }

    public function sendWithAttachment(
        Conversation $conversation,
        Authenticatable $user,
        string $body,
        UploadedFile $file
    ): Message {
        return $this->sendMessage($conversation, $user, $body, $file);
    }

    protected function sendMessage(
        Conversation $conversation,
        Authenticatable $user,
        string $body,
        ?UploadedFile $file
    ): Message {
        if (! $this->conversations->isParticipant($conversation, $user)) {
            abort(403);
        }

        $this->conversations->assertCanMessagePeer($conversation, $user);

        // Preserve spaces; do not trim the typed message body.
        $body = str_replace(["\r\n", "\r"], "\n", (string) $body);
        $max = (int) config('communications.message_max_length', 1000);
        $maxLines = (int) config('communications.message_max_lines', 500);

        if (mb_strlen($body) > $max) {
            abort(422, 'Message must be '.$max.' characters or less (including spaces and new lines).');
        }

        $lineCount = $body === '' ? 0 : count(preg_split("/\r\n|\n|\r/", $body) ?: []);
        if ($lineCount > $maxLines) {
            abort(422, 'Message cannot exceed '.$maxLines.' lines.');
        }

        $attachmentMeta = null;
        $messageType = 'text';

        if ($file !== null) {
            $validated = $this->attachmentValidator->validate($file);
            $kind = $validated['kind'];
            $messageType = $kind === 'image' ? 'image' : 'file';

            try {
                $attachmentMeta = $kind === 'image'
                    ? $this->attachmentStorage->storeImage($validated['file'])
                    : $this->attachmentStorage->storeDocument($validated['file'], (int) $conversation->id);
            } catch (RuntimeException $e) {
                abort(503, $e->getMessage());
            }
        } elseif ($body === '') {
            abort(422, 'Message body is required.');
        }

        try {
            $message = DB::transaction(function () use ($conversation, $user, $body, $messageType, $attachmentMeta) {
                $message = Message::query()->create([
                    'conversation_id' => $conversation->id,
                    'sender_id' => (int) $user->id,
                    'sender_type' => $this->types->portalType(),
                    'body' => $body !== '' ? $body : null,
                    'message_type' => $messageType,
                ]);

                if ($attachmentMeta !== null) {
                    MessageAttachment::query()->create(array_merge(
                        ['message_id' => $message->id],
                        $attachmentMeta
                    ));
                }

                return $message;
            });
        } catch (\Throwable $e) {
            if ($attachmentMeta !== null) {
                $this->attachmentStorage->deleteStored(
                    $attachmentMeta['storage_provider'],
                    $attachmentMeta['public_id'] ?? null,
                    $attachmentMeta['file_path'] ?? null
                );
            }
            throw $e;
        }

        $conversation->touch();
        $this->conversations->markRead($conversation, $user);

        return $message->load(['sender', 'reactions.user', 'attachments']);
    }

    /**
     * @return array{message_id: int, reactions: list<array{emoji: string, count: int, mine: bool, users: list<array{id: int, user_type: string, name: string, mine: bool}>}>}
     */
    public function toggleReaction(Message $message, Authenticatable $user, string $emoji): array
    {
        $conversation = $message->conversation;
        if ($conversation === null || ! $this->conversations->isParticipant($conversation, $user)) {
            abort(403);
        }

        abort_if($message->deleted_for_all_at !== null, 422, 'Cannot react to a deleted message.');

        $emoji = trim($emoji);
        if (! in_array($emoji, $this->allowedReactions(), true)) {
            abort(422, 'Unsupported reaction.');
        }

        $userId = (int) $user->id;
        $userType = $this->types->portalType();

        $existing = MessageReaction::query()
            ->where('message_id', $message->id)
            ->where('user_id', $userId)
            ->where('user_type', $userType)
            ->first();

        if ($existing && $existing->emoji === $emoji) {
            $existing->delete();
        } elseif ($existing) {
            $existing->emoji = $emoji;
            $existing->save();
        } else {
            MessageReaction::query()->create([
                'message_id' => $message->id,
                'user_id' => $userId,
                'user_type' => $userType,
                'emoji' => $emoji,
            ]);
        }

        $message->unsetRelation('reactions');
        $message->load('reactions.user');

        return [
            'message_id' => (int) $message->id,
            'reactions' => $this->serializeReactions($message, $user),
        ];
    }

    public function edit(Message $message, Authenticatable $user, string $body): Message
    {
        $this->assertCanViewMessage($message, $user);
        $this->assertOwnMessage($message, $user);
        abort_if($message->deleted_for_all_at !== null, 422, 'Deleted messages cannot be edited.');

        $type = (string) $message->message_type;
        abort_if(
            ! in_array($type, ['text', 'automation'], true),
            422,
            'Only text messages can be edited.'
        );

        // Count every character (spaces + newlines); normalize CRLF only.
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        $max = (int) config('communications.message_max_length', 1000);
        if (trim($body) === '') {
            abort(422, 'Message body is required.');
        }
        if (mb_strlen($body) > $max) {
            abort(422, 'Message must be '.$max.' characters or less (including spaces and new lines).');
        }

        $message->body = $body;
        // Edited automation replies stay editable as normal text afterward.
        if ($type === 'automation') {
            $message->message_type = 'text';
        }
        $message->edited_at = now();
        $message->save();

        return $message->load(['sender', 'reactions.user', 'attachments']);
    }

    public function deleteForMe(Message $message, Authenticatable $user): void
    {
        $this->assertCanViewMessage($message, $user);

        MessageHide::query()->firstOrCreate([
            'message_id' => $message->id,
            'user_id' => (int) $user->id,
            'user_type' => $this->types->portalType(),
        ]);
    }

    public function deleteForAll(Message $message, Authenticatable $user): Message
    {
        $this->assertCanViewMessage($message, $user);
        $this->assertOwnMessage($message, $user);

        $message->body = null;
        $message->deleted_for_all_at = now();
        $message->save();

        return $message->load(['sender', 'reactions.user', 'attachments']);
    }

    protected function assertCanViewMessage(Message $message, Authenticatable $user): void
    {
        $conversation = $message->conversation;
        abort_if($conversation === null, 404);
        if (! $this->conversations->isParticipant($conversation, $user)) {
            abort(403);
        }
    }

    protected function assertOwnMessage(Message $message, Authenticatable $user): void
    {
        $mine = (int) $message->sender_id === (int) $user->id
            && $message->sender_type === $this->types->portalType();
        abort_if(! $mine, 403, 'You can only do this on your own messages.');
    }

    public function serialize(Message $message, Authenticatable $viewer): array
    {
        $portalType = $this->types->portalType();

        if (! $message->relationLoaded('attachments')) {
            $message->load('attachments');
        }

        if ($message->deleted_for_all_at !== null) {
            return [
                'id' => $message->id,
                'conversation_id' => $message->conversation_id,
                'sender_id' => $message->sender_id,
                'sender_type' => $message->sender_type,
                'sender_type_label' => $this->types->label($message->sender_type),
                'sender_name' => $this->displaySenderName($message->sender?->name),
                'sender_avatar_url' => $this->senderAvatarUrl($message),
                'body' => null,
                'message_type' => 'deleted',
                'mine' => (int) $message->sender_id === (int) $viewer->id
                    && $message->sender_type === $portalType,
                'created_at' => optional($message->created_at)?->toIso8601String(),
                'edited' => false,
                'deleted_for_all' => true,
                'reactions' => [],
                'attachments' => [],
            ];
        }

        return [
            'id' => $message->id,
            'conversation_id' => $message->conversation_id,
            'sender_id' => $message->sender_id,
            'sender_type' => $message->sender_type,
            'sender_type_label' => $this->types->label($message->sender_type),
            'sender_name' => $this->displaySenderName($message->sender?->name),
            'sender_avatar_url' => $this->senderAvatarUrl($message),
            'body' => $message->body,
            'message_type' => $message->message_type,
            'mine' => (int) $message->sender_id === (int) $viewer->id
                && $message->sender_type === $portalType,
            'created_at' => optional($message->created_at)?->toIso8601String(),
            'edited' => $message->edited_at !== null,
            'deleted_for_all' => false,
            'reactions' => $this->serializeReactions($message, $viewer),
            'attachments' => $message->attachments
                ->map(fn (MessageAttachment $attachment) => $this->serializeAttachment($attachment))
                ->values()
                ->all(),
        ];
    }

    /**
     * @return array{
     *   id: int,
     *   file_name: string,
     *   file_type: string,
     *   mime_type: ?string,
     *   file_size: ?int,
     *   storage_provider: string,
     *   url: ?string,
     *   download_url: string
     * }
     */
    public function serializeAttachment(MessageAttachment $attachment): array
    {
        $downloadUrl = url('/api/communications/attachments/'.$attachment->id);

        return [
            'id' => (int) $attachment->id,
            'file_name' => $attachment->file_name,
            'file_type' => $attachment->file_type,
            'mime_type' => $attachment->mime_type,
            'file_size' => $attachment->file_size !== null ? (int) $attachment->file_size : null,
            'storage_provider' => $attachment->storage_provider,
            // Images may be rendered directly from Cloudinary CDN URL.
            'url' => $attachment->storage_provider === 'cloudinary' ? $attachment->file_path : null,
            'download_url' => $downloadUrl,
        ];
    }

    /**
     * @return list<array{emoji: string, count: int, mine: bool, users: list<array{id: int, user_type: string, name: string, mine: bool, profile_image_url: ?string}>}>
     */
    public function serializeReactions(Message $message, Authenticatable $viewer): array
    {
        $portalType = $this->types->portalType();
        $viewerId = (int) $viewer->id;
        $viewerName = trim((string) ($viewer->name ?? ''));
        if ($viewerName === '') {
            $viewerName = 'You';
        }
        $grouped = [];

        foreach ($message->reactions as $reaction) {
            $emoji = (string) $reaction->emoji;
            if ($emoji === '') {
                continue;
            }
            if (! isset($grouped[$emoji])) {
                $grouped[$emoji] = ['emoji' => $emoji, 'count' => 0, 'mine' => false, 'users' => []];
            }

            $isMine = (int) $reaction->user_id === $viewerId && $reaction->user_type === $portalType;
            $name = $isMine ? $viewerName : trim((string) ($reaction->user?->name ?? ''));
            if ($name === '') {
                $name = 'Someone';
            }

            $grouped[$emoji]['count']++;
            if ($isMine) {
                $grouped[$emoji]['mine'] = true;
            }
            $grouped[$emoji]['users'][] = [
                'id' => (int) $reaction->user_id,
                'user_type' => (string) $reaction->user_type,
                'name' => $name,
                'mine' => $isMine,
                'profile_image_url' => $this->reactionAvatarUrl($reaction, $isMine, $viewer),
            ];
        }

        return array_values($grouped);
    }

    protected function reactionAvatarUrl(MessageReaction $reaction, bool $isMine, Authenticatable $viewer): ?string
    {
        if ($isMine && $viewer instanceof User) {
            return ($this->conversations->serializeUser($viewer, $this->types->portalType()) ?? [])['profile_image_url'] ?? null;
        }

        $user = $reaction->user;
        if (! $user instanceof User) {
            return null;
        }

        $type = (string) ($reaction->user_type ?: $this->types->fromUser($user));

        return ($this->conversations->serializeUser($user, $type) ?? [])['profile_image_url'] ?? null;
    }

    /**
     * Keep group chat sender labels short on desktop and mobile.
     */
    protected function displaySenderName(?string $name): string
    {
        $value = trim((string) $name);
        if ($value === '' || strcasecmp($value, 'None') === 0 || strcasecmp($value, 'null') === 0) {
            return 'Member';
        }

        return $value;
    }

    protected function senderAvatarUrl(Message $message): ?string
    {
        $sender = $message->sender;
        if (! $sender instanceof User) {
            return null;
        }

        $type = (string) ($message->sender_type ?: $this->types->fromUser($sender));

        return ($this->conversations->serializeUser($sender, $type) ?? [])['profile_image_url'] ?? null;
    }
}
