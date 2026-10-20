<?php

namespace App\Modules\Communications\Services;

use Illuminate\Contracts\Auth\Authenticatable;

class ParticipantTypeResolver
{
    public const STUDENTS = 'students';

    public const TEACHERS = 'teachers';

    /** @deprecated Keep aliases for older package helpers. */
    public const KABATAAN = self::STUDENTS;

    /** @deprecated Keep aliases for older package helpers. */
    public const SK_OFFICIAL = self::TEACHERS;

    /** @deprecated Keep aliases for older package helpers. */
    public const SK_FED = 'sk_fed';

    public function portalType(): string
    {
        return (string) config('communications.portal_user_type', self::TEACHERS);
    }

    public function fromUser(Authenticatable $user): string
    {
        $role = strtolower(trim((string) ($user->role ?? '')));

        return match ($role) {
            'teachers', 'teacher', 'sk_official' => self::TEACHERS,
            'students', 'student', 'kabataan', 'user' => self::STUDENTS,
            'sk_fed', 'admin' => self::SK_FED,
            default => throw new \InvalidArgumentException('Unsupported account role for messaging.'),
        };
    }

    public function normalizeSearchRole(string $role): ?string
    {
        $role = strtolower(trim($role));

        return match ($role) {
            'teachers', 'teacher', 'sk_official' => self::TEACHERS,
            'students', 'student', 'kabataan', 'user' => self::STUDENTS,
            'sk_fed', 'admin' => self::SK_FED,
            default => null,
        };
    }

    public function canonicalType(?string $type): ?string
    {
        if ($type === null || $type === '') {
            return null;
        }

        return $this->normalizeSearchRole($type) ?? strtolower(trim($type));
    }

    /**
     * @return list<string>
     */
    public function equivalentTypes(?string $type): array
    {
        $canonical = $this->canonicalType($type);

        return match ($canonical) {
            self::STUDENTS => [self::STUDENTS, 'student', 'kabataan', 'user'],
            self::TEACHERS => [self::TEACHERS, 'teacher', 'sk_official'],
            self::SK_FED => [self::SK_FED, 'admin'],
            default => $canonical ? [$canonical] : [],
        };
    }

    public function typesMatch(?string $a, ?string $b): bool
    {
        $left = $this->canonicalType($a);
        $right = $this->canonicalType($b);

        return $left !== null && $right !== null && $left === $right;
    }

    public function label(string $type): string
    {
        return match ($this->canonicalType($type)) {
            self::TEACHERS => 'Teacher',
            self::STUDENTS => 'Student',
            self::SK_FED => 'Administrator',
            default => 'User',
        };
    }

    /**
     * @return list<string>
     */
    public function searchableRoles(): array
    {
        return ['students', 'teachers', 'student', 'teacher'];
    }
}
