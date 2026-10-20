<?php

namespace App\Modules\Communications\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageHide extends Model
{
    protected $table = 'message_hides';

    protected $fillable = [
        'message_id',
        'user_id',
        'user_type',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'message_id');
    }
}
