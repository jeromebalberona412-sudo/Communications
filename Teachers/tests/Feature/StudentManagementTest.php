<?php

namespace Tests\Feature;

use App\Http\Middleware\VerifyCsrfToken;
use App\Models\User;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Services\DefaultGroupChatService;
use App\Modules\Communications\Support\SchemaCache;
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
            ->assertRedirect(route('communications.index'))
            ->assertSessionHas('status');

        $student = User::query()->where('student_id', 'STU-2001')->first();

        $this->assertNotNull($student);
        $this->assertSame('students', $student->role);
        $this->assertTrue($student->is_active);
        $this->assertNull($student->username);
        $this->assertTrue(Hash::check('Secret123', $student->password));
        $this->assertNotSame('Secret123', $student->password);
    }

    public function test_new_student_is_added_to_the_shared_group_chat_exactly_once(): void
    {
        SchemaCache::clear();

        $teacher = User::factory()->teacher()->create();
        $existing = User::factory()->student()->create(['student_id' => 'STU-1999']);

        $this->actingAs($teacher)
            ->post(route('teachers.students.store'), [
                'student_id' => 'STU-2002',
                'name' => 'New Student',
                'password' => 'Secret123',
                'password_confirmation' => 'Secret123',
            ])
            ->assertRedirect(route('communications.index'));

        $student = User::query()->where('student_id', 'STU-2002')->firstOrFail();
        $group = Conversation::query()
            ->where('default_group_type', DefaultGroupChatService::TYPE_CAPSTONE)
            ->firstOrFail();

        $this->assertSame('Capstone 2', $group->name);
        $this->assertSame(1, ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $student->id)
            ->count(), 'The new student must have exactly one group membership.');

        // The teacher and previously existing students stay members as well.
        $this->assertSame(1, ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $teacher->id)
            ->count());
        $this->assertSame(1, ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $existing->id)
            ->count());

        // Retrying the membership write must not create a second row.
        app(DefaultGroupChatService::class)->addUserToCapstoneGroup((int) $student->id);
        app(DefaultGroupChatService::class)->addUserToCapstoneGroup((int) $student->id);

        $this->assertSame(1, ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $student->id)
            ->count());
    }

    public function test_only_one_shared_group_chat_exists(): void
    {
        SchemaCache::clear();

        $teacher = User::factory()->teacher()->create();
        User::factory()->student()->create();

        $this->actingAs($teacher)
            ->get(route('communications.index'))
            ->assertOk();

        $groups = Conversation::query()
            ->where('conversation_type', 'group')
            ->where(function ($query) {
                $query->where('default_group_type', DefaultGroupChatService::TYPE_CAPSTONE)
                    ->orWhereRaw("lower(trim(coalesce(name, ''))) like 'capstone%'");
            })
            ->get();

        $this->assertCount(1, $groups, 'Exactly one shared group chat may exist.');
        $this->assertSame('Capstone 2', $groups->first()->name);
        $this->assertSame(DefaultGroupChatService::TYPE_CAPSTONE, $groups->first()->default_group_type);
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
