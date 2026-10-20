<?php

use App\Http\Controllers\Auth\StudentLoginController;
use App\Http\Controllers\StudentDashboardController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect()->route('students.login');
});

Route::middleware('guest')->group(function () {
    Route::get('/login', [StudentLoginController::class, 'create'])->name('students.login');
    Route::post('/login', [StudentLoginController::class, 'store'])->name('students.login.store');
});

Route::middleware(['auth', 'student'])->group(function () {
    Route::get('/dashboard', [StudentDashboardController::class, 'index'])->name('students.dashboard');
    Route::post('/logout', [StudentLoginController::class, 'destroy'])->name('students.logout');
    require __DIR__.'/communications.php';
});
