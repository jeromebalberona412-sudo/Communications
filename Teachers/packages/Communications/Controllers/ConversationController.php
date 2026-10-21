<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Services\ConversationRealtimeNotifier;
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
        protected ConversationRealtimeNotifier $realtime,
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
            if ($this->defaultGroups->isLmsPortal()) {
                return response()->json([
                    'message' => 'Creating additional groups is not allowed. Use the shared Capstone 2 group.',
                ], 403);
            }

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
                'message' => $this->defaultGroups->isCapstoneGroup($conversation)
                    ? 'Only a teacher group admin can rename this group.'
                    : ($conversation->isDefaultGroup()
                        ? 'Only the SK Federation President or Vice President can rename this group.'
                        : 'Only a group admin can rename this group.'),
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

        $this->realtime->notifyGroupUpdated($conversation, [
            'changed' => 'name',
        ]);

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, $user),
        ]);
    }

    public function updateAvatar(Request $request, Conversation $conversation): JsonResponse
    {
        $user = Auth::user();
        if (! $user || ! $this->defaultGroups->canChangeAvatar($conversation, $user)) {
            return response()->json([
                'message' => $this->defaultGroups->isCapstoneGroup($conversation)
                    ? 'Only a teacher group admin can change this group photo.'
                    : ($conversation->isDefaultGroup()
                        ? 'Only the SK Federation President can change this group photo.'
                        : 'Only a group admin can change this group photo.'),
            ], 403);
        }

        if ($request->boolean('restore_default')) {
            $conversation = $this->defaultGroups->updateAvatar($conversation, $user, null);
            $this->realtime->notifyGroupUpdated($conversation, [
                'changed' => 'avatar',
            ]);

            return response()->json([
                'conversation' => $this->conversations->showPayload($conversation, $user),
            ]);
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

        $this->realtime->notifyGroupUpdated($conversation, [
            'changed' => 'avatar',
        ]);

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

        $page = max(1, (int) request()->integer('page', 1));
        $perPage = min(100, max(10, (int) request()->integer('per_page', 40)));

        $result = $this->defaultGroups->memberPage(
            $conversation,
            $this->conversations,
            $page,
            $perPage
        );

        return response()->json([
            'conversation' => $this->conversations->showPayload($conversation, Auth::user()),
            'members' => $result['members'],
            'member_count' => $result['total'],
            'max_members' => $conversation->max_members,
            'page' => $result['page'],
            'per_page' => $result['per_page'],
            'has_more' => $result['has_more'],
        ]);
    }
}
