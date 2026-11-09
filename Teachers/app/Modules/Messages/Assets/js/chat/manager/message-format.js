/**
 * Chat manager — message-format
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.callPhoneIcon !== undefined) var callPhoneIcon = ctx.callPhoneIcon;

function callBubbleClass(body) {
    var text = String(body || '').toLowerCase();
    if (text.indexOf('declined') !== -1) return 'comms-bubble--call comms-bubble--call-declined';
    if (text.indexOf('cancelled') !== -1 || text.indexOf('canceled') !== -1) return 'comms-bubble--call comms-bubble--call-cancelled';
    if (text.indexOf('missed') !== -1 || text.indexOf('no pickup') !== -1) return 'comms-bubble--call comms-bubble--call-missed';
    if (text.indexOf('ended') !== -1) return 'comms-bubble--call comms-bubble--call-ended';
    if (text.indexOf('answered') !== -1) return 'comms-bubble--call comms-bubble--call-answered';
    if (text.indexOf('ringing') !== -1) return 'comms-bubble--call comms-bubble--call-ringing';
    if (text.indexOf('started') !== -1) return 'comms-bubble--call comms-bubble--call-started';
    return 'comms-bubble--call';
}

var callPhoneIcon = '<svg class="comms-call-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>';

function groupCallStillOpen(m) {
    var body = String(m && m.body || '').toLowerCase();
    if (body.indexOf('group') === -1 || body.indexOf('started') === -1) return false;
    var items = state.messages || [];
    for (var i = 0; i < items.length; i += 1) {
        var other = items[i];
        if (!other || Number(other.id) <= Number(m.id) || other.message_type !== 'call') continue;
        var text = String(other.body || '').toLowerCase();
        if (text.indexOf('ended') !== -1 || text.indexOf('missed') !== -1 || text.indexOf('cancelled') !== -1 || text.indexOf('canceled') !== -1) {
            return false;
        }
    }
    return true;
}

function renderCallBubble(m) {
    var join = groupCallStillOpen(m)
        ? '<button type="button" class="comms-call-join" data-join-group-call="' + Comms.escapeHtml(String(m.conversation_id || state.activeId || '')) + '">Join Call</button>'
        : '';
    return '<div class="comms-bubble-wrap ' + (m.mine ? 'is-mine' : 'is-theirs') + ' is-call" data-id="' + m.id + '">' +
        '<div class="comms-bubble-row">' +
        '<div class="' + callBubbleClass(m.body) + '" role="status">' +
        callPhoneIcon +
        '<span class="comms-call-text">' + Comms.escapeHtml(m.body) + '</span>' +
        join +
        '</div>' +
        api.renderMessageActions(m, false) +
        '</div></div>';
}

function formatBytes(bytes) {
    var n = Number(bytes || 0);
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(2) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function fileDocIconSvg() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
}

function fileExtLabel(name) {
    var parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
}

function fileKindClass(att) {
    var name = String((att && att.file_name) || '');
    var mime = String((att && att.mime_type) || '').toLowerCase();
    var ext = fileExtLabel(name);
    if (ext === 'PDF' || mime === 'application/pdf') return ' is-pdf';
    if (ext === 'DOC' || ext === 'DOCX' || mime.indexOf('msword') !== -1 || mime.indexOf('wordprocessingml') !== -1) {
        return ' is-word';
    }
    if (ext === 'XLS' || ext === 'XLSX' || mime.indexOf('spreadsheetml') !== -1 || mime.indexOf('ms-excel') !== -1) {
        return ' is-excel';
    }
    return '';
}

function formatFullDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString([], {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatDaySeparator(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return time;
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + time;
    var weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    if (d >= weekAgo) {
        return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + time;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + time;
}

function shouldInsertDateSeparator(prevIso, currIso) {
    if (!currIso) return false;
    if (!prevIso) return true;
    var prev = new Date(prevIso);
    var curr = new Date(currIso);
    if (Number.isNaN(prev.getTime()) || Number.isNaN(curr.getTime())) return true;
    if (prev.toDateString() !== curr.toDateString()) return true;
    return Math.abs(curr.getTime() - prev.getTime()) >= 45 * 60 * 1000;
}

function renderDateSeparator(iso) {
    var label = formatDaySeparator(iso);
    if (!label) return '';
    return '<div class="comms-date-sep" role="separator">' +
        '<span class="comms-date-sep-text">' + Comms.escapeHtml(label) + '</span>' +
        '</div>';
}


    Object.assign(api, {
        callBubbleClass: callBubbleClass,
        fileDocIconSvg: fileDocIconSvg,
        fileExtLabel: fileExtLabel,
        fileKindClass: fileKindClass,
        formatBytes: formatBytes,
        formatDaySeparator: formatDaySeparator,
        formatFullDateTime: formatFullDateTime,
        groupCallStillOpen: groupCallStillOpen,
        renderCallBubble: renderCallBubble,
        renderDateSeparator: renderDateSeparator,
        shouldInsertDateSeparator: shouldInsertDateSeparator
    });

    ctx.callPhoneIcon = callPhoneIcon;
}
