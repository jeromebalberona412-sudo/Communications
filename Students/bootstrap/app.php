<?php

use App\Http\Middleware\EnsureStudentRole;
use App\Http\Middleware\VerifyCsrfToken;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Trust local LAN HTTPS reverse proxy (X-Forwarded-Proto / Host).
        $middleware->trustProxies(at: '*');
        $middleware->redirectGuestsTo(fn () => route('students.login'));
        $middleware->redirectUsersTo(fn () => route('students.dashboard'));
        $middleware->replaceInGroup('web', ValidateCsrfToken::class, VerifyCsrfToken::class);
        $middleware->alias([
            'student' => EnsureStudentRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
