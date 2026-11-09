<?php

use App\Modules\Dashboard\Controllers\StudentManagementController;
use App\Modules\Dashboard\Controllers\TeacherDashboardController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'teacher'])->group(function () {
    Route::get('/dashboard', [TeacherDashboardController::class, 'index'])->name('teachers.dashboard');
    Route::get('/students', [StudentManagementController::class, 'index'])->name('teachers.students.index');
    Route::get('/students/create', [StudentManagementController::class, 'create'])->name('teachers.students.create');
    Route::post('/students', [StudentManagementController::class, 'store'])->name('teachers.students.store');
});
