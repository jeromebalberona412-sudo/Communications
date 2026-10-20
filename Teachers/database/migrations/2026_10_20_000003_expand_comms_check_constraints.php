<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        if (Schema::hasTable('messages')) {
            DB::statement('ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check');
            DB::statement("ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (message_type IN ('text', 'image', 'file', 'system', 'call'))");
        }

        if (Schema::hasTable('calls')) {
            DB::statement('ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check');
            DB::statement("ALTER TABLE calls ADD CONSTRAINT calls_status_check CHECK (status IN ('ringing', 'accepted', 'rejected', 'missed', 'cancelled', 'ended', 'ongoing', 'declined'))");
        }
    }

    public function down(): void
    {
        //
    }
};
