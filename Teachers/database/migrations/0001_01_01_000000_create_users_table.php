<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Canonical shared users schema. Do not run this against Supabase
     * until the reviewed SQL script in database/sql/supabase_users.sql
     * has been approved and executed manually.
     */
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            return;
        }

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('student_id', 30)->nullable();
            $table->string('username', 30)->nullable();
            $table->string('name')->nullable();
            $table->string('password');
            $table->string('role', 20);
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
        });

        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS users_student_id_unique ON users (student_id) WHERE student_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username) WHERE username IS NOT NULL');
        DB::statement('CREATE INDEX IF NOT EXISTS users_role_index ON users (role)');

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('students', 'teachers'))");
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_identifier_check CHECK ((role = 'students' AND student_id IS NOT NULL) OR (role = 'teachers' AND username IS NOT NULL))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
