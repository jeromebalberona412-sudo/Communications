@extends('layouts.app')

@section('title', 'Manage students')

@section('content')
    <h1 class="page-title">Manage Students</h1>
    <p class="page-lead">Student accounts that can sign in to the Students application.</p>

    @if (session('status'))
        <div class="alert alert-success" role="status">{{ session('status') }}</div>
    @endif

    <div class="page-toolbar">
        <form class="search-form" method="GET" action="{{ route('teachers.students.index') }}">
            <div>
                <label class="field-label" for="q">Search by Student ID</label>
                <input id="q" name="q" type="search" value="{{ $search }}" class="form-control" placeholder="Student ID">
            </div>
            <button type="submit" class="secondary-button">Search</button>
        </form>
        <a class="primary-button" href="{{ route('teachers.students.create') }}">Add Student</a>
    </div>

    <div class="panel">
        <div class="table-responsive">
            <table class="table student-table align-middle">
                <thead>
                    <tr>
                        <th scope="col">Student ID</th>
                        <th scope="col">Name</th>
                        <th scope="col">Status</th>
                        <th scope="col">Date created</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($students as $student)
                        <tr>
                            <td data-label="Student ID">{{ $student->student_id }}</td>
                            <td data-label="Name">{{ $student->name ?: 'Not provided' }}</td>
                            <td data-label="Status">{{ $student->is_active ? 'Active' : 'Inactive' }}</td>
                            <td data-label="Date created">{{ $student->created_at?->timezone(config('app.timezone'))->format('M j, Y') }}</td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4" class="empty-state">
                                {{ $search !== '' ? 'No student accounts match your search.' : 'No student accounts have been created yet.' }}
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
        {{ $students->links() }}
    </div>
@endsection
