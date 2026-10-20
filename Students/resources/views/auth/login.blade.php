@extends('layouts.guest')

@section('title', 'Student sign in')

@section('content')
    <div class="auth-layout">
        <section class="auth-brand" aria-label="iLearnU">
            <div class="auth-mark">
                <div class="auth-seal">iLU</div>
                <h1 class="auth-wordmark">iLearnU</h1>
                <p class="auth-university">Laguna University</p>
                <p class="auth-motto">Integrity Towards Excellence</p>
            </div>
        </section>
        <section class="auth-panel">
            <div class="auth-card">
                <p class="auth-kicker">Welcome to</p>
                <h2 class="auth-title">iLearnU</h2>
                <p class="auth-subtitle">Laguna University Learning Management System</p>
                <p class="auth-role">COLLEGE STUDENT</p>

                @if ($errors->any())
                    <div class="auth-alert" role="alert">
                        {{ $errors->first() }}
                    </div>
                @endif

                <form method="POST" action="{{ route('students.login.store') }}" data-disable-on-submit novalidate>
                    @csrf
                    <div class="mb-3">
                        <label class="auth-label" for="student_id">Student ID</label>
                        <input
                            id="student_id"
                            name="student_id"
                            type="text"
                            value="{{ old('student_id') }}"
                            class="form-control auth-control @error('student_id') is-invalid @enderror"
                            autocomplete="username"
                            required
                        >
                    </div>
                    <div class="mb-3">
                        <label class="auth-label" for="password">Password</label>
                        <div class="password-field">
                            <input
                                id="password"
                                name="password"
                                type="password"
                                class="form-control auth-control @error('password') is-invalid @enderror"
                                autocomplete="current-password"
                                required
                            >
                            <button
                                type="button"
                                class="password-toggle"
                                data-password-toggle
                                aria-controls="password"
                                aria-pressed="false"
                                aria-label="Show password"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
                                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="auth-submit">LOGIN</button>
                </form>
            </div>
        </section>
    </div>
@endsection
