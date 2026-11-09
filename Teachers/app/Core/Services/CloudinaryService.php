<?php

namespace App\Core\Services;

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
