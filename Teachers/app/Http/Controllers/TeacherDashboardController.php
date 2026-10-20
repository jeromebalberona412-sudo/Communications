<?php

namespace App\Http\Controllers;

use Illuminate\View\View;

class TeacherDashboardController extends Controller
{
    public function index(): View
    {
        return view('dashboard.dashboard', [
            'teacher' => auth()->user(),
        ]);
    }
}
