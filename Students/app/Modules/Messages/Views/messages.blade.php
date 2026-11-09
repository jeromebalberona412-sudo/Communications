@extends('layouts.app')

@section('title', 'Messages')

@section('content')
@php
    $commsRoutes = [
        'conversations' => route('api.communications.conversations.index'),
        'storeConversation' => route('api.communications.conversations.store'),
        'messages' => url('/api/communications/conversations/__ID__/messages'),
        'react' => url('/api/communications/messages/__ID__/reactions'),
        'updateMessage' => url('/api/communications/messages/__ID__'),
        'deleteMessage' => url('/api/communications/messages/__ID__'),
        'read' => url('/api/communications/conversations/__ID__/read'),
        'markAllRead' => route('api.communications.conversations.mark-all-read'),
        'showConversation' => url('/api/communications/conversations/__ID__'),
        'searchUsers' => route('api.communications.users.search'),
        'directory' => route('api.communications.users.directory'),
        'unreadCount' => route('api.communications.unread-count'),
        'startCall' => url('/api/communications/conversations/__ID__/calls'),
        'callStatus' => url('/api/communications/calls/__ID__/status'),
        'callShow' => url('/api/communications/calls/__ID__'),
        'callHeartbeat' => url('/api/communications/calls/__ID__/heartbeat'),
        'calls' => route('api.communications.calls.index'),
        'ringingCalls' => route('api.communications.calls.ringing'),
        'presence' => route('api.communications.presence'),
        'callHistoryPage' => route('communications.calls'),
        'renameConversation' => url('/api/communications/conversations/__ID__'),
        'conversationMembers' => url('/api/communications/conversations/__ID__/members'),
        'conversationAvatar' => url('/api/communications/conversations/__ID__/avatar'),
    ];
@endphp
@if (session('status') || session('warning') || session('error'))
<div class="comms-flash-wrap" role="status">
    @if (session('status'))
        <div class="alert alert-success mb-0">{{ session('status') }}</div>
    @endif
    @if (session('warning'))
        <div class="alert alert-warning mb-0">{{ session('warning') }}</div>
    @endif
    @if (session('error'))
        <div class="alert alert-danger mb-0">{{ session('error') }}</div>
    @endif
</div>
@endif
<div class="comms-officials-wrap">
<div
    class="comms-app"
    id="commsApp"
    data-current-user-id="{{ $currentUserId }}"
    data-portal-user-type="{{ $portalUserType }}"
    data-current-user-name="{{ auth()->user()->displayName() }}"
    data-current-user-avatar=""
    data-initial-conversation="{{ $initialConversationId ?? '' }}"
    data-initial-user-id="{{ $initialUserId ?? '' }}"
    data-message-max-length="{{ (int) config('communications.message_max_length', 1000) }}"
    data-routes='@json($commsRoutes)'
>
    <div class="comms-shell">
        @include('communications::partials.conversation-sidebar')
        @include('communications::partials.chat-window')
    </div>

    @include('communications::partials.group-info-modal')
    @include('communications::partials.group-rename-modal')

    <input type="file" id="commsGroupAvatarInput" class="visually-hidden" accept="image/jpeg,image/png,image/webp,image/gif" aria-hidden="true" tabindex="-1">
</div>
</div>
@endsection
