<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * The shared users table is owned by the Teachers application and by
     * database/sql/supabase_users.sql. This migration is intentionally empty
     * so the Students application cannot create or drop that table.
     */
    public function up(): void
    {
        //
    }

    public function down(): void
    {
        //
    }
};
