<?php

namespace Tests\Feature;

use App\Http\Middleware\VerifyCsrfToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StudentManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_teachers_see_only_student_accounts(): void
    {
        $teacher = User::factory()->teacher()->create([
            'name' => 'Hidden Teacher',
            'username' => 'hidden_teacher',
        ]);
        User::factory()->student()->create([
            'student_id' => 'STU-111',
            'name' => 'Visible Student',
        ]);

        $this->actingAs($teacher)
            ->get(route('teachers.students.index'))
            ->assertOk()
            ->assertSee('STU-111')
            ->assertSee('Visible Student')
            ->assertDontSee('hidden_teacher');
    }

    public function test_search_and_pagination_limit_the_student_list(): void
    {
        $teacher = User::factory()->teacher()->create();

        foreach (range(1, 12) as $number) {
            User::factory()->student()->create([
                'student_id' => sprintf('STU-%04d', $number),
                'name' => 'Student '.$number,
            ]);
        }

        $this->actingAs($teacher)
            ->get(route('teachers.students.index', ['q' => 'STU-0001']))
            ->assertOk()
            ->assertSee('STU-0001')
            ->assertDontSee('STU-0002');

        $this->actingAs($teacher)
            ->get(route('teachers.students.index', ['page' => 2]))
            ->assertOk()
            ->assertSee('STU-0011')
            ->assertDontSee('STU-0001');
    }

    public function test_teacher_can_create_a_student_with_a_hashed_password(): void
    {
        $teacher = User::factory()->teacher()->create();

        $this->actingAs($teacher)
            ->post(route('teachers.students.store'), [
                'student_id' => 'STU-2001',
                'name' => 'Luis Reyes',
                'password' => 'Secret123',
                'password_confirmation' => 'Secret123',
                'role' => 'teachers',
            ])
            ->assertRedirect(route('teachers.students.index'));

        $student = User::query()->where('student_id', 'STU-2001')->first();

        $this->assertNotNull($student);
        $this->assertSame('students', $student->role);
        $this->assertTrue($student->is_active);
        $this->assertNull($student->username);
        $this->assertTrue(Hash::check('Secret123', $student->password));
        $this->assertNotSame('Secret123', $student->password);
    }

    public function test_duplicate_student_ids_are_rejected(): void
    {
        $teacher = User::factory()->teacher()->create();
        User::factory()->student()->create(['student_id' => 'STU-2001']);

        $this->actingAs($teacher)
            ->from(route('teachers.students.create'))
            ->post(route('teachers.students.store'), [
                'student_id' => 'STU-2001',
                'password' => 'Secret123',
                'password_confirmation' => 'Secret123',
            ])
            ->assertRedirect(route('teachers.students.create'))
            ->assertSessionHasErrors('student_id');

        $this->assertSame(1, User::query()->where('student_id', 'STU-2001')->count());
    }

    public function test_missing_csrf_token_is_rejected(): void
    {
        $this->app->instance(VerifyCsrfToken::class, new class($this->app, $this->app->make('encrypter')) extends VerifyCsrfToken
        {
            protected function runningUnitTests()
            {
                return false;
            }
        });

        $teacher = User::factory()->teacher()->create();

        $this->actingAs($teacher)
            ->post(route('teachers.students.store'), [
                'student_id' => 'STU-3001',
                'password' => 'Secret123',
                'password_confirmation' => 'Secret123',
            ])
            ->assertStatus(419);
    }
}
