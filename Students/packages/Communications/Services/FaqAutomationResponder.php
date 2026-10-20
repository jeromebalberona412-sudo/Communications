<?php

namespace App\Modules\Communications\Services;

use App\Modules\Communications\Models\ChatAutomationFaq;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Models\ConversationParticipant;
use App\Modules\Communications\Models\Message;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Cache;

class FaqAutomationResponder
{
    public const MESSAGE_TYPE = 'automation';

    public const COOLDOWN_SECONDS = 45;

    public function __construct(
        protected ChatAutomationService $automations,
        protected FaqMatcherService $matcher
    ) {}

    /**
     * Attempt to send an automated FAQ reply after a Kabataan message.
     * Only Kabataan text messages can trigger automation.
     */
    public function maybeRespond(
        Conversation $conversation,
        Authenticatable $sender,
        Message $incomingMessage,
        ?int $faqId = null
    ): ?Message {
        if ($incomingMessage->message_type !== 'text') {
            return null;
        }

        if ($incomingMessage->sender_type !== ParticipantTypeResolver::KABATAAN) {
            return null;
        }

        $body = trim((string) ($incomingMessage->body ?? ''));
        if ($body === '') {
            return null;
        }

        $officialParticipant = $this->findOfficialParticipant($conversation);
        if ($officialParticipant === null) {
            return null;
        }

        $faqs = $this->automations->activeFaqsForOfficial((int) $officialParticipant->user_id);
        if ($faqs->isEmpty()) {
            return null;
        }

        /** @var ChatAutomationFaq|null $match */
        $match = null;
        if ($faqId !== null && $faqId > 0) {
            $match = $faqs->first(fn (ChatAutomationFaq $faq) => (int) $faq->id === $faqId);
        }
        if ($match === null) {
            $match = $this->matcher->findBestMatch($body, $faqs);
        }
        if ($match === null) {
            return null;
        }

        // One cooldown per Kabataan sender in a conversation (blocks FAQ spam across questions).
        $cooldownKey = sprintf(
            'chat_faq_cd:%d:%d',
            (int) $conversation->id,
            (int) $sender->id
        );

        if (Cache::has($cooldownKey)) {
            return null;
        }

        $cooldown = (int) config('communications.faq.cooldown_seconds', self::COOLDOWN_SECONDS);
        Cache::put($cooldownKey, 1, max(1, $cooldown));

        $response = Message::query()->create([
            'conversation_id' => $conversation->id,
            'sender_id' => (int) $officialParticipant->user_id,
            'sender_type' => ParticipantTypeResolver::SK_OFFICIAL,
            'body' => (string) $match->automated_response,
            'message_type' => self::MESSAGE_TYPE,
        ]);

        $conversation->touch();

        return $response->load(['sender', 'reactions.user', 'attachments']);
    }

    protected function findOfficialParticipant(Conversation $conversation): ?ConversationParticipant
    {
        if (! $conversation->relationLoaded('participants')) {
            $conversation->load('participants');
        }

        return $conversation->participants
            ->first(fn (ConversationParticipant $p) => $p->user_type === ParticipantTypeResolver::SK_OFFICIAL);
    }
}
