<?php

namespace App\Modules\Dashboard\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class StudentDashboardController extends Controller
{
    public function index(): View
    {
        return view('dashboard::dashboard', [
            'student' => auth()->user(),
        ]);
    }
}
