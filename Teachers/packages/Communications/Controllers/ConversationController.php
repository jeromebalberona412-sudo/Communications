<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Services\ConversationService;
use App\Modules\Communications\Services\DefaultGroupChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class ConversationController extends Controller
{
    public function __construct(
        protected ConversationService $conversations,
        protected DefaultGroupChatService $defaultGroups,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $items = $this->conversations->listForUser(
            Auth::user(),
            $request->string('q')->toString() ?: null
        );

        return response()->json(['conversations' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = Auth::user();
        abort_if($user === null, 401);

        if ($request->filled('user_ids') || $request->boolean('is_group')) {
            $validated = $request->validate([
                'user_ids' => ['required', 'array', 'min:1', 'max:49'],
                'user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
                'name' => ['nullable', 'string', 'max:120'],
            ]);

            $conversation = $this->conversations->createGroup(
                $user,
                array_map('intval', $validated['user_ids']),
                $validated['name'] ?? null
            );

            return response()->json([
                'conversation' => $this->conversations->showPayload($conversation, $user),
            ], 201);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $conversation = $this->conversations->findOrCreatePrivate(
            $user,
            (int) $validated['user_id']
        );

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, $user),
        ], 201);
    }

    public function show(Conversation $conversation): JsonResponse
    {
        Gate::authorize('view', $conversation);

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, Auth::user()),
        ]);
    }

    public function markAllRead(): JsonResponse
    {
        $user = Auth::user();
        abort_if($user === null, 401);
        $this->conversations->markAllRead($user);

        return response()->json([
            'ok' => true,
            'unread_count' => $this->conversations->unreadTotalForUser($user),
        ]);
    }

    public function markRead(Conversation $conversation): JsonResponse
    {
        Gate::authorize('view', $conversation);
        $this->conversations->markRead($conversation, Auth::user());

        return response()->json([
            'ok' => true,
            'unread_count' => $this->conversations->unreadTotalForUser(Auth::user()),
        ]);
    }

    public function rename(Request $request, Conversation $conversation): JsonResponse
    {
        $user = Auth::user();
        if (! $user || ! $this->defaultGroups->canRename($conversation, $user)) {
            return response()->json([
                'message' => $conversation->isDefaultGroup()
                    ? 'Only the SK Federation President or Vice President can rename this group.'
                    : 'Only a group admin can rename this group.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $conversation = $this->defaultGroups->rename(
            $conversation,
            $user,
            (string) $validated['name']
        );

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, $user),
        ]);
    }

    public function updateAvatar(Request $request, Conversation $conversation): JsonResponse
    {
        $user = Auth::user();
        if (! $user || ! $this->defaultGroups->canChangeAvatar($conversation, $user)) {
            return response()->json([
                'message' => $conversation->isDefaultGroup()
                    ? 'Only the SK Federation President can change this group photo.'
                    : 'Only a group admin can change this group photo.',
            ], 403);
        }

        $validated = $request->validate([
            'avatar' => [
                'required',
                'file',
                'image',
                'mimes:jpeg,jpg,png,webp,gif',
                'max:10240',
                'dimensions:min_width=64,min_height=64,max_width=4096,max_height=4096',
            ],
        ]);

        $conversation = $this->defaultGroups->updateAvatar(
            $conversation,
            $user,
            $validated['avatar']
        );

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, $user),
        ]);
    }

    public function members(Conversation $conversation): JsonResponse
    {
        Gate::authorize('view', $conversation);

        if (! $conversation->isGroup()) {
            abort(422, 'Members are only available for group conversations.');
        }

        $conversation->load(['participants.user']);

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, Auth::user()),
            'members' => $this->defaultGroups->serializeMembers($conversation, $this->conversations),
            'member_count' => $conversation->participants->count(),
            'max_members' => $conversation->max_members,
        ]);
    }
}
