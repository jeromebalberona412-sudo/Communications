<?php

namespace App\Modules\Messages\Services;

use App\Modules\Messages\Models\Call;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * One history row per call session. Updates are keyed by the call id so
 * retries and duplicate signals do not create a second record.
 */
class CallHistoryRecorder
{
    public function sync(Call $call): void
    {
        if (! Schema::hasTable('communication_call_histories')) {
            return;
        }

        $existing = DB::table('communication_call_histories')->where('call_id', $call->id)->first();
        $answered = $call->answered_at ?? $call->started_at;
        $duration = $call->duration_seconds;
        if ($duration === null && $call->ended_at && $answered && $call->status === Call::STATUS_ENDED) {
            $duration = max(0, $call->ended_at->getTimestamp() - $answered->getTimestamp());
        }

        $now = now();
        DB::table('communication_call_histories')->updateOrInsert(
            ['call_id' => $call->id],
            [
                'call_uuid' => $existing->call_uuid ?? (string) Str::uuid(),
                'conversation_id' => $call->conversation_id,
                'call_type' => $call->call_type === Call::TYPE_VIDEO ? 'video' : 'audio',
                'caller_id' => $call->caller_id,
                'caller_type' => $call->caller_type,
                'receiver_id' => $call->receiver_id,
                'receiver_type' => $call->receiver_type,
                'status' => $this->historyStatus($call),
                'started_at' => $call->started_at ?? $call->created_at,
                'answered_at' => $call->answered_at,
                'ended_at' => $call->ended_at,
                'duration_seconds' => $duration,
                'end_reason' => $call->end_reason,
                'updated_at' => $now,
                'created_at' => $existing->created_at ?? $now,
            ]
        );
    }

    public function historyStatus(Call $call): string
    {
        return match ($call->status) {
            Call::STATUS_REJECTED => 'declined',
            Call::STATUS_MISSED => 'missed',
            Call::STATUS_CANCELLED => 'cancelled',
            Call::STATUS_ENDED => $call->answered_at ? 'completed' : 'missed',
            Call::STATUS_ACCEPTED => 'answered',
            default => 'ringing',
        };
    }
}
