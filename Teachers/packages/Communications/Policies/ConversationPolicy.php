<?php

namespace App\Modules\Communications\Policies;

use App\Models\User;
use App\Modules\Communications\Models\Conversation;
use App\Modules\Communications\Services\ConversationService;
use App\Modules\Communications\Services\DefaultGroupChatService;
use Illuminate\Contracts\Auth\Authenticatable;

class ConversationPolicy
{
    public function __construct(
        protected ConversationService $conversations,
        protected DefaultGroupChatService $defaultGroups,
    ) {}

    public function rename(User $user, Conversation $conversation): bool
    {
        return $this->defaultGroups->canRename($conversation, $user);
    }

    public function updateAvatar(User $user, Conversation $conversation): bool
    {
        return $this->defaultGroups->canChangeAvatar($conversation, $user);
    }

    public function view(Authenticatable $user, Conversation $conversation): bool
    {
        return $this->conversations->isParticipant($conversation, $user);
    }

    public function send(Authenticatable $user, Conversation $conversation): bool
    {
        return $this->conversations->isParticipant($conversation, $user);
    }

    public function call(Authenticatable $user, Conversation $conversation): bool
    {
        return $this->conversations->isParticipant($conversation, $user);
    }
}
