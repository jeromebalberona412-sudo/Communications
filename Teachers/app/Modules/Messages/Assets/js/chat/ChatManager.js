/**
 * Messenger UI: conversation list, thread, send/read, user search.
 */
import { createChatContext } from './manager/state.js';
import { register as registerPeer } from './manager/peer.js';
import { register as registerGroups } from './manager/groups.js';
import { register as registerMessageFormat } from './manager/message-format.js';
import { register as registerReactions } from './manager/reactions.js';
import { register as registerAttachments } from './manager/attachments.js';
import { register as registerMessages } from './manager/messages.js';
import { register as registerConversations } from './manager/conversations.js';
import { register as registerDirectory } from './manager/directory.js';
import { register as registerLoadSend } from './manager/load-send.js';
import { register as registerEvents } from './manager/events.js';
import { register as registerTeachers } from './manager/teachers.js';

const ctx = createChatContext();
if (!ctx) {
    // commsApp or Comms not present on this page
} else {
    registerPeer(ctx);
    registerGroups(ctx);
    registerMessageFormat(ctx);
    registerReactions(ctx);
    registerAttachments(ctx);
    registerMessages(ctx);
    registerConversations(ctx);
    registerDirectory(ctx);
    registerLoadSend(ctx);
    registerEvents(ctx);
    registerTeachers(ctx);

    var api = ctx.api;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var root = ctx.root;
    var Comms = window.Comms;

    window.CommsChat = {
        appendMessage: api.appendMessage,
        openConversation: api.openConversation,
        noteInboxActivity: api.noteInboxActivity,
        applyReadReceipt: function (payload) {
            if (!payload || !state.activeId) return;
            if (Number(payload.conversation_id) !== Number(state.activeId)) return;
            var upto = Number(payload.last_read_message_id || 0);
            if (!upto) return;
            var changed = false;
            state.messages.forEach(function (m) {
                if (!m || !m.mine || String(m.id).indexOf('local-') === 0) return;
                if (Number(m.id) > upto) return;
                if (m.send_status !== 'read') {
                    m.send_status = 'read';
                    changed = true;
                }
            });
            if (changed) api.renderMessages({ preserveScroll: true });
        },
        applyDelivered: function (payload) {
            if (!payload || !state.activeId) return;
            if (Number(payload.conversation_id) !== Number(state.activeId)) return;
            var id = payload.message_id;
            var changed = false;
            state.messages.forEach(function (m) {
                if (!m || !m.mine || String(m.id) !== String(id)) return;
                if (m.send_status !== 'read' && m.send_status !== 'delivered') {
                    m.send_status = 'delivered';
                    changed = true;
                }
            });
            if (changed) api.renderMessages({ preserveScroll: true });
        },
        publishSentMessage: api.publishSentMessage,
        reloadConversations: api.loadConversations,
        reloadActiveMessages: api.reloadActiveMessages,
        onReactionChange: api.onReactionChange,
        onMessageChange: function (row) {
            if (!row || !state.activeId || Number(row.conversation_id) !== Number(state.activeId)) return;
            var idx = state.messages.findIndex(function (m) { return String(m.id) === String(row.id); });
            if (idx === -1) return;
            var skipToast = !!state.msgChangeSkipToast[String(row.id)];
            if (row.deleted_for_all_at) {
                state.messages[idx].deleted_for_all = true;
                state.messages[idx].message_type = 'deleted';
                state.messages[idx].body = null;
                state.messages[idx].attachments = [];
                state.messages[idx].reactions = [];
                if (!skipToast) Comms.showToast('Message deleted.', 'info');
            } else if (row.body != null) {
                var prevBody = state.messages[idx].body;
                state.messages[idx].body = row.body;
                state.messages[idx].edited = true;
                if (!skipToast && String(prevBody || '') !== String(row.body || '')) {
                    Comms.showToast('Message edited.', 'info');
                }
            }
            api.saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
            api.renderMessages({ preserveScroll: true });
        },
        getActiveId: function () {
            return state.activeId || window.__COMMS_HEADER_ACTIVE_ID__ || null;
        },
        getActiveConversationMeta: function () {
            if (!state.activeId) return null;
            var peer = state.activeConversation && state.activeConversation.other_user
                ? state.activeConversation.other_user
                : null;
            var nameEl = document.getElementById('commsPeerName');
            var avatarEl = document.getElementById('commsPeerAvatar');
            return {
                id: Number(state.activeId),
                name: (peer && peer.name) || (nameEl ? String(nameEl.textContent || '').trim() : '') || 'Chat',
                avatar: (peer && peer.profile_image_url) || (avatarEl ? avatarEl.getAttribute('src') : '') || ''
            };
        },
        setTyping: function (visible, meta) {
            if (!els.typing) return;
            if (window.Comms && typeof window.Comms.paintTypingEl === 'function') {
                window.Comms.paintTypingEl(els.typing, !!visible, meta || null);
                return;
            }
            if (!visible) {
                els.typing.hidden = true;
                els.typing.textContent = '';
                return;
            }
            var who = meta && meta.name ? String(meta.name).trim() : '';
            els.typing.textContent = who ? (who + ' is typing...') : 'Typing...';
            els.typing.hidden = false;
        },
        updatePeerOnlineFromPresence: api.updatePeerOnlineFromPresence,
        refreshActivePeerProfile: api.refreshActivePeerProfile,
        routes: routes,
        state: state
    };

    if (els.attachMenu) els.attachMenu.hidden = true;
    if (els.attachPreview) els.attachPreview.hidden = true;

    api.startPeerProfileRealtime();
    api.syncComposerEndControls();
    api.resizeComposer();

    api.hydrateFromCache();
    api.loadConversations().then(function () {
        var initial = root.dataset.initialConversation;
        if (initial) api.openConversation(initial);
    });
}
