<?php

namespace App\Modules\Communications\Requests;

use App\Modules\Communications\Services\ChatAutomationService;
use Illuminate\Foundation\Http\FormRequest;

class StoreChatAutomationFaqRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'question' => ['required', 'string', 'max:'.ChatAutomationService::QUESTION_MAX],
            'automated_response' => ['required', 'string', 'max:'.ChatAutomationService::RESPONSE_MAX],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'question.required' => 'Question is required.',
            'question.max' => 'Question must not exceed '.ChatAutomationService::QUESTION_MAX.' characters.',
            'automated_response.required' => 'Automated response is required.',
            'automated_response.max' => 'Automated response must not exceed '.ChatAutomationService::RESPONSE_MAX.' characters.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('question')) {
            $this->merge(['question' => trim((string) $this->input('question'))]);
        }
        if ($this->has('automated_response')) {
            $normalized = preg_replace("/[\r\n\x{2028}\x{2029}]+/u", ' ', (string) $this->input('automated_response')) ?? '';
            $normalized = preg_replace('/[ \t\f\v]+/', ' ', $normalized) ?? '';
            $this->merge(['automated_response' => trim($normalized)]);
        }
    }
}
