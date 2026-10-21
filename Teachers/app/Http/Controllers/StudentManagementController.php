<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStudentRequest;
use App\Models\User;
use App\Modules\Communications\Services\DefaultGroupChatService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
            $student = User::query()->create([
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

        // The account exists; add the student to the single shared group chat.
        $groupError = $this->addStudentToGroupChat((int) $student->id);

        if ($groupError !== null) {
            // The account was created, only the membership write failed. Keep the
            // student account and report it; the membership is retried
            // automatically the next time the conversation list is loaded.
            Log::warning('Failed to add new student to the shared group chat.', [
                'user_id' => $student->id,
                'error' => $groupError,
            ]);

            return redirect()
                ->route('communications.index')
                ->with('status', 'Student account created.')
                ->with('warning', 'The student account was created, but adding them to the group chat failed. '
                    .'It will be retried automatically the next time the group chat is loaded.');
        }

        return redirect()
            ->route('communications.index')
            ->with('status', 'Student account created and added to the group chat.');
    }

    /**
     * Add a freshly created student to the shared Capstone 2 group.
     *
     * Idempotent: re-running it never creates a duplicate membership row.
     *
     * @return string|null Error message, or null on success.
     */
    protected function addStudentToGroupChat(int $studentId): ?string
    {
        try {
            $groups = app(DefaultGroupChatService::class);
            $participant = $groups->addUserToCapstoneGroup($studentId);

            if ($participant === null) {
                return 'The shared group chat is unavailable.';
            }

            return null;
        } catch (\Throwable $e) {
            report($e);

            return $e->getMessage();
        }
    }
}
