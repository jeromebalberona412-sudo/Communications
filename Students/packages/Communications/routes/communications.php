<?php

use App\Modules\Communications\Controllers\CallController;
use App\Modules\Communications\Controllers\ChatAutomationController;
use App\Modules\Communications\Controllers\CommunicationsPageController;
use App\Modules\Communications\Controllers\ConversationController;
use App\Modules\Communications\Controllers\DirectoryController;
use App\Modules\Communications\Controllers\MessageAttachmentController;
use App\Modules\Communications\Controllers\MessageController;
use App\Modules\Communications\Controllers\PresenceController;
use App\Modules\Communications\Controllers\UserSearchController;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'web',
    'auth',
    'session.timeout',
    'single.session',
    'sk_official.access',
    'must.change.password',
])->group(function (): void {
    Route::get('/messages', [CommunicationsPageController::class, 'index'])
        ->name('communications.index');
    Route::get('/messages/calls', [CommunicationsPageController::class, 'callHistory'])
        ->name('communications.calls');
    Route::redirect('/communications', '/messages', 301);
    Route::redirect('/communications/calls', '/messages/calls', 301);
    Route::get('/communications/automations', [ChatAutomationController::class, 'page'])
        ->name('communications.automations');

    Route::get('/api/communications/automations', [ChatAutomationController::class, 'show'])
        ->name('api.communications.automations.show');
    Route::patch('/api/communications/automations', [ChatAutomationController::class, 'toggle'])
        ->middleware('throttle:30,1')
        ->name('api.communications.automations.toggle');
    Route::post('/api/communications/automations/faqs', [ChatAutomationController::class, 'storeFaq'])
        ->middleware('throttle:30,1')
        ->name('api.communications.automations.faqs.store');
    Route::patch('/api/communications/automations/faqs/{faq}', [ChatAutomationController::class, 'updateFaq'])
        ->middleware('throttle:30,1')
        ->name('api.communications.automations.faqs.update');
    Route::delete('/api/communications/automations/faqs/{faq}', [ChatAutomationController::class, 'destroyFaq'])
        ->middleware('throttle:30,1')
        ->name('api.communications.automations.faqs.destroy');
    Route::patch('/api/communications/automations/faqs/{faq}/toggle', [ChatAutomationController::class, 'toggleFaq'])
        ->middleware('throttle:30,1')
        ->name('api.communications.automations.faqs.toggle');
    Route::patch('/api/communications/automations/faqs/{faq}/move', [ChatAutomationController::class, 'moveFaq'])
        ->middleware('throttle:30,1')
        ->name('api.communications.automations.faqs.move');

    Route::get('/api/communications/unread-count', [CommunicationsPageController::class, 'unreadCount'])
        ->name('api.communications.unread-count');

    Route::get('/api/communications/conversations', [ConversationController::class, 'index'])
        ->name('api.communications.conversations.index');
    Route::post('/api/communications/conversations/mark-all-read', [ConversationController::class, 'markAllRead'])
        ->middleware('throttle:20,1')
        ->name('api.communications.conversations.mark-all-read');
    Route::post('/api/communications/conversations', [ConversationController::class, 'store'])
        ->middleware('throttle:30,1')
        ->name('api.communications.conversations.store');
    Route::get('/api/communications/conversations/{conversation}', [ConversationController::class, 'show'])
        ->name('api.communications.conversations.show');
    Route::patch('/api/communications/conversations/{conversation}', [ConversationController::class, 'rename'])
        ->middleware('throttle:20,1')
        ->name('api.communications.conversations.rename');
    Route::post('/api/communications/conversations/{conversation}/avatar', [ConversationController::class, 'updateAvatar'])
        ->name('api.communications.conversations.avatar');
    Route::get('/api/communications/conversations/{conversation}/members', [ConversationController::class, 'members'])
        ->name('api.communications.conversations.members');
    Route::post('/api/communications/conversations/{conversation}/read', [ConversationController::class, 'markRead'])
        ->name('api.communications.conversations.read');

    Route::get('/api/communications/conversations/{conversation}/messages', [MessageController::class, 'index'])
        ->name('api.communications.messages.index');
    Route::post('/api/communications/conversations/{conversation}/messages', [MessageController::class, 'store'])
        ->middleware('throttle:60,1')
        ->name('api.communications.messages.store');
    Route::post('/api/communications/messages/{message}/reactions', [MessageController::class, 'toggleReaction'])
        ->middleware('throttle:60,1')
        ->name('api.communications.messages.react');
    Route::patch('/api/communications/messages/{message}', [MessageController::class, 'update'])
        ->middleware('throttle:60,1')
        ->name('api.communications.messages.update');
    Route::delete('/api/communications/messages/{message}', [MessageController::class, 'destroy'])
        ->middleware('throttle:60,1')
        ->name('api.communications.messages.destroy');
    Route::get('/api/communications/attachments/{attachment}', [MessageAttachmentController::class, 'download'])
        ->middleware('throttle:60,1')
        ->name('api.communications.attachments.download');

    Route::get('/api/communications/users/search', UserSearchController::class)
        ->middleware('throttle:30,1')
        ->name('api.communications.users.search');

    Route::get('/api/communications/users/directory', DirectoryController::class)
        ->middleware('throttle:30,1')
        ->name('api.communications.users.directory');

    // User profile endpoint for call UI (REVIEW FIX #3, #5)
    Route::get('/api/communications/users/{user_type}/{user_id}/profile', [DirectoryController::class, 'userProfile'])
        ->middleware('throttle:30,1')
        ->name('api.communications.users.profile');

    Route::get('/api/communications/calls', [CallController::class, 'index'])
        ->middleware('throttle:60,1')
        ->name('api.communications.calls.index');
    Route::get('/api/communications/calls/ringing', [CallController::class, 'ringing'])
        ->middleware('throttle:45,1')
        ->name('api.communications.calls.ringing');
    Route::post('/api/communications/conversations/{conversation}/calls', [CallController::class, 'store'])
        ->middleware('throttle:20,1')
        ->name('api.communications.calls.store');
    Route::post('/api/communications/calls/{call}/status', [CallController::class, 'updateStatus'])
        ->middleware('throttle:60,1')
        ->name('api.communications.calls.status');
    Route::get('/api/communications/calls/{call}', [CallController::class, 'show'])
        ->middleware('throttle:60,1')
        ->name('api.communications.calls.show');
    Route::post('/api/communications/calls/{call}/heartbeat', [CallController::class, 'heartbeat'])
        ->middleware('throttle:30,1')
        ->name('api.communications.calls.heartbeat');

    Route::post('/api/communications/presence', [PresenceController::class, 'heartbeat'])
        ->middleware('throttle:20,1')
        ->name('api.communications.presence');
});
