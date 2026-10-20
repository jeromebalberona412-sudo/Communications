<?php

namespace App\Modules\Communications\Controllers;

use App\Modules\Communications\Models\MessageAttachment;
use App\Modules\Communications\Services\ConversationService;
use App\Modules\Communications\Services\MessageAttachmentStorageService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MessageAttachmentController extends Controller
{
    public function __construct(
        protected ConversationService $conversations,
        protected MessageAttachmentStorageService $storage
    ) {}

    public function download(MessageAttachment $attachment): RedirectResponse|StreamedResponse|Response
    {
        $user = Auth::user();
        abort_if($user === null, 401);

        $message = $attachment->message()->with('conversation')->first();
        abort_if($message === null || $message->conversation === null, 404);

        if (! $this->conversations->isParticipant($message->conversation, $user)) {
            abort(403, 'You are not allowed to access this attachment.');
        }

        if ($attachment->storage_provider === 'cloudinary') {
            $url = (string) $attachment->file_path;
            abort_if($url === '', 404);

            return redirect()->away($url);
        }

        if ($attachment->storage_provider === 'supabase') {
            $payload = $this->storage->fetchSupabaseObject(
                (string) $attachment->file_path,
                (string) $attachment->file_name,
                $attachment->mime_type
            );
            $safeName = str_replace(['"', "\r", "\n"], '', $payload['file_name'] ?: 'document');

            return response()->streamDownload(function () use ($payload) {
                echo $payload['contents'];
            }, $safeName, [
                'Content-Type' => $payload['mime_type'] ?: 'application/octet-stream',
                'Content-Disposition' => 'attachment; filename="'.$safeName.'"',
                'Cache-Control' => 'private, no-store',
            ]);
        }

        if ($attachment->storage_provider === 'database') {
            if (! method_exists($this->storage, 'fetchDatabaseObject')) {
                abort(404, 'Database attachment storage is not available.');
            }
            $payload = $this->storage->fetchDatabaseObject($attachment);
            $mime = $payload['mime_type'] ?: 'application/octet-stream';
            $fileName = $payload['file_name'] ?: 'document';
            $contents = $payload['contents'];
            $safeName = str_replace(['"', "\r", "\n"], '', $fileName);

            return response()->streamDownload(function () use ($contents) {
                echo $contents;
            }, $safeName, [
                'Content-Type' => $mime,
                'Content-Disposition' => 'attachment; filename="'.$safeName.'"',
                'Cache-Control' => 'private, no-store',
            ]);
        }

        abort(404, 'Unknown attachment storage provider.');
    }
}
