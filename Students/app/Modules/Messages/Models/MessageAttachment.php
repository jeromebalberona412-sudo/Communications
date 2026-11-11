<?php

namespace App\Modules\Messages\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageAttachment extends Model
{
    protected $table = 'message_attachments';

    /**
     * The live table uses original_name, path, kind, size, and disk.
     * The app still reads and writes the file_* names through accessors.
     */
    protected $fillable = [
        'message_id',
        'file_name',
        'file_path',
        'public_id',
        'file_type',
        'mime_type',
        'file_size',
        'storage_provider',
        'original_name',
        'path',
        'disk',
        'size',
        'kind',
    ];

    protected function fileName(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->attributes['original_name'] ?? null,
            set: fn ($value) => ['original_name' => $value],
        );
    }

    protected function filePath(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->attributes['path'] ?? null,
            set: fn ($value) => ['path' => $value],
        );
    }

    protected function fileType(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->attributes['kind'] ?? null,
            set: fn ($value) => ['kind' => $value],
        );
    }

    protected function fileSize(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->attributes['size'] ?? null,
            set: fn ($value) => ['size' => $value],
        );
    }

    protected function storageProvider(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->attributes['disk'] ?? null,
            set: fn ($value) => ['disk' => $value],
        );
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'message_id');
    }

    public function isImage(): bool
    {
        return $this->file_type === 'image' || $this->storage_provider === 'cloudinary';
    }
}
