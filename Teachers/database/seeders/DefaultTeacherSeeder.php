<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DefaultTeacherSeeder extends Seeder
{
    public function run(): void
    {
        $existing = User::query()->where('username', 'Teacher_001')->first();

        if ($existing) {
            $this->command?->info('Teacher_001 already exists. The password was left unchanged.');

            return;
        }

        $hash = $this->secret('TEACHER_PASSWORD_HASH');
        $plain = $this->secret('TEACHER_PASSWORD');
        $password = $hash ?? $plain;

        if ($password === null) {
            $this->command?->warn('Set TEACHER_PASSWORD or TEACHER_PASSWORD_HASH before seeding Teacher_001. No account was created.');

            return;
        }

        User::query()->create([

            'username' => 'Teacher_001',
            'student_id' => null,
            'name' => 'Default Teacher',
            'password' => $password,
            'role' => 'teachers',
            'is_active' => true,
        ]);
    }

    private function secret(string $key): ?string
    {
        $fromProcess = getenv($key);
        $value = is_string($fromProcess) && $fromProcess !== '' ? $fromProcess : env($key);

        return is_string($value) && $value !== '' ? $value : null;
    }
}
