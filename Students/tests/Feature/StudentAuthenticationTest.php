<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\Concerns\RefreshUsers;
use Tests\TestCase;

class StudentAuthenticationTest extends TestCase
{
    use RefreshUsers;

    public function test_student_can_log_in_and_reach_the_dashboard(): void
    {
        $student = User::factory()->student()->create([
            'student_id' => 'STU-1001',
            'name' => 'Ana Cruz',
            'password' => 'password',
        ]);

        $this->post(route('students.login.store'), [
            'student_id' => 'STU-1001',
            'password' => 'password',
        ])->assertRedirect(route('students.dashboard'));

        $this->assertAuthenticatedAs($student);
        $this->get(route('students.dashboard'))
            ->assertOk()
            ->assertSee('Ana Cruz')
            ->assertSee('STU-1001');
    }

    public function test_invalid_credentials_are_rejected(): void
    {
        User::factory()->student()->create([
            'student_id' => 'STU-1001',
            'password' => 'password',
        ]);

        $this->from(route('students.login'))
            ->post(route('students.login.store'), [
                'student_id' => 'STU-1001',
                'password' => 'wrong-password',
            ])
            ->assertRedirect(route('students.login'))
            ->assertSessionHasErrors('student_id');

        $this->assertGuest();
    }

    public function test_teacher_accounts_cannot_log_in(): void
    {
        $teacher = User::factory()->teacher()->create([
            'password' => 'password',
        ]);
        $teacher->forceFill(['student_id' => 'TCH-1001'])->save();

        $this->from(route('students.login'))
            ->post(route('students.login.store'), [
                'student_id' => 'TCH-1001',
                'password' => 'password',
            ])
            ->assertSessionHasErrors('student_id');

        $this->assertGuest();
    }

    public function test_inactive_students_cannot_log_in(): void
    {
        User::factory()->student()->inactive()->create([
            'student_id' => 'STU-1001',
            'password' => 'password',
        ]);

        $this->from(route('students.login'))
            ->post(route('students.login.store'), [
                'student_id' => 'STU-1001',
                'password' => 'password',
            ])
            ->assertSessionHasErrors('student_id');

        $this->assertGuest();
    }

    public function test_guests_cannot_access_the_dashboard(): void
    {
        $this->get(route('students.dashboard'))
            ->assertRedirect(route('students.login'));
    }

    public function test_logout_invalidates_the_session(): void
    {
        $student = User::factory()->student()->create();

        $this->actingAs($student)
            ->post(route('students.logout'))
            ->assertRedirect(route('students.login'));

        $this->assertGuest();
        $this->get(route('students.dashboard'))
            ->assertRedirect(route('students.login'));
    }
}
