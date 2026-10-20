@extends('layouts.app')

@section('title', 'Teacher dashboard')

@section('content')
    <h1 class="page-title">Welcome, {{ $teacher->displayName() }}</h1>
    <p class="page-lead">Manage student accounts from this dashboard.</p>
    <section class="profile-grid" aria-label="Teacher profile">
        <article class="profile-card">
            <span>Name</span>
            <strong>{{ $teacher->name ?: 'Not provided' }}</strong>
        </article>
        <article class="profile-card">
            <span>Username</span>
            <strong>{{ $teacher->username }}</strong>
        </article>
        <article class="profile-card">
            <span>Role</span>
            <strong>Teacher</strong>
        </article>
        <article class="profile-card">
            <span>Status</span>
            <strong class="{{ $teacher->is_active ? 'status-active' : '' }}">{{ $teacher->is_active ? 'Active' : 'Inactive' }}</strong>
        </article>
    </section>
@endsection
