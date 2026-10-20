<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OfficialProfile extends Model
{
    public const FEDERATION_POSITIONS = [];

    protected $table = 'official_profiles';

    protected $fillable = [
        'user_id',
        'position',
        'federation_position',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
