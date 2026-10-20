<?php

namespace App\Modules\Communications\Services;

use App\Modules\Communications\Models\ChatAutomation;
use App\Modules\Communications\Models\ChatAutomationFaq;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class ChatAutomationService
{
    public const MAX_FAQS = 10;

    public const QUESTION_MAX = 50;

    public const RESPONSE_MAX = 500;

    public function getOrCreateForOfficial(Authenticatable $user): ChatAutomation
    {
        if (! Schema::hasTable('chat_automations')) {
            throw ValidationException::withMessages([
                'automation' => ['Chat automation tables are not installed. Run database migrations.'],
            ]);
        }

        $existing = ChatAutomation::query()
            ->where('sk_official_id', (int) $user->id)
            ->first();

        if ($existing) {
            return $existing;
        }

        $automation = new ChatAutomation;
        $automation->sk_official_id = (int) $user->id;
        $automation->is_enabled = true;
        $automation->save();

        return $automation;
    }

    public function forOfficial(Authenticatable $user): ChatAutomation
    {
        $automation = $this->getOrCreateForOfficial($user);
        $automation->load(['faqs' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')]);

        return $automation;
    }

    public function assertOwnsFaq(Authenticatable $user, ChatAutomationFaq $faq): void
    {
        $automation = $faq->automation;
        abort_if($automation === null, 404);
        abort_if((int) $automation->sk_official_id !== (int) $user->id, 403);
    }

    /**
     * @return array{id: int, is_enabled: bool, faqs: list<array<string, mixed>>, faq_count: int, max_faqs: int}
     */
    public function serializeAutomation(ChatAutomation $automation): array
    {
        $faqs = $automation->faqs
            ->map(fn (ChatAutomationFaq $faq) => $this->serializeFaq($faq))
            ->values()
            ->all();

        return [
            'id' => (int) $automation->id,
            'is_enabled' => (bool) $automation->is_enabled,
            'faqs' => $faqs,
            'faq_count' => count($faqs),
            'max_faqs' => self::MAX_FAQS,
        ];
    }

    /**
     * @return array{id: int, question: string, automated_response: string, is_active: bool, sort_order: int, created_at: ?string, updated_at: ?string}
     */
    public function serializeFaq(ChatAutomationFaq $faq): array
    {
        return [
            'id' => (int) $faq->id,
            'question' => (string) $faq->question,
            'automated_response' => (string) $faq->automated_response,
            'is_active' => (bool) $faq->is_active,
            'sort_order' => (int) $faq->sort_order,
            'created_at' => optional($faq->created_at)?->toIso8601String(),
            'updated_at' => optional($faq->updated_at)?->toIso8601String(),
        ];
    }

    public function setEnabled(Authenticatable $user, bool $enabled): ChatAutomation
    {
        $automation = $this->getOrCreateForOfficial($user);
        $automation->is_enabled = $enabled;
        $automation->save();
        $this->forgetSuggestionCache((int) $user->id);

        return $this->forOfficial($user);
    }

    /**
     * Kabataan only receives FAQs when the master switch is On.
     * Saving an active question turns the switch On so chips appear immediately.
     */
    protected function ensureMasterEnabled(ChatAutomation $automation): void
    {
        if (filter_var($automation->is_enabled, FILTER_VALIDATE_BOOLEAN)) {
            return;
        }

        $automation->is_enabled = true;
        $automation->save();
    }

    /**
     * @param  array{question: string, automated_response: string, is_active?: bool}  $data
     */
    public function createFaq(Authenticatable $user, array $data): ChatAutomationFaq
    {
        $automation = $this->getOrCreateForOfficial($user);

        $count = ChatAutomationFaq::query()
            ->where('chat_automation_id', $automation->id)
            ->count();

        if ($count >= self::MAX_FAQS) {
            throw ValidationException::withMessages([
                'question' => ['You can add a maximum of '.self::MAX_FAQS.' frequently asked questions.'],
            ]);
        }

        $maxOrder = (int) ChatAutomationFaq::query()
            ->where('chat_automation_id', $automation->id)
            ->max('sort_order');

        $isActive = array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true;

        $faq = ChatAutomationFaq::query()->create([
            'chat_automation_id' => $automation->id,
            'question' => $data['question'],
            'automated_response' => $data['automated_response'],
            'is_active' => $isActive,
            'sort_order' => $maxOrder + 1,
        ]);

        if ($isActive) {
            $this->ensureMasterEnabled($automation);
        }

        $this->forgetSuggestionCache((int) $user->id);

        return $faq;
    }

    /**
     * @param  array{question?: string, automated_response?: string, is_active?: bool}  $data
     */
    public function updateFaq(Authenticatable $user, ChatAutomationFaq $faq, array $data): ChatAutomationFaq
    {
        $this->assertOwnsFaq($user, $faq);

        if (array_key_exists('question', $data)) {
            $faq->question = $data['question'];
        }
        if (array_key_exists('automated_response', $data)) {
            $faq->automated_response = $data['automated_response'];
        }
        if (array_key_exists('is_active', $data)) {
            $faq->is_active = (bool) $data['is_active'];
        }

        $faq->save();

        if (filter_var($faq->is_active, FILTER_VALIDATE_BOOLEAN)) {
            $automation = $faq->automation ?? $this->getOrCreateForOfficial($user);
            $this->ensureMasterEnabled($automation);
        }

        $this->forgetSuggestionCache((int) $user->id);

        return $faq->fresh();
    }

    public function deleteFaq(Authenticatable $user, ChatAutomationFaq $faq): void
    {
        $this->assertOwnsFaq($user, $faq);
        $faq->delete();
        $this->forgetSuggestionCache((int) $user->id);
    }

    public function setFaqActive(Authenticatable $user, ChatAutomationFaq $faq, bool $active): ChatAutomationFaq
    {
        $this->assertOwnsFaq($user, $faq);
        $faq->is_active = $active;
        $faq->save();

        if ($active) {
            $automation = $faq->automation ?? $this->getOrCreateForOfficial($user);
            $this->ensureMasterEnabled($automation);
        }

        $this->forgetSuggestionCache((int) $user->id);

        return $faq->fresh();
    }

    public function moveFaq(Authenticatable $user, ChatAutomationFaq $faq, string $direction): Collection
    {
        $this->assertOwnsFaq($user, $faq);
        $automationId = (int) $faq->chat_automation_id;
        $officialId = (int) $user->id;

        $faqs = DB::transaction(function () use ($faq, $direction, $automationId) {
            $faqs = ChatAutomationFaq::query()
                ->where('chat_automation_id', $automationId)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $index = $faqs->search(fn (ChatAutomationFaq $item) => (int) $item->id === (int) $faq->id);
            if ($index === false) {
                abort(404);
            }

            $swapWith = $direction === 'up' ? $index - 1 : $index + 1;
            if ($swapWith < 0 || $swapWith >= $faqs->count()) {
                return $faqs;
            }

            $current = $faqs[$index];
            $neighbor = $faqs[$swapWith];
            $currentOrder = (int) $current->sort_order;
            $current->sort_order = (int) $neighbor->sort_order;
            $neighbor->sort_order = $currentOrder;
            $current->save();
            $neighbor->save();

            return ChatAutomationFaq::query()
                ->where('chat_automation_id', $automationId)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get();
        });

        $this->forgetSuggestionCache($officialId);

        return $faqs;
    }

    /**
     * Active FAQ suggestions for Kabataan when chatting with a specific official.
     *
     * @return list<array{id: int, question: string, automated_response: string}>
     */
    public function activeSuggestionsForOfficial(int $skOfficialId): array
    {
        if (! Schema::hasTable('chat_automations') || ! Schema::hasTable('chat_automation_faqs')) {
            return [];
        }

        $automation = ChatAutomation::query()
            ->where('sk_official_id', $skOfficialId)
            ->whereRaw('is_enabled IS TRUE')
            ->first();

        if ($automation === null) {
            return [];
        }

        return ChatAutomationFaq::query()
            ->where('chat_automation_id', $automation->id)
            ->whereRaw('is_active IS TRUE')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->limit(self::MAX_FAQS)
            ->get(['id', 'question', 'automated_response'])
            ->map(fn (ChatAutomationFaq $faq) => [
                'id' => (int) $faq->id,
                'question' => (string) $faq->question,
                'automated_response' => (string) $faq->automated_response,
            ])
            ->all();
    }

    public function forgetSuggestionCache(int $skOfficialId): void
    {
        Cache::forget('chat_faq_suggestions_v4:'.$skOfficialId);
        Cache::forget('chat_faq_suggestions_v3:'.$skOfficialId);
        Cache::forget('chat_faq_suggestions_v2:'.$skOfficialId);
    }

    /**
     * @return Collection<int, ChatAutomationFaq>
     */
    public function activeFaqsForOfficial(int $skOfficialId): Collection
    {
        if (! Schema::hasTable('chat_automations') || ! Schema::hasTable('chat_automation_faqs')) {
            return collect();
        }

        $automation = ChatAutomation::query()
            ->where('sk_official_id', $skOfficialId)
            ->whereRaw('is_enabled IS TRUE')
            ->first();

        if ($automation === null) {
            return collect();
        }

        return ChatAutomationFaq::query()
            ->where('chat_automation_id', $automation->id)
            ->whereRaw('is_active IS TRUE')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->limit(self::MAX_FAQS)
            ->get();
    }
}
