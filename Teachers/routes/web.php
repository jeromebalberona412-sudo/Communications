<?php

use App\Http\Controllers\Auth\TeacherLoginController;
use App\Http\Controllers\StudentManagementController;
use App\Http\Controllers\TeacherDashboardController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect()->route('teachers.login');
});

Route::middleware('guest')->group(function () {
    Route::get('/login', [TeacherLoginController::class, 'create'])->name('teachers.login');
    Route::post('/login', [TeacherLoginController::class, 'store'])->name('teachers.login.store');
});

Route::middleware(['auth', 'teacher'])->group(function () {
    Route::get('/dashboard', [TeacherDashboardController::class, 'index'])->name('teachers.dashboard');
    Route::post('/logout', [TeacherLoginController::class, 'destroy'])->name('teachers.logout');
    Route::get('/students', [StudentManagementController::class, 'index'])->name('teachers.students.index');
    Route::get('/students/create', [StudentManagementController::class, 'create'])->name('teachers.students.create');
    Route::post('/students', [StudentManagementController::class, 'store'])->name('teachers.students.store');
    require __DIR__.'/communications.php';
});
