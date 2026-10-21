<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Communications\Models\Call;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Services\DefaultGroupChatService;
use App\Modules\Communications\Support\SchemaCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Call lifecycle for the Teachers portal.
 */
class CommunicationsCallTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SchemaCache::clear();
    }

    public function test_teacher_receives_the_incoming_call_and_the_duration_is_persisted(): void
    {
        $caller = User::factory()->teacher()->create();
        $receiver = User::factory()->teacher()->create();
        $group = $this->group($caller, $receiver);

        $start = $this->actingAs($caller)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'video',
                'receiver_id' => $receiver->id,
            ])
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing');

        $callId = (int) $start->json('call.id');

        $this->actingAs($receiver)
            ->getJson(route('api.communications.calls.ringing'))
            ->assertOk()
            ->assertJsonPath('calls.0.id', $callId)
            ->assertJsonPath('active_call.id', $callId);

        $this->actingAs($receiver)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'accepted',
            ])
            ->assertOk()
            ->assertJsonPath('call.status', 'accepted');

        Call::query()->where('id', $callId)->update([
            'started_at' => now()->subSeconds(65),
            'answered_at' => now()->subSeconds(65),
        ]);

        $this->actingAs($caller)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'ended',
            ])
            ->assertOk()
            ->assertJsonPath('call.status', 'ended');

        $call = Call::query()->findOrFail($callId);
        $this->assertNotNull($call->duration_seconds);
        $this->assertGreaterThanOrEqual(64, (int) $call->duration_seconds);
    }

    public function test_a_rejected_call_never_blocks_the_next_call(): void
    {
        $caller = User::factory()->teacher()->create();
        $receiver = User::factory()->teacher()->create();
        $group = $this->group($caller, $receiver);

        $start = $this->actingAs($caller)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $receiver->id,
            ])
            ->assertCreated();

        $callId = (int) $start->json('call.id');

        $this->actingAs($receiver)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'rejected',
            ])
            ->assertOk()
            ->assertJsonPath('call.status', 'rejected');

        $this->actingAs($caller)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $receiver->id,
            ])
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing');
    }

    public function test_the_call_state_endpoint_returns_the_authoritative_record(): void
    {
        $caller = User::factory()->teacher()->create();
        $receiver = User::factory()->teacher()->create();
        $group = $this->group($caller, $receiver);

        $start = $this->actingAs($caller)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $receiver->id,
            ])
            ->assertCreated();

        $callId = (int) $start->json('call.id');

        $this->actingAs($receiver)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'accepted',
            ])
            ->assertOk();

        $this->actingAs($caller)
            ->getJson(route('api.communications.calls.show', ['call' => $callId]))
            ->assertOk()
            ->assertJsonPath('call.id', $callId)
            ->assertJsonPath('call.status', 'accepted')
            ->assertJsonStructure(['call' => ['id', 'status', 'started_at', 'ended_at', 'duration_seconds', 'peer', 'server_time']]);
    }

    public function test_a_user_cannot_control_a_call_they_are_not_part_of(): void
    {
        $caller = User::factory()->teacher()->create();
        $receiver = User::factory()->teacher()->create();
        $outsider = User::factory()->teacher()->create();
        $group = $this->group($caller, $receiver);

        $start = $this->actingAs($caller)
            ->postJson(route('api.communications.calls.store', ['conversation' => $group->id]), [
                'call_type' => 'voice',
                'receiver_id' => $receiver->id,
            ])
            ->assertCreated();

        $callId = (int) $start->json('call.id');

        $this->actingAs($outsider)
            ->postJson(route('api.communications.calls.status', ['call' => $callId]), [
                'status' => 'ended',
            ])
            ->assertForbidden();
    }

    private function group(User $owner, User $member): Conversation
    {
        $group = Conversation::query()->create([
            'conversation_type' => 'group',
            'name' => 'Capstone 2',
            'default_group_type' => DefaultGroupChatService::TYPE_CAPSTONE,
            'max_members' => 500,
        ]);

        foreach ([[$owner, 'admin'], [$member, 'member']] as [$user, $role]) {
            ConversationParticipant::query()->create([
                'conversation_id' => $group->id,
                'user_id' => $user->id,
                'user_type' => 'teachers',
                'participant_role' => $role,
                'joined_at' => now(),
            ]);
        }

        return $group;
    }
}
