<?php

use App\Modules\Dashboard\Controllers\StudentDashboardController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'student'])->group(function () {
    Route::get('/dashboard', [StudentDashboardController::class, 'index'])->name('students.dashboard');
});
