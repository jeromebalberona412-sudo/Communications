<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\Message;
use App\Modules\Communications\Services\MessageService;
use App\Services\FeedCommentRateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class MessageController extends Controller
{
    public function __construct(
        protected MessageService $messages
    ) {}

    public function index(Request $request, Conversation $conversation): JsonResponse
    {
        Gate::authorize('view', $conversation);

        $beforeId = $request->integer('before_id') ?: null;
        $items = $this->messages->paginate($conversation, Auth::user(), $beforeId ?: null);

        return response()->json([
            'messages' => $items,
            'reaction_emojis' => $this->messages->allowedReactions(),
        ]);
    }

    public function store(Request $request, Conversation $conversation): JsonResponse
    {
        Gate::authorize('send', $conversation);

        $user = Auth::user();
        $limiter = app(FeedCommentRateLimiter::class);
        $cooldown = $limiter->check('sk_official', (int) $user->id, FeedCommentRateLimiter::SCOPE_CHAT);

        if (! $cooldown['allowed']) {
            return response()->json([
                'message' => $cooldown['message'],
                'retry_after' => $cooldown['retry_after'],
                'rate_limit' => [
                    'locked' => true,
                    'retry_after' => $cooldown['retry_after'],
                    'burst_used' => $cooldown['burst_used'],
                    'burst_remaining' => $cooldown['burst_remaining'],
                ],
            ], 429);
        }

        $max = (int) config('communications.message_max_length', 1000);
        $hasFile = $request->hasFile('attachment');

        $validated = $request->validate([
            // Use present (not required) so spaces/newlines are allowed in body text.
            'body' => [$hasFile ? 'nullable' : 'present', 'string', 'max:'.$max],
            'attachment' => ['nullable', 'file'],
        ]);

        $body = str_replace(["\r\n", "\r"], "\n", (string) $request->input('body', ''));
        $file = $hasFile ? $request->file('attachment') : null;

        if (! $hasFile && trim($body) === '') {
            return response()->json(['message' => 'Message body is required.'], 422);
        }

        if (mb_strlen($body) > $max) {
            return response()->json([
                'message' => 'Message must be '.$max.' characters or less (including spaces and new lines).',
            ], 422);
        }

        $lineCount = $body === '' ? 0 : count(preg_split("/\r\n|\n|\r/", $body) ?: []);
        $maxLines = (int) config('communications.message_max_lines', 500);
        if ($lineCount > $maxLines) {
            return response()->json(['message' => 'Message cannot exceed '.$maxLines.' lines.'], 422);
        }

        $message = $file
            ? $this->messages->sendWithAttachment($conversation, $user, $body, $file)
            : $this->messages->send($conversation, $user, $body);

        $rateLimit = $limiter->hit('sk_official', (int) $user->id, FeedCommentRateLimiter::SCOPE_CHAT);

        return response()->json([
            'message' => $this->messages->serialize($message, $user),
            'rate_limit' => [
                'locked' => $rateLimit['locked'],
                'retry_after' => $rateLimit['retry_after'],
                'burst_used' => $rateLimit['burst_used'],
                'burst_remaining' => $rateLimit['burst_remaining'],
                'message' => $rateLimit['message'],
            ],
        ], 201);
    }

    public function toggleReaction(Request $request, Message $message): JsonResponse
    {
        $conversation = $message->conversation;
        abort_if($conversation === null, 404);
        Gate::authorize('view', $conversation);

        $validated = $request->validate([
            'emoji' => ['required', 'string', 'max:16'],
        ]);

        $payload = $this->messages->toggleReaction($message, Auth::user(), $validated['emoji']);

        return response()->json($payload);
    }

    public function update(Request $request, Message $message): JsonResponse
    {
        $conversation = $message->conversation;
        abort_if($conversation === null, 404);
        Gate::authorize('send', $conversation);

        $max = (int) config('communications.message_max_length', 1000);
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:'.$max],
        ]);

        $updated = $this->messages->edit($message, Auth::user(), $validated['body']);

        return response()->json([
            'message' => $this->messages->serialize($updated, Auth::user()),
        ]);
    }

    public function destroy(Request $request, Message $message): JsonResponse
    {
        $conversation = $message->conversation;
        abort_if($conversation === null, 404);
        Gate::authorize('view', $conversation);

        $request->merge([
            'scope' => $request->input('scope') ?? $request->query('scope'),
        ]);

        $validated = $request->validate([
            'scope' => ['required', 'in:me,all'],
        ]);

        if ($validated['scope'] === 'all') {
            $updated = $this->messages->deleteForAll($message, Auth::user());

            return response()->json([
                'scope' => 'all',
                'message' => $this->messages->serialize($updated, Auth::user()),
            ]);
        }

        $this->messages->deleteForMe($message, Auth::user());

        return response()->json([
            'scope' => 'me',
            'message_id' => (int) $message->id,
        ]);
    }
}
