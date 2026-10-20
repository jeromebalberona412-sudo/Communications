<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Services\ConversationService;
use App\Modules\Communications\Services\DefaultGroupChatService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class CommunicationsPageController extends Controller
{
    public function index(Request $request): View
    {
        $user = Auth::user();
        if ($user) {
            try {
                app(DefaultGroupChatService::class)->ensureForUser($user);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $conversationId = $request->integer('conversation') ?: null;
        $withUserId = $request->integer('with') ?: null;

        $data = [
            'initialConversationId' => $conversationId,
            'initialUserId' => $withUserId,
            'currentUserId' => (int) Auth::id(),
            'portalUserType' => config('communications.portal_user_type', 'teachers'),
        ];

        return view()->exists('communications.messages')
            ? view('communications.messages', $data)
            : view('communications::index', $data);
    }

    public function callHistory(): View
    {
        return view()->exists('communications.call-history')
            ? view('communications.call-history')
            : view('communications::call-history');
    }

    public function unreadCount(ConversationService $conversations)
    {
        $user = Auth::user();
        $count = $user ? $conversations->unreadTotalForUser($user) : 0;

        return response()->json(['unread_count' => $count]);
    }
}
