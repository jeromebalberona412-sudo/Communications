import { loadWebrtc } from '../../webrtc/load.js';
import { state } from './state.js';
import { getRoot, isConversationOpen } from './helpers.js';
import {
    rememberUnreadMessage,
    markOpenConversationRead,
    updateHeaderBadge
} from './unread.js';
import { scheduleInboxReload } from './inbox-schedule.js';

export function notifyReactionChange(messageId, meta) {
    if (!messageId) return;
    if (window.CommsChat && typeof window.CommsChat.onReactionChange === 'function') {
        window.CommsChat.onReactionChange(messageId, meta || null);
    }
    if (typeof window.onCommsHeaderReactionChange === 'function') {
        window.onCommsHeaderReactionChange(messageId, meta || null);
    }
}

function normalizeRealtimeMessage(row) {
    var root = getRoot();
    var mine = !!(root && Number(row.sender_id) === Number(root.dataset.currentUserId)
        && row.sender_type === root.dataset.portalUserType);
    return {
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        sender_type: row.sender_type,
        body: row.body,
        message_type: row.message_type,
        mine: mine,
        created_at: row.created_at,
        edited: !!row.edited_at,
        deleted_for_all: !!row.deleted_for_all_at,
        reactions: [],
        attachments: []
    };
}

export function deliverRealtimeInsert(row) {
    if (!row || row.id == null) return;
    var messageKey = String(row.id);
    if (state.seenMessageIds[messageKey]) return;
    state.seenMessageIds[messageKey] = Date.now();
    Object.keys(state.seenMessageIds).forEach(function (k) {
        if (Date.now() - state.seenMessageIds[k] > 120000) {
            delete state.seenMessageIds[k];
        }
    });
    var message = normalizeRealtimeMessage(row);
    var isAttachment = row.message_type === 'image' || row.message_type === 'file';
    if (window.CommsChat && typeof window.CommsChat.appendMessage === 'function') {
        window.CommsChat.appendMessage(message);
        if (isAttachment && typeof window.CommsChat.reloadActiveMessages === 'function') {
            window.CommsChat.reloadActiveMessages();
        }
        if (typeof window.CommsChat.noteInboxActivity === 'function') {
            window.CommsChat.noteInboxActivity(row);
        }
    }
    if (typeof window.onCommsHeaderMessageInsert === 'function') {
        window.onCommsHeaderMessageInsert(message);
    }
    if (String(row.message_type || '') === 'call'
        && !message.mine
        && /ringing|started|incoming/i.test(String(row.body || ''))
        && !/ended|declined|missed|cancelled|canceled|answered/i.test(String(row.body || ''))) {
        loadWebrtc().then(function (api) {
            if (api && typeof api.syncIncomingFromServer === 'function') {
                api.syncIncomingFromServer(row.conversation_id);
            }
        });
    }
    var conversationId = row.conversation_id || message.conversation_id;
    var viewing = isConversationOpen(conversationId) && document.visibilityState !== 'hidden';
    if (!message.mine) {
        if (viewing) {
            markOpenConversationRead(conversationId);
        } else if (rememberUnreadMessage(row.id)) {
            var badge = document.getElementById('commsMsgBadge');
            if (badge) {
                state.unreadFetchGen += 1;
                var next = Number(badge.dataset.unreadTotal || 0) + 1;
                updateHeaderBadge(next);
            }
        }
    }
    if (!viewing) {
        scheduleInboxReload();
    }
}

export function handleMessageChange(updated) {
    if (window.CommsChat && typeof window.CommsChat.onMessageChange === 'function') {
        window.CommsChat.onMessageChange(updated);
    }
    if (typeof window.onCommsHeaderMessageChange === 'function') {
        window.onCommsHeaderMessageChange(updated);
    }
}

export function handleReactionPayload(payload) {
    var eventType = String(payload.eventType || '').toUpperCase();
    var row = Object.assign({}, payload.new || payload.old || {});
    if (payload.old && payload.old.emoji && payload.new && payload.new.emoji
        && payload.old.emoji !== payload.new.emoji) {
        row._old_emoji = payload.old.emoji;
    }
    if (eventType === 'DELETE' && payload.old) {
        row = Object.assign({}, payload.old);
    }
    notifyReactionChange(row.message_id, { eventType: eventType, row: row });
}
