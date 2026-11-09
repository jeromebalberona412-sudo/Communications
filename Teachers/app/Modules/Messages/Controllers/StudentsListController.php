<?php

namespace App\Modules\Messages\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class StudentsListController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = Auth::user();

        if (! $user || $user->role !== 'teachers') {
            return response()->json(['students' => []], 403);
        }

        $search = $request->string('q')->toString();
        $cacheKey = 'comms.students.list.'.(int) $user->id.'.'.md5($search);

        $formatted = Cache::remember($cacheKey, 20, function () use ($search) {
            $query = User::query()
                ->where('role', 'students')
                ->where('is_active', true)
                ->select(['id', 'name', 'student_id', 'profile_image_url'])
                ->orderBy('name', 'asc');

            if ($search !== '') {
                $escaped = addcslashes(mb_strtolower($search), '\\%_');
                $query->where(function ($q) use ($escaped) {
                    $q->whereRaw('LOWER(name) LIKE ?', ["%{$escaped}%"])
                        ->orWhereRaw('LOWER(student_id) LIKE ?', ["%{$escaped}%"]);
                });
            }

            return $query->limit(100)->get()->map(function (User $student) {
                return [
                    'id' => $student->id,
                    'name' => $student->name,
                    'student_id' => $student->student_id,
                    'profile_image_url' => $student->profile_image_url ?? '',
                    'type' => 'students',
                ];
            })->values()->all();
        });

        return response()->json([
            'students' => $formatted,
        ]);
    }
}
