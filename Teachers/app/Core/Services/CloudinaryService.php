<?php

namespace App\Core\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Server-side Cloudinary uploads. The API secret never leaves this class.
 * Browser uploads use the existing unsigned preset and are not signed here.
 */
class CloudinaryService
{
    public const PRESET_MESSAGES = 'message_images';

    public const PRESET_GROUP = 'Groupchat_Images';

    public const FOLDER_MESSAGES = 'message_images';

    public const FOLDER_GROUP = 'Groupchat_Images';

    public function isConfigured(): bool
    {
        return $this->cloudName() !== '';
    }

    /**
     * @return array{url: string, public_id: string, resource_type: string, format: string, bytes: int, width: int, height: int}
     */
    public function uploadCommunicationImage(UploadedFile $file, string $folder = self::FOLDER_MESSAGES): array
    {
        return $this->upload($file, $this->allowedFolder($folder));
    }

    /**
     * @return array{url: string, public_id: string}
     */
    public function uploadGroupChatAvatar($file): array
    {
        if (! $file instanceof UploadedFile) {
            return ['url' => ''];
        }

        $uploaded = $this->upload($file, self::FOLDER_GROUP);

        return [
            'url' => $uploaded['url'],
            'public_id' => $uploaded['public_id'],
        ];
    }

    public function delete(string $publicId): void
    {
        $publicId = trim($publicId);
        $secret = (string) config('services.cloudinary.api_secret', '');
        $key = (string) config('services.cloudinary.api_key', '');
        $cloud = $this->cloudName();
        if ($publicId === '' || $secret === '' || $key === '' || $cloud === '') {
            return;
        }

        $timestamp = time();
        $signature = sha1('public_id='.$publicId.'&timestamp='.$timestamp.$secret);

        try {
            Http::timeout(15)->asForm()->post(
                'https://api.cloudinary.com/v1_1/'.$cloud.'/image/destroy',
                [
                    'public_id' => $publicId,
                    'api_key' => $key,
                    'timestamp' => $timestamp,
                    'signature' => $signature,
                ]
            );
        } catch (\Throwable) {
            // Best-effort. The message row is still removed by the caller.
        }
    }

    /**
     * @return array{url: string, public_id: string, resource_type: string, format: string, bytes: int, width: int, height: int}
     */
    protected function upload(UploadedFile $file, string $folder): array
    {
        $cloud = $this->cloudName();
        if ($cloud === '') {
            throw new RuntimeException('Cloudinary is not configured for communication image uploads.');
        }

        $contents = file_get_contents($file->getRealPath() ?: $file->getPathname());
        if ($contents === false || $contents === '') {
            throw new RuntimeException('Unable to read the selected image.');
        }

        $preset = $folder === self::FOLDER_GROUP
            ? (string) (config('services.cloudinary.group_preset') ?: self::PRESET_GROUP)
            : (string) (config('services.cloudinary.message_preset') ?: self::PRESET_MESSAGES);
        $filename = $file->getClientOriginalName() ?: 'image.jpg';
        // The preset already sets the asset folder, overwrite, filename, and upload type.
        $response = $this->postUpload($cloud, $contents, $filename, [
            'upload_preset' => $preset,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Cloudinary rejected the image upload.');
        }

        $json = $response->json();
        $secure = is_array($json) ? (string) ($json['secure_url'] ?? '') : '';
        $publicId = is_array($json) ? (string) ($json['public_id'] ?? '') : '';
        $returnedFolder = is_array($json) ? (string) ($json['asset_folder'] ?? $json['folder'] ?? '') : '';
        if (! $this->isTrustedUrl($secure, $cloud) || ! $this->isSafePublicId($publicId)) {
            throw new RuntimeException('Cloudinary returned an unexpected image location.');
        }
        if ($returnedFolder !== '' && $returnedFolder !== $folder) {
            throw new RuntimeException('Cloudinary stored the image in the wrong folder.');
        }

        return [
            'url' => $secure,
            'public_id' => $publicId,
            'resource_type' => (string) ($json['resource_type'] ?? 'image'),
            'format' => (string) ($json['format'] ?? ''),
            'bytes' => (int) ($json['bytes'] ?? $file->getSize()),
            'width' => (int) ($json['width'] ?? 0),
            'height' => (int) ($json['height'] ?? 0),
        ];
    }

    /**
     * @param  array<string, string>  $fields
     */
    protected function postUpload(string $cloud, string $contents, string $filename, array $fields): \Illuminate\Http\Client\Response
    {
        return Http::timeout(45)
            ->attach('file', $contents, $filename)
            ->post('https://api.cloudinary.com/v1_1/'.$cloud.'/image/upload', $fields);
    }

    protected function allowedFolder(string $folder): string
    {
        return $folder === self::FOLDER_GROUP ? self::FOLDER_GROUP : self::FOLDER_MESSAGES;
    }

    protected function cloudName(): string
    {
        return trim((string) config('services.cloudinary.cloud_name', ''));
    }

    protected function isSafePublicId(string $publicId): bool
    {
        return $publicId !== ''
            && ! str_contains($publicId, '..')
            && ! str_contains($publicId, '://')
            && ! str_contains($publicId, '\\');
    }

    protected function isTrustedUrl(string $url, string $cloud): bool
    {
        if (! str_starts_with($url, 'https://res.cloudinary.com/')) {
            return false;
        }

        $hostPath = substr($url, strlen('https://'));
        $prefix = 'res.cloudinary.com/'.$cloud.'/';

        return str_starts_with($hostPath, $prefix);
    }
}
