<?php

namespace App\Modules\Communications\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Call extends Model
{
    public const STATUS_RINGING = 'ringing';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_MISSED = 'missed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_ENDED = 'ended';

    public const TYPE_VOICE = 'voice';

    public const TYPE_VIDEO = 'video';

    /** @var list<string> */
    public const ACTIVE_STATUSES = [
        self::STATUS_RINGING,
        self::STATUS_ACCEPTED,
    ];

    /**
     * Terminal states. A call in one of these states is never active again,
     * so it must never block a new call.
     *
     * @var list<string>
     */
    public const TERMINAL_STATUSES = [
        self::STATUS_REJECTED,
        self::STATUS_MISSED,
        self::STATUS_CANCELLED,
        self::STATUS_ENDED,
    ];

    public function isActive(): bool
    {
        return in_array((string) $this->status, self::ACTIVE_STATUSES, true)
            && $this->ended_at === null;
    }

    public function isTerminal(): bool
    {
        return in_array((string) $this->status, self::TERMINAL_STATUSES, true);
    }

    protected $table = 'calls';

    protected $fillable = [
        'conversation_id',
        'caller_id',
        'caller_type',
        'receiver_id',
        'receiver_type',
        'call_type',
        'status',
        'started_at',
        'answered_at',
        'ended_at',
        'duration_seconds',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'answered_at' => 'datetime',
            'ended_at' => 'datetime',
            'duration_seconds' => 'integer',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class, 'conversation_id');
    }

    public function caller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'caller_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'receiver_id');
    }
}
