import { state } from './state.js';
import { getRoot } from './helpers.js';

export function zeroConversationUnread(conversationId) {
    var cid = Number(conversationId || 0);
    if (!cid) return;
    function zeroItem(c) {
        if (c && Number(c.id) === cid) {
            c.unread_count = 0;
        }
    }
    if (Array.isArray(window.__COMMS_HEADER_CONVERSATIONS__)) {
        window.__COMMS_HEADER_CONVERSATIONS__.forEach(zeroItem);
    }
    if (window.Comms && typeof window.Comms.readInboxCache === 'function' && typeof window.Comms.writeInboxCache === 'function') {
        var cached = window.Comms.readInboxCache();
        if (Array.isArray(cached) && cached.length) {
            cached.forEach(zeroItem);
            window.Comms.writeInboxCache(cached);
        }
    }
    document.querySelectorAll('.comms-msg-item[data-id="' + cid + '"]').forEach(function (btn) {
        btn.classList.remove('comms-msg-unread');
        btn.setAttribute('data-unread', '0');
        var dot = btn.querySelector('.comms-msg-unread-dot, .comms-unread');
        if (dot) dot.remove();
    });
}

export function rememberUnreadMessage(messageId) {
    var key = String(messageId || '');
    if (!key || state.countedUnreadIds[key]) return false;
    state.countedUnreadIds[key] = 1;
    var keys = Object.keys(state.countedUnreadIds);
    if (keys.length > 400) delete state.countedUnreadIds[keys[0]];
    return true;
}

export function beginReadSync() {
    window.__COMMS_INBOX_EPOCH__ = (Number(window.__COMMS_INBOX_EPOCH__) || 0) + 1;
}

export function updateHeaderBadge(count) {
    var badge = document.getElementById('commsMsgBadge');
    if (!badge) return;
    var n = Number(count || 0);
    if (!Number.isFinite(n) || n < 0) n = 0;
    badge.dataset.unreadTotal = String(n);
    try { sessionStorage.setItem('commsUnreadTotal', String(n)); } catch (e) { /* ignore */ }
    if (n <= 0) {
        badge.hidden = true;
        badge.setAttribute('hidden', '');
        badge.style.display = 'none';
        badge.textContent = '0';
    } else {
        badge.hidden = false;
        badge.removeAttribute('hidden');
        badge.style.display = '';
        badge.textContent = n > 99 ? '99+' : String(n);
    }
    var pill = document.getElementById('commsMsgCountPill');
    if (pill) {
        pill.style.display = n > 0 ? '' : 'none';
        pill.hidden = n <= 0;
        pill.textContent = n > 99 ? '99+' : String(n);
    }
    if (window.CommsHeaderChat && typeof window.CommsHeaderChat.reload === 'function'
        && document.body.classList.contains('comms-header-chat-open')) {
        window.CommsHeaderChat.reload();
    }
}

export function refreshUnread() {
    var routes = (window.CommsChat && window.CommsChat.routes) || {};
    var url = routes.unreadCount || '';
    var root = getRoot();
    if (!url && root && root.dataset.unreadCountUrl) {
        url = root.dataset.unreadCountUrl;
    }
    if (!url) {
        url = '/api/communications/unread-count';
    }
    if (!window.Comms) return;
    var gen = ++state.unreadFetchGen;
    var epoch = Number(window.__COMMS_INBOX_EPOCH__) || 0;
    window.Comms.api(url, { dedupe: true }).then(function (data) {
        if (gen !== state.unreadFetchGen) return;
        if ((Number(window.__COMMS_INBOX_EPOCH__) || 0) !== epoch) return;
        updateHeaderBadge(data.unread_count || 0);
    }).catch(function () { /* ignore */ });
}

export function markOpenConversationRead(conversationId) {
    var cid = Number(conversationId || 0);
    if (!cid || !window.Comms || document.visibilityState === 'hidden') return;
    beginReadSync();
    zeroConversationUnread(cid);
    window.clearTimeout(state.markReadTimers[cid]);
    state.markReadTimers[cid] = window.setTimeout(function () {
        delete state.markReadTimers[cid];
        window.Comms.api('/api/communications/conversations/' + encodeURIComponent(cid) + '/read', {
            method: 'POST',
            body: '{}',
            dedupe: true
        }).then(function (data) {
            state.unreadFetchGen += 1;
            zeroConversationUnread(cid);
            if (data && typeof data.unread_count === 'number') {
                updateHeaderBadge(data.unread_count);
            } else {
                refreshUnread();
            }
            if (window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
                window.CommsChat.reloadConversations();
            }
        }).catch(function () { refreshUnread(); });
    }, 120);
}
