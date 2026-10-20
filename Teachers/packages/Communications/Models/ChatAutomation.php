<?php

namespace App\Modules\Communications\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

class ChatAutomation extends Model
{
    protected $table = 'chat_automations';

    protected $fillable = [
        'sk_official_id',
        'is_enabled',
    ];

    /**
     * PostgreSQL needs native boolean literals; MySQL needs 0/1.
     */
    protected function isEnabled(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            set: function ($value) {
                $enabled = filter_var($value, FILTER_VALIDATE_BOOLEAN);

                try {
                    if (Schema::getConnection()->getDriverName() === 'pgsql') {
                        return $enabled ? 'true' : 'false';
                    }
                } catch (\Throwable) {
                    // Fall through to integer binding.
                }

                return $enabled ? 1 : 0;
            },
        );
    }

    public function official(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sk_official_id');
    }

    public function faqs(): HasMany
    {
        return $this->hasMany(ChatAutomationFaq::class, 'chat_automation_id')
            ->orderBy('sort_order')
            ->orderBy('id');
    }
}
