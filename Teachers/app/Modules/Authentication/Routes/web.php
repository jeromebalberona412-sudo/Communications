<?php

use App\Modules\Authentication\Controllers\TeacherLoginController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return auth()->check()
        ? redirect()->route('teachers.dashboard')
        : redirect()->route('teachers.login');
});

Route::middleware('guest')->group(function () {
    Route::get('/login', [TeacherLoginController::class, 'create'])->name('teachers.login');
    Route::post('/login', [TeacherLoginController::class, 'store'])->name('teachers.login.store');
});

Route::middleware(['auth', 'teacher'])->group(function () {
    Route::post('/logout', [TeacherLoginController::class, 'destroy'])->name('teachers.logout');
});
