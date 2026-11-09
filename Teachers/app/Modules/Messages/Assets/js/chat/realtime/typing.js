import { state } from './state.js';
import { myTypingIdentity } from './helpers.js';

export function applyTypingUi(conversationId, visible, meta) {
    var pageCid = window.__COMMS_PAGE_ACTIVE_ID__;
    if (pageCid == null && window.CommsChat && typeof window.CommsChat.getActiveId === 'function') {
        var maybe = window.CommsChat.getActiveId();
        if (maybe != null && window.__COMMS_HEADER_ACTIVE_ID__ == null) pageCid = maybe;
    }
    var headerCid = window.__COMMS_HEADER_ACTIVE_ID__;
    var pageEl = document.getElementById('commsTyping');
    var modalEl = document.getElementById('commsChatModalTyping');
    var paint = (window.Comms && typeof window.Comms.paintTypingEl === 'function')
        ? window.Comms.paintTypingEl
        : null;

    if (pageEl) {
        if (visible && Number(pageCid) === Number(conversationId)) {
            if (paint) paint(pageEl, true, meta || null);
            else {
                var who = (meta && meta.name) ? String(meta.name).trim() : '';
                pageEl.textContent = who ? (who + ' is typing...') : 'Typing...';
                pageEl.hidden = false;
            }
        } else if (!visible && (pageCid == null || Number(pageCid) === Number(conversationId))) {
            if (paint) paint(pageEl, false);
            else {
                pageEl.hidden = true;
                pageEl.textContent = '';
            }
        }
    }
    if (modalEl) {
        if (visible && Number(headerCid) === Number(conversationId)) {
            if (paint) paint(modalEl, true, meta || null);
            else {
                var whoM = (meta && meta.name) ? String(meta.name).trim() : '';
                modalEl.textContent = whoM ? (whoM + ' is typing...') : 'Typing...';
                modalEl.hidden = false;
            }
        } else if (!visible && (headerCid == null || Number(headerCid) === Number(conversationId))) {
            if (paint) paint(modalEl, false);
            else {
                modalEl.hidden = true;
                modalEl.textContent = '';
            }
        }
    }

    if (window.CommsChat && typeof window.CommsChat.setTyping === 'function') {
        var active = typeof window.CommsChat.getActiveId === 'function' ? window.CommsChat.getActiveId() : null;
        if (!visible || Number(active) === Number(conversationId)) {
            try { window.CommsChat.setTyping(!!visible, meta || null); } catch (e) { /* ignore */ }
        }
    }
}

function sendTypingBroadcast(conversationId, typingState) {
    if (!state.signalChannel || !conversationId) return;
    if (Number(state.activeConversationId) !== Number(conversationId)) return;
    var identity = myTypingIdentity();
    state.signalChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
            conversation_id: Number(conversationId),
            user_id: identity.user_id,
            display_name: identity.display_name,
            portal: identity.portal,
            state: typingState
        }
    });
}

export function stopTyping(conversationId) {
    var cid = conversationId != null ? conversationId : state.localTyping.conversationId;
    clearTimeout(state.localTyping.idleTimer);
    state.localTyping.idleTimer = null;
    if (!cid) {
        state.localTyping.active = false;
        state.localTyping.conversationId = null;
        return;
    }
    if (state.localTyping.active && Number(state.localTyping.conversationId) === Number(cid)) {
        state.localTyping.active = false;
        state.localTyping.conversationId = null;
        sendTypingBroadcast(cid, 'stopped');
    } else {
        state.localTyping.active = false;
        state.localTyping.conversationId = null;
    }
}

export function broadcastTyping(conversationId, opts) {
    opts = opts || {};
    if (!conversationId) return;
    if (opts.stop || opts.forceStop) {
        stopTyping(conversationId);
        return;
    }
    if (!state.signalChannel || Number(state.activeConversationId) !== Number(conversationId)) return;

    var now = Date.now();
    var switched = Number(state.localTyping.conversationId) !== Number(conversationId);
    if (state.localTyping.active && switched && state.localTyping.conversationId) {
        sendTypingBroadcast(state.localTyping.conversationId, 'stopped');
        state.localTyping.active = false;
    }

    if (!state.localTyping.active || switched) {
        state.localTyping.active = true;
        state.localTyping.conversationId = conversationId;
        sendTypingBroadcast(conversationId, 'started');
        state.lastTypingSent = now;
    } else if (now - state.lastTypingSent >= 1200) {
        sendTypingBroadcast(conversationId, 'started');
        state.lastTypingSent = now;
    }

    clearTimeout(state.localTyping.idleTimer);
    state.localTyping.idleTimer = setTimeout(function () {
        stopTyping(conversationId);
    }, 1800);
}
