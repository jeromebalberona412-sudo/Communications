<?php

namespace App\Modules\Communications\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;

class StudentsListController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = Auth::user();
        
        // Only teachers can access this endpoint
        if (! $user || $user->role !== 'teachers') {
            return response()->json(['students' => []], 403);
        }

        $search = $request->string('q')->toString();

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

        $students = $query->limit(100)->get();

        $formatted = $students->map(function (User $student) {
            return [
                'id' => $student->id,
                'name' => $student->name,
                'student_id' => $student->student_id,
                'profile_image_url' => $student->profile_image_url ?? '',
                'type' => 'students',
            ];
        });

        return response()->json([
            'students' => $formatted,
        ]);
    }
}
