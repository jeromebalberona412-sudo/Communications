<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Support\SchemaCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PresenceController extends Controller
{
    public function heartbeat(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['ok' => false], 401);
        }

        $validated = $request->validate([
            'online' => ['sometimes', 'boolean'],
        ]);

        $goingOnline = ! array_key_exists('online', $validated) || (bool) $validated['online'];
        $now = now();
        $lastSeen = null;

        $hasLastSeen = SchemaCache::hasColumn('users', 'last_seen');
        $hasOnlineStatus = SchemaCache::hasColumn('users', 'online_status');

        if ($hasLastSeen || $hasOnlineStatus) {
            $updates = [];
            if ($hasOnlineStatus) {
                $updates['online_status'] = $goingOnline ? 'online' : 'offline';
            }
            if ($goingOnline && $hasLastSeen) {
                $updates['last_seen'] = $now;
                $lastSeen = $now->toIso8601String();
            }

            // Lightweight update — avoid Eloquent save() / model reloads.
            if ($updates !== []) {
                DB::table('users')->where('id', (int) $user->id)->update($updates);
            }
        }

        return response()->json([
            'ok' => true,
            'online' => $goingOnline,
            'last_seen' => $lastSeen,
        ]);
    }
}
