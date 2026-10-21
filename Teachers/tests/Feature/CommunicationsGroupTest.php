<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Services\DefaultGroupChatService;
use App\Modules\Communications\Support\SchemaCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Group chat invariants for the Teachers portal.
 */
class CommunicationsGroupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SchemaCache::clear();
    }

    public function test_nobody_can_create_an_extra_group(): void
    {
        $teacher = User::factory()->teacher()->create();
        $other = User::factory()->teacher()->create();

        $this->actingAs($teacher)
            ->postJson(route('api.communications.conversations.store'), [
                'is_group' => true,
                'user_ids' => [$other->id],
                'name' => 'Another group',
            ])
            ->assertForbidden()
            ->assertJsonPath(
                'message',
                'Creating additional groups is not allowed. Use the shared Capstone 2 group.'
            );

        $this->assertSame(0, Conversation::query()
            ->where('conversation_type', 'group')
            ->whereRaw("lower(trim(coalesce(name, ''))) like 'another%'")
            ->count());
    }

    public function test_teacher_admin_can_rename_the_shared_group(): void
    {
        $teacher = User::factory()->teacher()->create();
        $group = $this->capstoneGroup($teacher);

        $this->actingAs($teacher)
            ->patchJson(route('api.communications.conversations.rename', ['conversation' => $group->id]), [
                'name' => 'Capstone 2 Team',
            ])
            ->assertOk()
            ->assertJsonPath('conversation.name', 'Capstone 2 Team');

        $this->assertSame('Capstone 2 Team', $group->fresh()->name);
    }

    public function test_a_group_member_without_admin_role_cannot_rename_the_group(): void
    {
        $owner = User::factory()->teacher()->create();
        $member = User::factory()->teacher()->create();
        $group = $this->capstoneGroup($owner, $member, 'member');

        $this->actingAs($member)
            ->patchJson(route('api.communications.conversations.rename', ['conversation' => $group->id]), [
                'name' => 'Hijacked',
            ])
            ->assertForbidden();

        $this->assertSame('Capstone 2', $group->fresh()->name);
    }

    public function test_a_group_member_without_admin_role_cannot_change_the_group_photo(): void
    {
        $owner = User::factory()->teacher()->create();
        $member = User::factory()->teacher()->create();
        $group = $this->capstoneGroup($owner, $member, 'member');

        $this->actingAs($member)
            ->postJson(route('api.communications.conversations.avatar', ['conversation' => $group->id]))
            ->assertForbidden();

        $this->assertNull($group->fresh()->avatar_url);
    }

    public function test_member_list_is_paginated(): void
    {
        $teacher = User::factory()->teacher()->create();
        $group = $this->capstoneGroup($teacher);

        for ($i = 0; $i < 14; $i++) {
            $member = User::factory()->teacher()->create();
            ConversationParticipant::query()->create([
                'conversation_id' => $group->id,
                'user_id' => $member->id,
                'user_type' => 'teachers',
                'participant_role' => 'member',
                'joined_at' => now(),
            ]);
        }

        $this->actingAs($teacher)
            ->getJson(route('api.communications.conversations.members', [
                'conversation' => $group->id,
                'page' => 1,
                'per_page' => 10,
            ]))
            ->assertOk()
            ->assertJsonPath('per_page', 10)
            ->assertJsonCount(10, 'members')
            ->assertJsonPath('has_more', true)
            ->assertJsonPath('member_count', 15);

        $this->actingAs($teacher)
            ->getJson(route('api.communications.conversations.members', [
                'conversation' => $group->id,
                'page' => 2,
                'per_page' => 10,
            ]))
            ->assertOk()
            ->assertJsonCount(5, 'members')
            ->assertJsonPath('has_more', false);
    }

    public function test_conversation_list_contains_the_shared_group(): void
    {
        $teacher = User::factory()->teacher()->create();

        $response = $this->actingAs($teacher)
            ->getJson(route('api.communications.conversations.index'))
            ->assertOk();

        $ids = collect($response->json('conversations'))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $group = Conversation::query()
            ->where('default_group_type', DefaultGroupChatService::TYPE_CAPSTONE)
            ->firstOrFail();

        $this->assertContains((int) $group->id, $ids);
    }

    /**
     * Create the shared group and add the given users as members.
     */
    private function capstoneGroup(User $owner, ?User $member = null, string $memberRole = 'admin'): Conversation
    {
        $group = Conversation::query()->create([
            'conversation_type' => 'group',
            'name' => 'Capstone 2',
            'default_group_type' => DefaultGroupChatService::TYPE_CAPSTONE,
            'max_members' => 500,
        ]);

        ConversationParticipant::query()->create([
            'conversation_id' => $group->id,
            'user_id' => $owner->id,
            'user_type' => 'teachers',
            'participant_role' => 'admin',
            'joined_at' => now(),
        ]);

        if ($member) {
            ConversationParticipant::query()->create([
                'conversation_id' => $group->id,
                'user_id' => $member->id,
                'user_type' => 'teachers',
                'participant_role' => $memberRole,
                'joined_at' => now(),
            ]);
        }

        return $group;
    }
}
