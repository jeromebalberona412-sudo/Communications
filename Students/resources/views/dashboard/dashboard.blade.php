@extends('layouts.app')

@section('title', 'Student dashboard')

@section('content')
    <h1 class="page-title">Welcome, {{ $student->displayName() }}</h1>
    <p class="page-lead">This is your student dashboard.</p>
    <section class="profile-grid" aria-label="Student profile">
        <article class="profile-card">
            <span>Name</span>
            <strong>{{ $student->name ?: 'Not provided' }}</strong>
        </article>
        <article class="profile-card">
            <span>Student ID</span>
            <strong>{{ $student->student_id }}</strong>
        </article>
        <article class="profile-card">
            <span>Role</span>
            <strong>Student</strong>
        </article>
        <article class="profile-card">
            <span>Status</span>
            <strong class="{{ $student->is_active ? 'status-active' : '' }}">{{ $student->is_active ? 'Active' : 'Inactive' }}</strong>
        </article>
    </section>
@endsection
