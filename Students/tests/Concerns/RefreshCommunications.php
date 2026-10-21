<?php

namespace Tests\Concerns;

use App\Modules\Communications\Support\SchemaCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Support\CommunicationsSchema;
use Tests\Support\UserSchema;

trait RefreshCommunications
{
    use RefreshDatabase;

    protected function afterRefreshingDatabase(): void
    {
        if (! Schema::hasTable('users')) {
            UserSchema::create();
        }

        CommunicationsSchema::create();
    }

    protected function setUp(): void
    {
        parent::setUp();
        SchemaCache::clear();
    }
}
