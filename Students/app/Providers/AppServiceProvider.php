<?php

namespace App\Providers;

use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Vercel serverless filesystem is read-only except /tmp.
        if (getenv('VERCEL') || getenv('VERCEL_ENV')) {
            $this->app->useStoragePath('/tmp/storage');
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Paginator::useBootstrapFive();

        $appUrl = (string) config('app.url', '');
        $behindHttpsProxy = getenv('VERCEL')
            || getenv('VERCEL_ENV')
            || getenv('RENDER')
            || ($appUrl !== '' && str_starts_with($appUrl, 'https://'));

        if ($behindHttpsProxy) {
            URL::forceScheme('https');
        }
    }
}
