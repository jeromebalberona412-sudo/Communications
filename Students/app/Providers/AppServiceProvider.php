<?php

namespace App\Providers;

use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\View;
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
        View::addLocation(base_path('shared/Views'));
        Blade::anonymousComponentPath(base_path('shared/Views/components'));

        $this->loadViewsFrom(app_path('Modules/Authentication/Views'), 'authentication');
        $this->loadViewsFrom(app_path('Modules/Dashboard/Views'), 'dashboard');
        $this->loadViewsFrom(app_path('Modules/Messages/Views'), 'messages');
        $this->loadViewsFrom(app_path('Modules/Messages/Views'), 'communications');

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
