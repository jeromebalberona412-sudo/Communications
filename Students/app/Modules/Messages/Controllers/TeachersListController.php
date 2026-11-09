<?php

namespace App\Modules\Messages\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class TeachersListController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = Auth::user();

        if (! $user || $user->role !== 'students') {
            return response()->json(['teachers' => []], 403);
        }

        $search = $request->string('q')->toString();
        $cacheKey = 'comms.teachers.list.'.(int) $user->id.'.'.md5($search);

        $formatted = Cache::remember($cacheKey, 20, function () use ($search) {
            $query = User::query()
                ->where('role', 'teachers')
                ->where('is_active', true)
                ->select(['id', 'name', 'username', 'profile_image_url'])
                ->orderBy('name', 'asc');

            if ($search !== '') {
                $escaped = addcslashes(mb_strtolower($search), '\\%_');
                $query->where(function ($q) use ($escaped) {
                    $q->whereRaw('LOWER(name) LIKE ?', ["%{$escaped}%"])
                        ->orWhereRaw('LOWER(username) LIKE ?', ["%{$escaped}%"]);
                });
            }

            return $query->limit(100)->get()->map(function (User $teacher) {
                return [
                    'id' => $teacher->id,
                    'name' => $teacher->name,
                    'username' => $teacher->username,
                    'profile_image_url' => $teacher->profile_image_url ?? '',
                    'type' => 'teachers',
                ];
            })->values()->all();
        });

        return response()->json([
            'teachers' => $formatted,
        ]);
    }
}
