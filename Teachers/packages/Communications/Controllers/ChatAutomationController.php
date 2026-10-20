<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Models\ChatAutomationFaq;
use App\Modules\Communications\Requests\StoreChatAutomationFaqRequest;
use App\Modules\Communications\Requests\UpdateChatAutomationFaqRequest;
use App\Modules\Communications\Services\ChatAutomationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class ChatAutomationController extends Controller
{
    public function __construct(
        protected ChatAutomationService $automations
    ) {}

    public function page(): View
    {
        return view('communications::automations', [
            'routes' => [
                'show' => route('api.communications.automations.show'),
                'toggle' => route('api.communications.automations.toggle'),
                'faqs' => route('api.communications.automations.faqs.store'),
                'faq' => url('/api/communications/automations/faqs/__ID__'),
                'faqToggle' => url('/api/communications/automations/faqs/__ID__/toggle'),
                'faqMove' => url('/api/communications/automations/faqs/__ID__/move'),
                'messagesPage' => route('communications.index'),
            ],
        ]);
    }

    public function show(): JsonResponse
    {
        try {
            $automation = $this->automations->forOfficial(Auth::user());

            return response()->json([
                'automation' => $this->automations->serializeAutomation($automation),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: 'Unable to load automations.',
                'automation' => [
                    'id' => 0,
                    'is_enabled' => false,
                    'faqs' => [],
                    'faq_count' => 0,
                    'max_faqs' => ChatAutomationService::MAX_FAQS,
                ],
            ], 503);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Unable to load automations.',
                'automation' => [
                    'id' => 0,
                    'is_enabled' => false,
                    'faqs' => [],
                    'faq_count' => 0,
                    'max_faqs' => ChatAutomationService::MAX_FAQS,
                ],
            ], 500);
        }
    }

    public function toggle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'is_enabled' => ['required', 'boolean'],
        ]);

        $automation = $this->automations->setEnabled(Auth::user(), (bool) $validated['is_enabled']);

        return response()->json([
            'message' => 'Automation settings updated.',
            'automation' => $this->automations->serializeAutomation($automation),
        ]);
    }

    public function storeFaq(StoreChatAutomationFaqRequest $request): JsonResponse
    {
        $faq = $this->automations->createFaq(Auth::user(), $request->validated());
        $automation = $this->automations->forOfficial(Auth::user());

        return response()->json([
            'message' => 'FAQ created successfully. Kabataan will see this as a quick-reply chip when FAQs are On.',
            'faq' => $this->automations->serializeFaq($faq),
            'automation' => $this->automations->serializeAutomation($automation),
        ], 201);
    }

    public function updateFaq(UpdateChatAutomationFaqRequest $request, ChatAutomationFaq $faq): JsonResponse
    {
        $updated = $this->automations->updateFaq(Auth::user(), $faq, $request->validated());
        $automation = $this->automations->forOfficial(Auth::user());

        return response()->json([
            'message' => 'FAQ updated successfully.',
            'faq' => $this->automations->serializeFaq($updated),
            'automation' => $this->automations->serializeAutomation($automation),
        ]);
    }

    public function destroyFaq(ChatAutomationFaq $faq): JsonResponse
    {
        $this->automations->deleteFaq(Auth::user(), $faq);

        return response()->json([
            'message' => 'FAQ deleted successfully.',
        ]);
    }

    public function toggleFaq(Request $request, ChatAutomationFaq $faq): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $updated = $this->automations->setFaqActive(Auth::user(), $faq, (bool) $validated['is_active']);
        $automation = $this->automations->forOfficial(Auth::user());

        return response()->json([
            'message' => 'FAQ status updated.',
            'faq' => $this->automations->serializeFaq($updated),
            'automation' => $this->automations->serializeAutomation($automation),
        ]);
    }

    public function moveFaq(Request $request, ChatAutomationFaq $faq): JsonResponse
    {
        $validated = $request->validate([
            'direction' => ['required', 'in:up,down'],
        ]);

        $faqs = $this->automations->moveFaq(Auth::user(), $faq, $validated['direction']);

        return response()->json([
            'message' => 'FAQ order updated.',
            'faqs' => $faqs->map(fn (ChatAutomationFaq $item) => $this->automations->serializeFaq($item))->values()->all(),
        ]);
    }
}
