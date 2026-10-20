<?php

namespace Tests\Concerns;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Support\UserSchema;

trait RefreshUsers
{
    use RefreshDatabase;

    protected function afterRefreshingDatabase(): void
    {
        if (! Schema::hasTable('users')) {
            UserSchema::create();
        }
    }
}
