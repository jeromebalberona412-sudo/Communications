<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Services\ConversationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;

class DirectoryController extends Controller
{
    public function __invoke(Request $request, ConversationService $conversations): JsonResponse
    {
        $validated = $request->validate([
            'filter' => ['nullable', 'string', 'in:chairpersons,officials,federation'],
            'barangay_id' => ['nullable', 'integer'],
        ]);

        // Default to user's barangay_id if not explicitly provided
        $barangayId = isset($validated['barangay_id']) 
            ? (int) $validated['barangay_id'] 
            : Auth::user()->barangay_id;

        $result = $conversations->directory(
            Auth::user(),
            $validated['filter'] ?? 'officials',
            $barangayId
        );

        return response()->json([
            'groups' => $result['groups'],
            'users' => $result['users'],
        ]);
    }
}
