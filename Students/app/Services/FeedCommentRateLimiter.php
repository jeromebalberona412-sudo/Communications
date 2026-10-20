<?php

namespace App\Services;

class FeedCommentRateLimiter
{
    public const SCOPE_CHAT = 'chat';

    /**
     * @return array{allowed: bool, message: ?string, retry_after: int, burst_used: int, burst_remaining: int}
     */
    public function check(string $portal, int $userId, string $scope = self::SCOPE_CHAT): array
    {
        return [
            'allowed' => true,
            'message' => null,
            'retry_after' => 0,
            'burst_used' => 0,
            'burst_remaining' => 100,
        ];
    }

    /**
     * @return array{locked: bool, retry_after: int, burst_used: int, burst_remaining: int, message: ?string}
     */
    public function hit(string $portal, int $userId, string $scope = self::SCOPE_CHAT): array
    {
        return [
            'locked' => false,
            'retry_after' => 0,
            'burst_used' => 1,
            'burst_remaining' => 99,
            'message' => null,
        ];
    }
}
