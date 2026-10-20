<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStudentRequest;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class StudentManagementController extends Controller
{
    public function index(Request $request): View
    {
        $search = trim((string) $request->query('q', ''));

        $students = User::query()
            ->where('role', 'students')
            ->when($search !== '', function ($query) use ($search) {
                $escaped = addcslashes(mb_strtolower($search), '\\%_');

                $query->whereRaw('lower(student_id) like ?', ['%'.$escaped.'%']);
            })
            ->orderBy('student_id')
            ->paginate(10)
            ->withQueryString();

        return view('students.students', [
            'students' => $students,
            'search' => $search,
        ]);
    }

    public function create(): View
    {
        return view('students.create');
    }

    public function store(StoreStudentRequest $request): RedirectResponse
    {
        try {
            User::query()->create([
                'student_id' => $request->validated('student_id'),
                'username' => null,
                'name' => $request->validated('name'),
                'password' => $request->validated('password'),
                'role' => 'students',
                'is_active' => true,
            ]);
        } catch (UniqueConstraintViolationException) {
            return back()
                ->withInput($request->except(['password', 'password_confirmation']))
                ->withErrors(['student_id' => 'This Student ID is already in use.']);
        }

        return redirect()
            ->route('teachers.students.index')
            ->with('status', 'Student account created.');
    }
}
