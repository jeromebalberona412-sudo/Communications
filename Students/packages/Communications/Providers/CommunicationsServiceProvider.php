<?php

namespace App\Modules\Communications\Providers;

use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Policies\ConversationPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;

class CommunicationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $configPath = __DIR__.'/../config/communications.php';
        if (is_file($configPath)) {
            $this->mergeConfigFrom($configPath, 'communications');
        }
    }

    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__.'/../views', 'communications');

        Gate::policy(Conversation::class, ConversationPolicy::class);

        $composer = function ($view): void {
            // Badge count is filled by realtime.js — avoid remote DB on every page render.
            $view->with([
                'unreadMessagesCount' => 0,
                'headerConversations' => [],
            ]);
        };

        View::composer('components.header', $composer);
        View::composer('layout::header', $composer);
    }
}
