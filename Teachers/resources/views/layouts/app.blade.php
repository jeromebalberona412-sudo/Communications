<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Dashboard') — iLearnU</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    {{-- Publishable Supabase keys only (never service-role / sb_secret_*). Used by realtime.js for calls/chat. --}}
    <script>
        window.__COMMS_SUPABASE__ = {
            url: @json(rtrim((string) (env('VITE_SUPABASE_URL') ?: env('SUPABASE_URL') ?: ''), '/')),
            key: @json((string) (env('VITE_SUPABASE_PUBLISHABLE_KEY') ?: env('SUPABASE_PUBLISHABLE_KEY') ?: ''))
        };
        window.__COMMS_CALL_POLL_MS__ = @json((int) config('communications.call_poll_interval_ms', 8000));
        window.__COMMS_CALL_HEARTBEAT__ = @json((int) config('communications.call_heartbeat_seconds', 30));
        window.__COMMS_CALL_RING_TTL__ = @json((int) config('communications.call_ring_timeout_seconds', 60));
    </script>
    @vite(['resources/css/app.css', 'resources/js/app.js', 'resources/js/communications.js'])
</head>
<body class="app-body" data-sidebar-storage-key="teachers.sidebar">
    @php
        $commsBootRoutes = [
            'conversations' => route('api.communications.conversations.index'),
            'storeConversation' => route('api.communications.conversations.store'),
            'messages' => url('/api/communications/conversations/__ID__/messages'),
            'read' => url('/api/communications/conversations/__ID__/read'),
            'unreadCount' => route('api.communications.unread-count'),
            'startCall' => url('/api/communications/conversations/__ID__/calls'),
            'callStatus' => url('/api/communications/calls/__ID__/status'),
            'callShow' => url('/api/communications/calls/__ID__'),
            'callHeartbeat' => url('/api/communications/calls/__ID__/heartbeat'),
            'calls' => route('api.communications.calls.index'),
            'ringingCalls' => route('api.communications.calls.ringing'),
            'presence' => route('api.communications.presence'),
            'searchUsers' => route('api.communications.users.search'),
            'directory' => route('api.communications.users.directory'),
            'messagesPage' => route('communications.index'),
        ];
    @endphp
    <div
        id="commsRealtimeBoot"
        hidden
        data-current-user-id="{{ auth()->id() }}"
        data-portal-user-type="{{ config('communications.portal_user_type', 'teachers') }}"
        data-current-user-name="{{ auth()->user()->displayName() }}"
        data-unread-count-url="{{ route('api.communications.unread-count') }}"
        data-routes='@json($commsBootRoutes)'
    ></div>
    <div class="app-shell">
        <x-sidebar />
        <div class="app-column">
            <x-header />
            <main class="app-main" id="main-content">
                @yield('content')
            </main>
            <footer class="app-footer">Laguna University Learning Management System</footer>
        </div>
    </div>
    <div class="sidebar-backdrop" data-sidebar-backdrop hidden></div>
    @include('communications::partials.incoming-call-modal')
    @include('communications::partials.in-call-ui')
    @include('communications::partials.chat-modal')
</body>
</html>
