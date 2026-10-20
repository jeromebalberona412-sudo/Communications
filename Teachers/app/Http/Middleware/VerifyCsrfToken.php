<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Symfony\Component\HttpFoundation\Cookie;

class VerifyCsrfToken extends ValidateCsrfToken
{
    protected function newCookie($request, $config)
    {
        return new Cookie(
            (string) config('session.xsrf_cookie', 'teachers-xsrf'),
            $request->session()->token(),
            $this->availableAt(60 * $config['lifetime']),
            $config['path'],
            $config['domain'],
            $config['secure'],
            false,
            false,
            $config['same_site'] ?? null,
            $config['partitioned'] ?? false
        );
    }
}
