<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('messages') && Schema::hasColumn('messages', 'chat_id')) {
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                DB::statement('ALTER TABLE messages ALTER COLUMN chat_id DROP NOT NULL');
            } else {
                Schema::table('messages', function (Blueprint $table) {
                    $table->unsignedBigInteger('chat_id')->nullable()->change();
                });
            }
        }

        if (Schema::hasTable('calls') && Schema::hasColumn('calls', 'chat_id')) {
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                DB::statement('ALTER TABLE calls ALTER COLUMN chat_id DROP NOT NULL');
            } else {
                Schema::table('calls', function (Blueprint $table) {
                    $table->unsignedBigInteger('chat_id')->nullable()->change();
                });
            }
        }
    }

    public function down(): void
    {
        //
    }
};
