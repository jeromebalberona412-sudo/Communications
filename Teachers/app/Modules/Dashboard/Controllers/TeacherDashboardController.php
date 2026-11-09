<?php

namespace App\Modules\Dashboard\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class TeacherDashboardController extends Controller
{
    public function index(): View
    {
        return view('dashboard::dashboard', [
            'teacher' => auth()->user(),
        ]);
    }
}
