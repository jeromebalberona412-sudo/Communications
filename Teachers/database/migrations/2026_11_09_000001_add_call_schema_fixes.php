<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive call-schema fixes. Teachers owns the shared communications schema.
 * Do not run until a database backup exists: php artisan migrate
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('calls')) {
            return;
        }

        Schema::table('calls', function (Blueprint $table) {
            if (! Schema::hasColumn('calls', 'end_reason')) {
                $table->string('end_reason', 32)->nullable();
            }
            if (! Schema::hasColumn('calls', 'ended_by')) {
                $table->unsignedBigInteger('ended_by')->nullable();
            }
            if (! Schema::hasColumn('calls', 'is_group')) {
                $table->boolean('is_group')->nullable()->default(false);
            }
            if (! Schema::hasColumn('calls', 'answered_at')) {
                $table->timestampTz('answered_at')->nullable();
            }
            if (! Schema::hasColumn('calls', 'duration_seconds')) {
                $table->unsignedInteger('duration_seconds')->nullable();
            }
        });

        Schema::table('calls', function (Blueprint $table) {
            $sm = Schema::getConnection()->getSchemaBuilder();
            $indexes = method_exists($sm, 'getIndexes') ? collect($sm->getIndexes('calls'))->pluck('name')->all() : [];
            if (! in_array('calls_conversation_created_idx', $indexes, true)) {
                try {
                    $table->index(['conversation_id', 'created_at'], 'calls_conversation_created_idx');
                } catch (\Throwable $e) {
                    // index may already exist under another name
                }
            }
            if (! in_array('calls_status_idx', $indexes, true)) {
                try {
                    $table->index('status', 'calls_status_idx');
                } catch (\Throwable $e) {
                    // ignore
                }
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('calls')) {
            return;
        }

        Schema::table('calls', function (Blueprint $table) {
            if (Schema::hasColumn('calls', 'ended_by')) {
                $table->dropColumn('ended_by');
            }
            if (Schema::hasColumn('calls', 'is_group')) {
                $table->dropColumn('is_group');
            }
            if (Schema::hasColumn('calls', 'end_reason')) {
                $table->dropColumn('end_reason');
            }
        });
    }
};
