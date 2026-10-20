<?php

namespace App\Modules\Communications\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Schema;

class ChatAutomationFaq extends Model
{
    use SoftDeletes;

    protected $table = 'chat_automation_faqs';

    protected $fillable = [
        'chat_automation_id',
        'question',
        'automated_response',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }

    /**
     * PostgreSQL needs native boolean literals; MySQL needs 0/1.
     */
    protected function isActive(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            set: function ($value) {
                $active = filter_var($value, FILTER_VALIDATE_BOOLEAN);

                try {
                    if (Schema::getConnection()->getDriverName() === 'pgsql') {
                        return $active ? 'true' : 'false';
                    }
                } catch (\Throwable) {
                    // Fall through to integer binding.
                }

                return $active ? 1 : 0;
            },
        );
    }

    public function automation(): BelongsTo
    {
        return $this->belongsTo(ChatAutomation::class, 'chat_automation_id');
    }
}
