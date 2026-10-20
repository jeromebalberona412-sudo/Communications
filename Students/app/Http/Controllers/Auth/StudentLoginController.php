<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class StudentLoginController extends Controller
{
    public function create(): View
    {
        return view('auth.login');
    }

    public function store(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'student_id' => ['required', 'string', 'max:30'],
            'password' => ['required', 'string'],
        ]);

        $throttleKey = $this->throttleKey($credentials['student_id'], $request);

        if ($this->tooManyAttempts($throttleKey)) {
            throw ValidationException::withMessages([
                'student_id' => 'Too many login attempts. Please try again in a minute.',
            ]);
        }

        $user = User::query()
            ->where('student_id', $credentials['student_id'])
            ->where('role', 'students')
            ->where('is_active', true)
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            $this->hit($throttleKey);

            throw ValidationException::withMessages([
                'student_id' => 'These credentials do not match our records.',
            ]);
        }

        $this->clear($throttleKey);
        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->route('students.dashboard');
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('students.login');
    }

    private function throttleKey(string $identifier, Request $request): string
    {
        return 'students-login:'.Str::lower($identifier).'|'.$request->ip();
    }

    private function tooManyAttempts(string $key): bool
    {
        return (int) $this->cache()->get($key, 0) >= 5;
    }

    private function hit(string $key): void
    {
        $attempts = (int) $this->cache()->get($key, 0) + 1;
        $this->cache()->put($key, $attempts, now()->addMinute());
    }

    private function clear(string $key): void
    {
        $this->cache()->forget($key);
    }

    private function cache(): \Illuminate\Contracts\Cache\Repository
    {
        $store = config('cache.default') === 'database' ? 'file' : config('cache.default');

        return Cache::store($store);
    }
}
