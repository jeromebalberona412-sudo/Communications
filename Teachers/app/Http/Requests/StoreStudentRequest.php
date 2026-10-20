<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class StoreStudentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->role === 'teachers' && $user->is_active;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('student_id')) {
            $this->merge([
                'student_id' => trim((string) $this->input('student_id')),
            ]);
        }

        if ($this->has('name')) {
            $name = trim((string) $this->input('name'));
            $this->merge([
                'name' => $name === '' ? null : $name,
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'student_id' => ['required', 'string', 'min:3', 'max:30', 'regex:/^[A-Za-z0-9-]+$/', 'unique:users,student_id'],
            'name' => ['nullable', 'string', 'max:255'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'student_id.regex' => 'Student ID may contain only letters, numbers, and hyphens (3–30 characters).',
            'student_id.unique' => 'This Student ID is already in use.',
        ];
    }
}
