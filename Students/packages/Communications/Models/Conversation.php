<?php

namespace App\Modules\Communications\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    public const TYPE_PRIVATE = 'private';

    public const TYPE_GROUP = 'group';

    protected $table = 'conversations';

    protected $fillable = [
        'conversation_type',
        'name',
        'default_group_type',
        'tenant_id',
        'max_members',
        'avatar_url',
    ];

    protected function casts(): array
    {
        return [
            'tenant_id' => 'integer',
            'max_members' => 'integer',
        ];
    }

    public function participants(): HasMany
    {
        return $this->hasMany(ConversationParticipant::class, 'conversation_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class, 'conversation_id');
    }

    public function calls(): HasMany
    {
        return $this->hasMany(Call::class, 'conversation_id');
    }

    public function isGroup(): bool
    {
        return $this->conversation_type === self::TYPE_GROUP;
    }

    public function isDefaultGroup(): bool
    {
        return $this->isGroup()
            && is_string($this->default_group_type)
            && $this->default_group_type !== '';
    }
}
