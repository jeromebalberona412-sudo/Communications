<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Models\Call;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Services\CallService;
use App\Modules\Communications\Services\MessageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class CallController extends Controller
{
    public function __construct(
        protected CallService $calls,
        protected MessageService $messages
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'calls' => $this->calls->historyForUser(Auth::user()),
        ]);
    }

    public function ringing(): JsonResponse
    {
        return response()->json([
            'calls' => $this->calls->ringingForUser(Auth::user()),
        ]);
    }

    public function store(Request $request, Conversation $conversation): JsonResponse
    {
        Gate::authorize('call', $conversation);

        $validated = $request->validate([
            'call_type' => ['required', 'string', 'in:voice,video'],
            'receiver_id' => ['nullable', 'integer', 'min:1', 'exists:users,id'],
        ]);

        $receiverId = isset($validated['receiver_id']) ? (int) $validated['receiver_id'] : null;
        if ($receiverId !== null && $receiverId === (int) Auth::id()) {
            return response()->json([
                'message' => 'You cannot call yourself.',
            ], 422);
        }

        $call = $this->calls->start(
            $conversation,
            Auth::user(),
            $validated['call_type'],
            $receiverId
        );

        $viewer = Auth::user();
        $notice = $this->calls->pullLastCallNotice();

        return response()->json([
            'call' => $this->calls->serialize($call->load(['caller', 'receiver', 'conversation']), $viewer),
            'message' => $notice ? $this->messages->serialize($notice->load('sender'), $viewer) : null,
        ], 201);
    }

    public function updateStatus(Request $request, Call $call): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:accepted,rejected,missed,cancelled,ended'],
        ]);

        $viewer = Auth::user();
        $call = $this->calls->updateStatus($call, $viewer, $validated['status']);
        $notice = $this->calls->pullLastCallNotice();

        return response()->json([
            'call' => $this->calls->serialize($call->load(['caller', 'receiver', 'conversation']), $viewer),
            'message' => $notice ? $this->messages->serialize($notice->load('sender'), $viewer) : null,
        ]);
    }
}
