<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'student_id' => 'STU-'.fake()->unique()->numerify('#####'),
            'username' => null,
            'role' => 'students',
            'is_active' => true,
            'password' => static::$password ??= 'password',
        ];
    }

    public function student(): static
    {
        return $this->state(fn () => [
            'role' => 'students',
            'username' => null,
            'student_id' => 'STU-'.fake()->unique()->numerify('#####'),
        ]);
    }

    public function teacher(): static
    {
        return $this->state(fn () => [
            'role' => 'teachers',
            'student_id' => null,
            'username' => 'teacher_'.fake()->unique()->numerify('###'),
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => [
            'is_active' => false,
        ]);
    }
}
