<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    public const STATUS_ACTIVE = 'ACTIVE';

    public const ROLE_STUDENTS = 'students';

    public const ROLE_TEACHERS = 'teachers';

    /** Compatibility aliases for the Communications package. */
    public const ROLE_SK_OFFICIAL = self::ROLE_TEACHERS;

    public const ROLE_SK_FED = 'sk_fed';

    public const ROLE_KABATAAN = self::ROLE_STUDENTS;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'student_id',
        'username',
        'name',
        'password',
        'role',
        'is_active',
        'last_seen',
        'online_status',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @var list<string>
     */
    protected $appends = [
        'status',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'password' => 'hashed',
            'last_seen' => 'datetime',
        ];
    }

    public function getStatusAttribute(): string
    {
        return $this->is_active ? self::STATUS_ACTIVE : 'INACTIVE';
    }

    public function displayName(): string
    {
        if (filled($this->name)) {
            return $this->name;
        }

        return $this->role === 'teachers'
            ? (string) $this->username
            : (string) $this->student_id;
    }

    public function officialProfile(): HasOne
    {
        return $this->hasOne(OfficialProfile::class);
    }

    public function barangay(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Barangay::class);
    }
}
