import { loadWebrtc } from '../../webrtc/load.js';
import { state } from './state.js';
import { getRoot, isConversationOpen, portalTypesMatchJs, typeAliases } from './helpers.js';
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
        && portalTypesMatchJs(row.sender_type, root.dataset.portalUserType));
    return {
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        sender_type: row.sender_type,
        body: row.body,
        message_type: row.message_type,
        mine: mine,
        sender_name: row.sender_name || '',
        sender_avatar_url: row.sender_avatar_url || '',
        created_at: row.created_at,
        edited: !!row.edited_at,
        deleted_for_all: !!row.deleted_for_all_at,
        reactions: row.reactions || [],
        attachments: row.attachments || []
    };
}

function previewText(message) {
    var type = String(message.message_type || '');
    if (type === 'image') return 'Photo';
    if (type === 'file') return 'File';
    if (type === 'call') return String(message.body || 'Call');
    var body = String(message.body || '').replace(/\s+/g, ' ').trim();
    if (!body) return 'New message';
    return body.length > 90 ? body.slice(0, 87) + '...' : body;
}

function showMessageNotice(message) {
    if (!message || message.mine) return;
    var cid = Number(message.conversation_id || 0);
    if (!cid) return;
    if (isConversationOpen(cid) && document.visibilityState !== 'hidden') return;
    var stack = document.getElementById('commsMsgNotices');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'commsMsgNotices';
        stack.className = 'comms-msg-notices';
        document.body.appendChild(stack);
    }
    var existing = stack.querySelector('[data-conversation-id="' + cid + '"]');
    if (existing) existing.remove();
    var name = message.sender_name || 'New message';
    var avatar = message.sender_avatar_url || '';
    if (!avatar && window.Comms && typeof window.Comms.defaultAvatar === 'function') {
        avatar = window.Comms.defaultAvatar(name);
    }
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'comms-msg-notice';
    card.setAttribute('data-conversation-id', String(cid));
    card.innerHTML = '<img alt="" src="' + String(avatar).replace(/"/g, '&quot;') + '">' +
        '<span><strong></strong><em></em></span>';
    card.querySelector('strong').textContent = name;
    card.querySelector('em').textContent = previewText(message);
    card.addEventListener('click', function () {
        card.remove();
        if (window.CommsChat && typeof window.CommsChat.openConversation === 'function') {
            window.CommsChat.openConversation(cid);
            return;
        }
        if (typeof window.openChatWindow === 'function') {
            window.openChatWindow(cid, { peerName: name, peerAvatar: avatar });
            return;
        }
        window.location.href = '/messages?conversation=' + encodeURIComponent(cid);
    });
    stack.appendChild(card);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    window.setTimeout(function () {
        if (card.parentNode) card.remove();
    }, 6000);
    if (window.Comms && typeof window.Comms.playReactionSound === 'function') {
        window.Comms.playReactionSound();
    }
}

function ackDelivered(message) {
    if (!message || message.mine || !window.CommsRealtime || typeof window.CommsRealtime.sendBroadcast !== 'function') return;
    if (!message.sender_id || !message.sender_type) return;
    var aliases = typeAliases(message.sender_type);
    if (!aliases.length) aliases = [String(message.sender_type)];
    aliases.forEach(function (alias) {
        window.CommsRealtime.sendBroadcast(
            'comms-inbox-' + alias + '-' + message.sender_id,
            'message-delivered',
            { message_id: message.id, conversation_id: message.conversation_id }
        );
    });
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
        if (!viewing) showMessageNotice(message);
        ackDelivered(message);
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
