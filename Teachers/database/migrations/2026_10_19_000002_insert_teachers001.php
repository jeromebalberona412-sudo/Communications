<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Insert the default teacher. The password is a bcrypt hash.
     * Running this again does not create a duplicate or change an existing password.
     */
    public function up(): void
    {
        $exists = DB::table('users')->where('username', 'Teachers001')->exists();

        if ($exists) {
            return;
        }

        $now = now();

        DB::table('users')->insert([
            'username' => 'Teachers001',
            'student_id' => null,
            'name' => 'Teachers001',
            'password' => '$2y$12$BfpcOLdmDqsHSLCrAiv2T.9isLrJgWyCVEXBggtstn.Qp1uXlLat2',
            'role' => 'teachers',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        // The teacher account is left in place so a rollback cannot delete it.
    }
};
