@extends('layouts.app')

@section('title', 'Call history')

@section('content')
<div
    class="comms-call-history"
    id="commsCallHistory"
    data-calls-url="{{ route('api.communications.calls.index') }}"
    data-messages-url="{{ route('communications.index') }}"
>
    <div class="comms-history-header-row">
        <h1 class="page-title">Call history</h1>
        <a class="primary-button" href="{{ route('communications.index') }}">Open Messages</a>
    </div>
    <div class="panel">
        <div id="commsCallHistoryList" class="comms-history-list"></div>
        <p id="commsCallHistoryEmpty" class="empty-state" hidden>No calls yet.</p>
    </div>
</div>
<script type="module">
    const root = document.getElementById('commsCallHistory');
    const list = document.getElementById('commsCallHistoryList');
    const empty = document.getElementById('commsCallHistoryEmpty');
    const url = root?.dataset.callsUrl;
    if (!url || !list) throw new Error('Call history root missing');

    function formatDuration(seconds, status) {
        const answered = status === 'completed' || status === 'ended' || status === 'answered';
        if (!answered || seconds == null) return '—';
        const total = Math.max(0, Number(seconds) || 0);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = String(total % 60).padStart(2, '0');
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    }

    function statusLabel(status) {
        const map = { completed: 'Completed', ended: 'Completed', missed: 'Missed', declined: 'Declined', rejected: 'Declined', cancelled: 'Cancelled', canceled: 'Cancelled', failed: 'Failed', answered: 'Answered', ringing: 'Ringing' };
        return map[String(status || '').toLowerCase()] || status || 'Ended';
    }

    function rowHtml(call) {
        const peer = call.peer?.name || 'Unknown';
        const when = call.created_at ? new Date(call.created_at).toLocaleString() : '';
        const kind = call.call_type === 'video' ? 'Video' : 'Audio';
        const direction = call.direction === 'outgoing' ? 'Outgoing' : 'Incoming';
        const status = statusLabel(call.status);
        return `<article class="comms-history-item" data-call-id="${Number(call.id) || ''}">
            <strong>${peer}</strong>
            <span>${kind} · ${direction} · ${status}</span>
            <span>Duration: ${formatDuration(call.duration_seconds, call.status)}</span>
            <span>${when}</span>
        </article>`;
    }

    function paint(calls) {
        if (!calls.length) {
            empty.hidden = false;
            list.innerHTML = '';
            return;
        }
        empty.hidden = true;
        list.innerHTML = calls.map(rowHtml).join('');
    }

    window.CommsCallHistory = {
        upsert(call) {
            if (!call || call.id == null) return;
            const existing = calls.findIndex((row) => Number(row.id) === Number(call.id));
            if (existing === -1) calls.unshift(call);
            else calls[existing] = Object.assign({}, calls[existing], call);
            calls.sort((a, b) => Number(b.id) - Number(a.id));
            paint(calls);
        }
    };

    const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    const data = await response.json();
    let calls = Array.isArray(data.calls) ? data.calls : [];
    paint(calls);
</script>
@endsection
