<?php

namespace App\Modules\Communications\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class MessageAttachmentValidator
{
    /**
     * @return array{kind: 'image'|'file', file: UploadedFile}
     */
    public function validate(?UploadedFile $file): array
    {
        if ($file === null) {
            throw ValidationException::withMessages([
                'attachment' => ['An attachment file is required.'],
            ]);
        }

        $imageMaxKb = (int) config('communications.attachments.image_max_kb', 25600);
        $fileMaxKb = (int) config('communications.attachments.file_max_kb', 10240);
        $imageExt = config('communications.attachments.image_extensions', ['jpg', 'jpeg', 'png', 'webp', 'gif']);
        $fileExt = config('communications.attachments.file_extensions', ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv']);
        $imageMimes = config('communications.attachments.image_mimes', ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
        $fileMimes = config('communications.attachments.file_mimes', [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            'application/csv',
        ]);

        if (! is_array($imageExt)) {
            $imageExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        }
        if (! is_array($fileExt)) {
            $fileExt = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
        }
        if (! is_array($imageMimes)) {
            $imageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        }
        if (! is_array($fileMimes)) {
            $fileMimes = ['application/pdf', 'text/plain', 'text/csv'];
        }

        if (config('communications.attachments.allow_svg', false)) {
            $imageExt[] = 'svg';
            $imageMimes[] = 'image/svg+xml';
        }

        $ext = strtolower((string) $file->getClientOriginalExtension());
        $detectedMime = $this->detectMime($file);

        if (in_array($ext, $imageExt, true)) {
            Validator::make(
                ['attachment' => $file],
                ['attachment' => ['required', 'file', 'max:'.$imageMaxKb]]
            )->validate();

            if ($detectedMime && ! in_array($detectedMime, $imageMimes, true) && ! str_starts_with($detectedMime, 'image/')) {
                throw ValidationException::withMessages([
                    'attachment' => ['The uploaded image type is not allowed.'],
                ]);
            }

            return ['kind' => 'image', 'file' => $file];
        }

        if (in_array($ext, $fileExt, true)) {
            Validator::make(
                ['attachment' => $file],
                ['attachment' => ['required', 'file', 'max:'.$fileMaxKb]]
            )->validate();

            if ($detectedMime && ! in_array($detectedMime, $fileMimes, true)) {
                // Some browsers/OS report Office files as application/octet-stream or zip-based types.
                $looseOffice = in_array($detectedMime, [
                    'application/octet-stream',
                    'application/zip',
                    'application/x-zip-compressed',
                ], true) && in_array($ext, ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'], true);

                if (! $looseOffice) {
                    throw ValidationException::withMessages([
                        'attachment' => ['The uploaded document type is not allowed.'],
                    ]);
                }
            }

            return ['kind' => 'file', 'file' => $file];
        }

        throw ValidationException::withMessages([
            'attachment' => ['Unsupported file type. Upload an image or an allowed document.'],
        ]);
    }

    private function detectMime(UploadedFile $file): ?string
    {
        $path = $file->getRealPath() ?: $file->getPathname();
        if (! $path || ! is_file($path)) {
            return $file->getMimeType() ?: null;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($path);

        return is_string($mime) && $mime !== '' ? $mime : ($file->getMimeType() ?: null);
    }
}
