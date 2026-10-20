<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Services\ConversationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;

class UserSearchController extends Controller
{
    public function __invoke(Request $request, ConversationService $conversations): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:100'],
        ]);

        return response()->json([
            'users' => $conversations->searchUsers(Auth::user(), $validated['q']),
        ]);
    }
}
