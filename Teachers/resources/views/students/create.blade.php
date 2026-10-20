@extends('layouts.app')

@section('title', 'Add student')

@section('content')
    <h1 class="page-title">Add Student</h1>
    <p class="page-lead">Create an active student account. The password is stored as a hash.</p>

    <form class="panel form-panel" method="POST" action="{{ route('teachers.students.store') }}" data-disable-on-submit novalidate>
        @csrf
        <div class="mb-3">
            <label class="field-label" for="student_id">Student ID</label>
            <input
                id="student_id"
                name="student_id"
                type="text"
                value="{{ old('student_id') }}"
                class="form-control @error('student_id') is-invalid @enderror"
                required
                minlength="3"
                maxlength="30"
                pattern="[A-Za-z0-9-]{3,30}"
            >
            <div class="form-text">3–30 characters: letters, numbers, and hyphens.</div>
            @error('student_id')
                <div class="invalid-feedback d-block">{{ $message }}</div>
            @enderror
        </div>
        <div class="mb-3">
            <label class="field-label" for="name">Student name <span class="text-muted">(optional)</span></label>
            <input id="name" name="name" type="text" value="{{ old('name') }}" maxlength="255" class="form-control @error('name') is-invalid @enderror">
            @error('name')
                <div class="invalid-feedback d-block">{{ $message }}</div>
            @enderror
        </div>
        <div class="mb-3">
            <label class="field-label" for="password">Password</label>
            <input id="password" name="password" type="password" class="form-control @error('password') is-invalid @enderror" autocomplete="new-password" required>
            <div class="form-text">At least 8 characters, with uppercase, lowercase, and a number.</div>
            @error('password')
                <div class="invalid-feedback d-block">{{ $message }}</div>
            @enderror
        </div>
        <div class="mb-3">
            <label class="field-label" for="password_confirmation">Confirm password</label>
            <input id="password_confirmation" name="password_confirmation" type="password" class="form-control" autocomplete="new-password" required>
        </div>
        <div class="form-actions">
            <button type="submit" class="primary-button">Create student</button>
            <a class="secondary-button" href="{{ route('teachers.students.index') }}">Cancel</a>
        </div>
    </form>
@endsection
