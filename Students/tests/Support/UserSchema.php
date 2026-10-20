<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class UserSchema
{
    public static function create(): void
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
    }
};
