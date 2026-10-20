<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DefaultTeacherSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TeacherAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_teacher_can_log_in_and_reach_the_dashboard(): void
    {
        $teacher = User::factory()->teacher()->create([
            'username' => 'Teacher_001',
            'name' => 'Default Teacher',
            'password' => 'password',
        ]);

        $this->post(route('teachers.login.store'), [
            'username' => 'Teacher_001',
            'password' => 'password',
        ])->assertRedirect(route('teachers.dashboard'));

        $this->assertAuthenticatedAs($teacher);
        $this->get(route('teachers.dashboard'))
            ->assertOk()
            ->assertSee('Default Teacher')
            ->assertSee('Teacher_001');
    }

    public function test_student_accounts_cannot_log_in(): void
    {
        $student = User::factory()->student()->create([
            'password' => 'password',
        ]);
        $student->forceFill(['username' => 'student_login'])->save();

        $this->from(route('teachers.login'))
            ->post(route('teachers.login.store'), [
                'username' => 'student_login',
                'password' => 'password',
            ])
            ->assertSessionHasErrors('username');

        $this->assertGuest();
    }

    public function test_inactive_teachers_cannot_log_in(): void
    {
        User::factory()->teacher()->inactive()->create([
            'username' => 'Teacher_001',
            'password' => 'password',
        ]);

        $this->from(route('teachers.login'))
            ->post(route('teachers.login.store'), [
                'username' => 'Teacher_001',
                'password' => 'password',
            ])
            ->assertSessionHasErrors('username');

        $this->assertGuest();
    }

    public function test_guests_cannot_access_protected_routes(): void
    {
        $this->get(route('teachers.dashboard'))->assertRedirect(route('teachers.login'));
        $this->get(route('teachers.students.index'))->assertRedirect(route('teachers.login'));
        $this->get(route('teachers.students.create'))->assertRedirect(route('teachers.login'));
    }

    public function test_default_teacher_seeder_is_idempotent_and_does_not_reset_the_password(): void
    {
        putenv('TEACHER_PASSWORD=TestPass123');

        $this->seed(DefaultTeacherSeeder::class);
        $this->seed(DefaultTeacherSeeder::class);

        $teacher = User::query()->where('username', 'Teacher_001')->first();

        $this->assertNotNull($teacher);
        $this->assertSame(1, User::query()->where('username', 'Teacher_001')->count());
        $this->assertTrue(Hash::check('TestPass123', $teacher->password));
        $this->assertSame('teachers', $teacher->role);

        $original = $teacher->password;
        putenv('TEACHER_PASSWORD=ChangedPass123');
        $this->seed(DefaultTeacherSeeder::class);

        $this->assertSame($original, $teacher->fresh()->password);
        putenv('TEACHER_PASSWORD');
    }
}
