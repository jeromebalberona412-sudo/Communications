<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Communications\Models\Call;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Models\Message;
use App\Modules\Communications\Services\DefaultGroupChatService;
use Tests\Concerns\RefreshCommunications;
use Tests\TestCase;

/**
 * Student portal behaviour of the shared group chat and the call flow.
 */
class CommunicationsStudentTest extends TestCase
{
    use RefreshCommunications;

    public function test_new_student_sees_the_shared_group_immediately(): void
    {
        $teacher = User::factory()->teacher()->create();
        $student = User::factory()->student()->create();

        $response = $this->actingAs($student)
            ->getJson(route('api.communications.conversations.index'))
            ->assertOk();

        $group = Conversation::query()
            ->where('default_group_type', DefaultGroupChatService::TYPE_CAPSTONE)
            ->firstOrFail();

        $ids = collect($response->json('conversations'))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->assertContains((int) $group->id, $ids);
        $this->assertSame(1, ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $student->id)
            ->count());
        $this->assertSame(1, ConversationParticipant::query()
            ->where('conversation_id', $group->id)
            ->where('user_id', $teacher->id)
            ->count());
    }

    public function test_students_cannot_create_an_extra_group(): void
    {
        $student = User::factory()->student()->create();
        $other = User::factory()->student()->create();

        $this->actingAs($student)
            ->postJson(route('api.communications.conversations.store'), [
                'is_group' => true,
                'user_ids' => [$other->id],
                'name' => 'Sneaky group',
            ])
            ->assertForbidden();

        $this->assertSame(0, Conversation::query()
            ->where('conversation_type', 'group')
            ->whereRaw("lower(trim(coalesce(name, ''))) like 'sneaky%'")
            ->count());
    }

    public function test_students_cannot_rename_or_repicture_the_shared_group(): void
    {
        $student = User::factory()->student()->create();
        $group = $this->capstoneGroup($student);

        $this->actingAs($student)
            ->patchJson(route('api.communications.conversations.rename', ['conversation' => $group->id]), [
                'name' => 'Hijacked',
            ])
            ->assertForbidden();

        $this->actingAs($student)
            ->postJson(route('api.communications.conversations.avatar', ['conversation' => $group->id]))
            ->assertForbidden();

        $this->assertSame('Capstone 2', $group->fresh()->name);
    }

    public function test_student_can_send_a_message_to_the_shared_group(): void
    {
        $student = User::factory()->student()->create();
        $group = $this->capstoneGroup($student);

        $this->actingAs($student)
            ->postJson(route('api.communications.messages.store', ['conversation' => $group->id]), [
                'body' => 'Hello everyone',
            ])
            ->assertCreated()
            ->assertJsonPath('message.body', 'Hello everyone');

        $this->assertSame(1, Message::query()
            ->where('conversation_id', $group->id)
            ->where('body', 'Hello everyone')
            ->count());
    }

    public function test_receiver_gets_the_incoming_call_and_the_final_duration_is_persisted(): void
    {
        $student = User::factory()->student()->create();
        $peer = User::factory()->student()->create();
        $group = $this->capstoneGroup($student, $peer);

        $start = $this->actingAs($student)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $peer->id,
            ])
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing');

        $callId = (int) $start->json('call.id');

        // The receiver sees the call as ringing.
        $this->actingAs($peer)
            ->getJson(route('api.communications.calls.ringing'))
            ->assertOk()
            ->assertJsonPath('calls.0.id', $callId);

        // The receiver accepts it.
        $this->actingAs($peer)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'accepted',
            ])
            ->assertOk()
            ->assertJsonPath('call.status', 'accepted');

        // Backdating the connection makes the duration deterministic.
        Call::query()->where('id', $callId)->update([
            'started_at' => now()->subSeconds(90),
            'answered_at' => now()->subSeconds(90),
        ]);

        $this->actingAs($student)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'ended',
            ])
            ->assertOk()
            ->assertJsonPath('call.status', 'ended');

        $call = Call::query()->findOrFail($callId);
        $this->assertNotNull($call->duration_seconds);
        $this->assertGreaterThanOrEqual(89, (int) $call->duration_seconds);
        $this->assertNotNull($call->ended_at);
    }

    public function test_a_finished_call_does_not_block_the_next_call(): void
    {
        $student = User::factory()->student()->create();
        $peer = User::factory()->student()->create();
        $group = $this->capstoneGroup($student, $peer);

        $start = $this->actingAs($student)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'video',
                'receiver_id' => $peer->id,
            ])
            ->assertCreated();

        $callId = (int) $start->json('call.id');

        $this->actingAs($peer)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'ended',
            ])
            ->assertOk();

        // A second call must be possible right away.
        $this->actingAs($student)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'video',
                'receiver_id' => $peer->id,
            ])
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing');
    }

    public function test_heartbeat_keeps_an_active_call_alive_and_never_revives_a_finished_one(): void
    {
        $student = User::factory()->student()->create();
        $peer = User::factory()->student()->create();
        $group = $this->capstoneGroup($student, $peer);

        $start = $this->actingAs($student)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $peer->id,
            ])
            ->assertCreated();

        $callId = (int) $start->json('call.id');

        $this->actingAs($peer)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'accepted',
            ])
            ->assertOk();

        $this->actingAs($peer)
            ->postJson(route('api.communications.calls.heartbeat', ['call' => $callId]))
            ->assertOk()
            ->assertJsonPath('call.status', 'accepted');

        $this->actingAs($peer)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'ended',
            ])
            ->assertOk();

        // A heartbeat on a finished call must not revive it.
        $this->actingAs($peer)
            ->postJson(route('api.communications.calls.heartbeat', ['call' => $callId]))
            ->assertOk()
            ->assertJsonPath('call.status', 'ended');
    }

    public function test_ring_endpoint_reports_the_authoritative_active_call(): void
    {
        $student = User::factory()->student()->create();
        $peer = User::factory()->student()->create();
        $group = $this->capstoneGroup($student, $peer);

        $this->actingAs($student)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $peer->id,
            ])
            ->assertCreated();

        $response = $this->actingAs($peer)
            ->getJson(route('api.communications.calls.ringing'))
            ->assertOk();

        $this->assertNotNull($response->json('active_call'), 'The receiver must know the active call id.');
        $this->assertSame('ringing', $response->json('active_call.status'));
    }

    /**
     * Create the shared group with the given members.
     */
    private function capstoneGroup(User $student, ?User $peer = null): Conversation
    {
        $group = Conversation::query()->create([
            'conversation_type' => 'group',
            'name' => 'Capstone 2',
            'default_group_type' => DefaultGroupChatService::TYPE_CAPSTONE,
            'max_members' => 500,
        ]);

        ConversationParticipant::query()->create([
            'conversation_id' => $group->id,
            'user_id' => $student->id,
            'user_type' => 'students',
            'participant_role' => 'member',
            'joined_at' => now(),
        ]);

        if ($peer) {
            ConversationParticipant::query()->create([
                'conversation_id' => $group->id,
                'user_id' => $peer->id,
                'user_type' => 'students',
                'participant_role' => 'member',
                'joined_at' => now(),
            ]);
        }

        return $group;
    }
}
