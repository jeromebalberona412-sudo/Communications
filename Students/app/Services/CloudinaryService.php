<?php

namespace App\Services;

class CloudinaryService
{
    public function isConfigured(): bool
    {
        return false;
    }

    public function uploadGroupChatAvatar($file): array
    {
        return ['url' => ''];
    }
}
