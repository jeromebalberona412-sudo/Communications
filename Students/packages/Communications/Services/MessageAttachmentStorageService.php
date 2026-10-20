<?php

namespace App\Modules\Communications\Services;

use App\Modules\Communications\Models\MessageAttachment;
use App\Services\CloudinaryService;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class MessageAttachmentStorageService
{
    public function __construct(
        protected CloudinaryService $cloudinary
    ) {}

    public function cloudinaryConfigured(): bool
    {
        return $this->cloudinary->isConfigured();
    }

    public function supabaseConfigured(): bool
    {
        return filled(config('services.supabase.url'))
            && filled(config('services.supabase.service_role_key'))
            && filled(config('services.supabase.communication_bucket'));
    }

    /**
     * Upload an image to Cloudinary folder `communication`.
     *
     * @return array{file_name: string, file_path: string, public_id: string, file_type: string, mime_type: string, file_size: int, storage_provider: string}
     */
    public function storeImage(UploadedFile $file): array
    {
        if (! $this->cloudinaryConfigured()) {
            throw new RuntimeException('Cloudinary is not configured for communication image uploads.');
        }

        $result = $this->cloudinary->uploadCommunicationImage($file);

        return [
            'file_name' => $this->safeOriginalName($file),
            'file_path' => (string) $result['url'],
            'public_id' => (string) $result['public_id'],
            'file_type' => 'image',
            'mime_type' => (string) ($file->getMimeType() ?: 'image/jpeg'),
            'file_size' => (int) $file->getSize(),
            'storage_provider' => 'cloudinary',
        ];
    }

    /**
     * Upload a document to Supabase Storage at communication/attachments/.
     *
     * @return array{file_name: string, file_path: string, public_id: string, file_type: string, mime_type: string, file_size: int, storage_provider: string}
     */
    public function storeDocument(UploadedFile $file, int $conversationId): array
    {
        if (! $this->supabaseConfigured()) {
            throw new RuntimeException('Supabase Storage is not configured for communication document uploads.');
        }

        $fileName = $this->safeOriginalName($file);
        $objectPath = sprintf(
            'attachments/%d/%s_%s',
            $conversationId,
            Str::uuid()->toString(),
            $this->sanitizeStorageSegment($fileName)
        );

        $bucket = (string) config('services.supabase.communication_bucket', 'communication');
        $mime = (string) ($file->getMimeType() ?: 'application/octet-stream');
        $contents = file_get_contents($file->getRealPath() ?: $file->getPathname());
        if ($contents === false) {
            throw new RuntimeException('Unable to read uploaded file.');
        }

        $url = rtrim((string) config('services.supabase.url'), '/')
            .'/storage/v1/object/'
            .rawurlencode($bucket)
            .'/'
            .implode('/', array_map('rawurlencode', explode('/', $objectPath)));

        try {
            $response = Http::withHeaders([
                'Authorization' => 'Bearer '.config('services.supabase.service_role_key'),
                'apikey' => config('services.supabase.service_role_key'),
                'Content-Type' => $mime,
                'x-upsert' => 'false',
            ])->withBody($contents, $mime)->post($url);
        } catch (RequestException $e) {
            throw new RuntimeException('Failed to upload document to Supabase Storage.', 0, $e);
        }

        if (! $response->successful()) {
            throw new RuntimeException(
                'Failed to upload document to Supabase Storage: '.$response->body()
            );
        }

        return [
            'file_name' => $fileName,
            'file_path' => $objectPath,
            'public_id' => $bucket.'/'.$objectPath,
            'file_type' => 'file',
            'mime_type' => $mime,
            'file_size' => (int) $file->getSize(),
            'storage_provider' => 'supabase',
        ];
    }

    /**
     * Stream a document stored as BYTEA from PostgreSQL (cross-portal attachments).
     *
     * @return array{contents: string, mime_type: string, file_name: string}
     */
    public function fetchDatabaseObject(MessageAttachment $attachment): array
    {
        $row = DB::selectOne(
            "SELECT encode(file_data, 'hex') AS hex FROM message_attachments WHERE id = ?",
            [$attachment->id]
        );

        $hex = is_object($row) ? (string) ($row->hex ?? '') : '';
        if ($hex === '') {
            abort(404, 'Attachment data not found.');
        }

        $data = hex2bin($hex);
        if ($data === false || $data === '') {
            abort(404, 'Attachment data is empty.');
        }

        return [
            'contents' => $data,
            'mime_type' => (string) ($attachment->mime_type ?: 'application/octet-stream'),
            'file_name' => (string) $attachment->file_name,
        ];
    }

    /**
     * @return array{contents: string, mime_type: string, file_name: string}
     */
    public function fetchSupabaseObject(string $objectPath, string $fileName, ?string $mimeType = null): array
    {
        if (! $this->supabaseConfigured()) {
            throw new RuntimeException('Supabase Storage is not configured.');
        }

        $bucket = (string) config('services.supabase.communication_bucket', 'communication');
        $url = rtrim((string) config('services.supabase.url'), '/')
            .'/storage/v1/object/'
            .rawurlencode($bucket)
            .'/'
            .implode('/', array_map('rawurlencode', explode('/', ltrim($objectPath, '/'))));

        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.config('services.supabase.service_role_key'),
            'apikey' => config('services.supabase.service_role_key'),
        ])->get($url);

        if (! $response->successful()) {
            abort(404, 'Attachment not found.');
        }

        return [
            'contents' => $response->body(),
            'mime_type' => $mimeType ?: ($response->header('Content-Type') ?: 'application/octet-stream'),
            'file_name' => $fileName,
        ];
    }

    public function deleteStored(string $storageProvider, ?string $publicId, ?string $filePath): void
    {
        try {
            if ($storageProvider === 'cloudinary' && $publicId) {
                $this->cloudinary->delete($publicId);
            }

            if ($storageProvider === 'supabase' && $filePath && $this->supabaseConfigured()) {
                $bucket = (string) config('services.supabase.communication_bucket', 'communication');
                $url = rtrim((string) config('services.supabase.url'), '/')
                    .'/storage/v1/object/'
                    .rawurlencode($bucket)
                    .'/'
                    .implode('/', array_map('rawurlencode', explode('/', ltrim($filePath, '/'))));

                Http::withHeaders([
                    'Authorization' => 'Bearer '.config('services.supabase.service_role_key'),
                    'apikey' => config('services.supabase.service_role_key'),
                ])->delete($url);
            }
        } catch (\Throwable) {
            // Best-effort cleanup; message row cascade still removes DB metadata.
        }
    }

    private function safeOriginalName(UploadedFile $file): string
    {
        $name = basename((string) $file->getClientOriginalName());
        $name = preg_replace('/[^\w.\- ()\[\]]+/u', '_', $name) ?: 'file';

        return mb_substr($name, 0, 255);
    }

    private function sanitizeStorageSegment(string $name): string
    {
        $safe = preg_replace('/[^A-Za-z0-9._-]+/', '_', $name) ?: 'file';

        return mb_substr($safe, 0, 180);
    }
}
