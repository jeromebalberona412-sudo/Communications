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

    function formatDuration(seconds) {
        if (seconds == null) return '—';
        const total = Math.max(0, Number(seconds) || 0);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = String(total % 60).padStart(2, '0');
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    }

    const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    const data = await response.json();
    const calls = Array.isArray(data.calls) ? data.calls : [];
    if (!calls.length) {
        empty.hidden = false;
    } else {
        list.innerHTML = calls.map((call) => {
            const peer = call.peer?.name || 'Unknown';
            const when = call.created_at ? new Date(call.created_at).toLocaleString() : '';
            return `<article class="comms-history-item">
                <strong>${peer}</strong>
                <span>${call.call_type} · ${call.status} · ${call.direction || ''}</span>
                <span>Duration: ${formatDuration(call.duration_seconds)}</span>
                <span>${when}</span>
            </article>`;
        }).join('');
    }
</script>
@endsection
