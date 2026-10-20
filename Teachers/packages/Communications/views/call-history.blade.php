<!DOCTYPE html>
<html lang="en">
<head>
    @include('layout::favicon')
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Call history — SK Officials Portal</title>
    @vite([
        'app/Modules/Layout/css/header.css',
        'app/Modules/Layout/css/sidebar.css',
        'app/Modules/Dashboard/assets/css/dashboard.css',
        'app/Modules/Communications/assets/css/communication.css',
        'app/Modules/Layout/js/header.js',
        'app/Modules/Layout/js/sidebar.js',
    ])
</head>
<body class="comms-officials-page">
@include('layout::header')
@include('layout::sidebar')

<main class="main-content" id="mainContent">
<div class="comms-officials-wrap">
<div class="comms-history-page" id="commsCallHistory" data-calls-url="{{ route('api.communications.calls.index') }}">
    <div class="comms-history-header-row">
        <div class="comms-history-title-block">
            <div class="comms-history-title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="13" x2="12" y2="13"/>
                    <line x1="8" y1="17" x2="11" y2="17"/>
                    <circle cx="17.5" cy="17.5" r="3.5"/>
                    <polyline points="17.5 15.75 17.5 17.5 18.75 18.25"/>
                </svg>
            </div>
            <div>
                <h1>Call history</h1>
                <p>Voice and video calls across your conversations.</p>
            </div>
        </div>
        <a href="{{ route('communications.index') }}" class="comms-link-btn">Back to Messages</a>
    </div>

    <div class="comms-history-list" id="commsHistoryList"></div>
    <div class="comms-empty comms-history-empty" id="commsHistoryEmpty" hidden>
        <div class="comms-history-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <circle cx="17.5" cy="17.5" r="3.5"/>
                <polyline points="17.5 15.75 17.5 17.5 18.75 18.25"/>
            </svg>
        </div>
        <p>No calls yet.</p>
    </div>
</div>
</div>
</main>

<script>
(function () {
    const root = document.getElementById('commsCallHistory');
    if (!root) return;
    const list = document.getElementById('commsHistoryList');
    const empty = document.getElementById('commsHistoryEmpty');
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function formatDuration(sec) {
        if (sec == null || sec === '' || Number(sec) <= 0) return '';
        const total = Math.floor(Number(sec));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    function statusClass(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'accepted' || s === 'ended') return 'is-ok';
        if (s === 'missed' || s === 'rejected') return 'is-missed';
        if (s === 'cancelled') return 'is-cancelled';
        return '';
    }

    function typeIcon(callType) {
        if (String(callType) === 'video') {
            return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>';
    }

    fetch(root.dataset.callsUrl, {
        headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf },
        credentials: 'same-origin'
    })
        .then((r) => r.json())
        .then((data) => {
            const calls = data.calls || [];
            if (!calls.length) {
                empty.hidden = false;
                return;
            }
            list.innerHTML = calls.map((call) => {
                const peer = call.peer || {};
                const name = peer.name || 'Unknown';
                const when = call.created_at ? new Date(call.created_at).toLocaleString() : '';
                const avatar = peer.profile_image_url
                    || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=0B5CAB&color=fff');
                const convId = call.conversation_id || '';
                const href = convId
                    ? ('{{ route('communications.index') }}?conversation=' + encodeURIComponent(convId))
                    : '{{ route('communications.index') }}';
                const duration = formatDuration(call.duration_seconds);
                return `<article class="comms-history-item ${statusClass(call.status)}">
                    <div class="comms-history-item-left">
                        <img class="comms-history-avatar" src="${escapeHtml(avatar)}" alt="" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=U&background=0B5CAB&color=fff'">
                        <div class="comms-history-main">
                            <strong>${escapeHtml(name)}</strong>
                            <span class="comms-history-sub">
                                <span class="comms-history-type">${typeIcon(call.call_type)} ${escapeHtml(call.call_type || 'voice')}</span>
                                <span>·</span>
                                <span>${escapeHtml(call.direction || '')}</span>
                                <span>·</span>
                                <span class="comms-history-status">${escapeHtml(call.status || '')}</span>
                            </span>
                        </div>
                    </div>
                    <div class="comms-history-meta">
                        <span>${escapeHtml(when)}</span>
                        ${duration ? `<span class="comms-history-duration">${escapeHtml(duration)}</span>` : ''}
                        <a class="comms-history-open" href="${href}" data-no-loading title="Open chat">Open chat</a>
                    </div>
                </article>`;
            }).join('');
        })
        .catch(() => {
            empty.hidden = false;
            empty.innerHTML = '<p>Unable to load call history.</p>';
        });
})();
</script>
</body>
</html>
