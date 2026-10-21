/**
 * Supabase Realtime: messages, typing, presence, unread badge, call signaling.
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.
 * 
 * SECURITY WARNING:
 * This file uses VITE_SUPABASE_PUBLISHABLE_KEY which is SAFE for frontend.
 * 
 * NEVER use VITE_SUPABASE_SECRET_KEY or any sb_secret_* keys in frontend code.
 * Secret keys must ONLY be used in backend/server-side code.
 * 
 * Supabase Row Level Security (RLS) policies must be enabled on all tables
 * to protect data from unauthorized access.
 */
import { createClient } from '@supabase/supabase-js';

(function () {
    'use strict';

    if (window.CommsRealtime && window.CommsRealtime.__booted) {
        return;
    }

    // Prefer runtime config from Blade (works on Render without Vite rebuild),
    // then fall back to Vite build-time env (local `npm run build` / `npm run dev`).
    var bootCfg = (typeof window !== 'undefined' && window.__COMMS_SUPABASE__) || {};
    var url = String(bootCfg.url || import.meta.env.VITE_SUPABASE_URL || '').trim();
    var key = String(bootCfg.key || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
    var enabled = !!(url && key);
    var client = null;
    var messageChannel = null;
    var signalChannel = null;
    var presenceChannel = null;
    var inboxChannel = null;
    var callChannel = null;
    var callChannelId = null;
    // Registry of live channels per topic. Supabase delivers a broadcast to
    // every channel subscribed to that topic, so creating a second channel
    // for the same topic makes every event arrive twice.
    var topicChannels = Object.create(null);
    var previousConversationTopic = null;
    var seenSignalKeys = Object.create(null);
    var seenMessageIds = Object.create(null);
    var pendingSignals = [];
    var typingTimers = Object.create(null);
    var lastTypingSent = 0;
    var unreadFetchGen = 0;
    var activeConversationId = null;
    var localTyping = {
        active: false,
        conversationId: null,
        idleTimer: null
    };

    function getRoot() {
        return document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
    }

    function myUserId() {
        var root = getRoot();
        return root ? Number(root.dataset.currentUserId || 0) : 0;
    }

    function myTypingIdentity() {
        var root = getRoot();
        var portal = root ? String(root.dataset.portalUserType || '').trim() : '';
        var name = root ? String(root.dataset.currentUserName || '').trim() : '';
        if (!name) {
            if (portal === 'kabataan') name = 'Kabataan';
            else if (portal === 'sk_official') name = 'SK Official';
            else if (portal === 'sk_fed') name = 'SK Federation';
            else name = 'Someone';
        }
        return {
            user_id: myUserId(),
            display_name: name,
            portal: portal
        };
    }

    function applyTypingUi(conversationId, visible, meta) {
        var pageCid = window.__COMMS_PAGE_ACTIVE_ID__;
        if (pageCid == null && window.CommsChat && typeof window.CommsChat.getActiveId === 'function') {
            // Fallback when page has not set the global yet.
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

    function sendTypingBroadcast(conversationId, state) {
        if (!signalChannel || !conversationId) return;
        if (Number(activeConversationId) !== Number(conversationId)) return;
        var identity = myTypingIdentity();
        signalChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: {
                conversation_id: Number(conversationId),
                user_id: identity.user_id,
                display_name: identity.display_name,
                portal: identity.portal,
                state: state
            }
        });
    }

    function stopTyping(conversationId) {
        var cid = conversationId != null ? conversationId : localTyping.conversationId;
        clearTimeout(localTyping.idleTimer);
        localTyping.idleTimer = null;
        if (!cid) {
            localTyping.active = false;
            localTyping.conversationId = null;
            return;
        }
        if (localTyping.active && Number(localTyping.conversationId) === Number(cid)) {
            localTyping.active = false;
            localTyping.conversationId = null;
            sendTypingBroadcast(cid, 'stopped');
        } else {
            localTyping.active = false;
            localTyping.conversationId = null;
        }
    }

    function broadcastTyping(conversationId, opts) {
        opts = opts || {};
        if (!conversationId) return;
        if (opts.stop || opts.forceStop) {
            stopTyping(conversationId);
            return;
        }
        if (!signalChannel || Number(activeConversationId) !== Number(conversationId)) return;

        var now = Date.now();
        var switched = Number(localTyping.conversationId) !== Number(conversationId);
        if (localTyping.active && switched && localTyping.conversationId) {
            sendTypingBroadcast(localTyping.conversationId, 'stopped');
            localTyping.active = false;
        }

        if (!localTyping.active || switched) {
            localTyping.active = true;
            localTyping.conversationId = conversationId;
            sendTypingBroadcast(conversationId, 'started');
            lastTypingSent = now;
        } else if (now - lastTypingSent >= 1200) {
            // Keepalive so peer safety timeout does not clear mid-typing.
            sendTypingBroadcast(conversationId, 'started');
            lastTypingSent = now;
        }

        clearTimeout(localTyping.idleTimer);
        localTyping.idleTimer = setTimeout(function () {
            stopTyping(conversationId);
        }, 1800);
    }

    function myInboxName() {
        var root = getRoot();
        if (!root) return null;
        return 'comms-inbox-' + root.dataset.portalUserType + '-' + root.dataset.currentUserId;
    }

    function peerInboxName(userType, userId) {
        if (!userType || userId == null || userId === '') return null;
        return 'comms-inbox-' + userType + '-' + userId;
    }

    var inboxReloadTimer = null;

    function scheduleInboxReload() {
        window.clearTimeout(inboxReloadTimer);
        inboxReloadTimer = window.setTimeout(function () {
            if (window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
                window.CommsChat.reloadConversations();
            }
            if (typeof window.refreshMessagesPopover === 'function') {
                window.refreshMessagesPopover();
            }
            refreshUnread();
        }, 0);
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

    function deliverRealtimeInsert(row) {
        if (!row || row.id == null) return;
        // The same message can arrive from the conversation channel, the
        // inbox channel and the global watch. Only handle it once.
        var messageKey = String(row.id);
        if (seenMessageIds[messageKey]) return;
        seenMessageIds[messageKey] = Date.now();
        Object.keys(seenMessageIds).forEach(function (k) {
            if (Date.now() - seenMessageIds[k] > 120000) {
                delete seenMessageIds[k];
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
        // Call system messages arrive even when call-row/inbox signaling is delayed.
        // Match "ringing…" as well as legacy "started" so the Answer/Decline modal opens.
        if (String(row.message_type || '') === 'call'
            && !message.mine
            && /ringing|started|incoming/i.test(String(row.body || ''))
            && !/ended|declined|missed|cancelled|canceled|answered/i.test(String(row.body || ''))
            && window.CommsWebRTC
            && typeof window.CommsWebRTC.syncIncomingFromServer === 'function') {
            window.CommsWebRTC.syncIncomingFromServer(row.conversation_id);
        }
        var conversationId = row.conversation_id || message.conversation_id;
        var viewing = isConversationOpen(conversationId) && document.visibilityState !== 'hidden';
        if (!message.mine) {
            if (viewing) {
                markOpenConversationRead(conversationId);
            } else if (rememberUnreadMessage(row.id)) {
                var badge = document.getElementById('commsMsgBadge');
                if (badge) {
                    unreadFetchGen += 1;
                    var next = Number(badge.dataset.unreadTotal || 0) + 1;
                    updateHeaderBadge(next);
                }
            }
        }
        if (!viewing) {
            scheduleInboxReload();
        }
    }

    function isConversationOpen(conversationId) {
        var cid = Number(conversationId || 0);
        if (!cid) return false;
        var pageCid = window.__COMMS_PAGE_ACTIVE_ID__;
        var headerCid = window.__COMMS_HEADER_ACTIVE_ID__;
        var chatId = (window.CommsChat && typeof window.CommsChat.getActiveId === 'function')
            ? window.CommsChat.getActiveId()
            : null;
        return Number(pageCid) === cid || Number(headerCid) === cid || Number(chatId) === cid;
    }

    var markReadTimers = Object.create(null);

    function zeroConversationUnread(conversationId) {
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

    var countedUnreadIds = Object.create(null);

    function rememberUnreadMessage(messageId) {
        var key = String(messageId || '');
        if (!key || countedUnreadIds[key]) return false;
        countedUnreadIds[key] = 1;
        var keys = Object.keys(countedUnreadIds);
        if (keys.length > 400) delete countedUnreadIds[keys[0]];
        return true;
    }

    function beginReadSync() {
        window.__COMMS_INBOX_EPOCH__ = (Number(window.__COMMS_INBOX_EPOCH__) || 0) + 1;
    }

    function markOpenConversationRead(conversationId) {
        var cid = Number(conversationId || 0);
        if (!cid || !window.Comms || document.visibilityState === 'hidden') return;
        beginReadSync();
        zeroConversationUnread(cid);
        window.clearTimeout(markReadTimers[cid]);
        markReadTimers[cid] = window.setTimeout(function () {
            delete markReadTimers[cid];
            window.Comms.api('/api/communications/conversations/' + encodeURIComponent(cid) + '/read', {
                method: 'POST',
                body: '{}',
                dedupe: true
            }).then(function (data) {
                unreadFetchGen += 1;
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

    function updateHeaderBadge(count) {
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

    function refreshUnread() {
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
        var gen = ++unreadFetchGen;
        var epoch = Number(window.__COMMS_INBOX_EPOCH__) || 0;
        window.Comms.api(url, { dedupe: true }).then(function (data) {
            if (gen !== unreadFetchGen) return;
            if ((Number(window.__COMMS_INBOX_EPOCH__) || 0) !== epoch) return;
            updateHeaderBadge(data.unread_count || 0);
        }).catch(function () { /* ignore */ });
    }

    function notifyReactionChange(messageId, meta) {
        if (!messageId) return;
        if (window.CommsChat && typeof window.CommsChat.onReactionChange === 'function') {
            window.CommsChat.onReactionChange(messageId, meta || null);
        }
        if (typeof window.onCommsHeaderReactionChange === 'function') {
            window.onCommsHeaderReactionChange(messageId, meta || null);
        }
    }

    function ensureClient() {
        if (!enabled) return null;
        if (!client) {
            client = createClient(url, key, {
                realtime: { params: { eventsPerSecond: 20 } }
            });
        }
        return client;
    }

    function unwrapBroadcast(raw) {
        var payload = raw;
        if (payload && payload.payload && (payload.event || payload.type === 'broadcast')) {
            payload = payload.payload;
        }
        if (payload && payload.payload && payload.payload.type && !payload.type) {
            payload = payload.payload;
        }
        return payload;
    }

    function portalTypesMatchJs(a, b) {
        a = String(a || '').toLowerCase().trim();
        b = String(b || '').toLowerCase().trim();
        if (!a || !b) return false;
        if (a === b) return true;
        var students = { students: 1, student: 1, kabataan: 1, user: 1 };
        var teachers = { teachers: 1, teacher: 1, sk_official: 1 };
        return !!((students[a] && students[b]) || (teachers[a] && teachers[b]));
    }

    function isOwnSignal(payload) {
        if (!payload || payload.from_user_id == null) return false;
        var root = getRoot();
        if (!root) return false;
        var myId = Number(root.dataset.currentUserId || 0);
        var myType = String(root.dataset.portalUserType || '').toLowerCase().trim();
        if (Number(payload.from_user_id) !== myId) return false;
        var fromType = String(payload.from_user_type || '').toLowerCase().trim();
        if (!fromType || !myType) return true;
        return portalTypesMatchJs(fromType, myType);
    }

    function deliverSignal(payload) {
        if (!payload) return;
        if (window.CommsWebRTC && typeof window.CommsWebRTC.handleSignal === 'function') {
            window.CommsWebRTC.handleSignal(payload);
            return;
        }
        pendingSignals.push(payload);
        if (pendingSignals.length > 40) pendingSignals = pendingSignals.slice(-40);
    }

    /**
     * Stable signature of a signal payload.
     *
     * The same broadcast can be delivered more than once (reconnect, a second
     * channel on the same topic, a retried send). Processing it twice would
     * open two incoming-call modals or answer a call twice.
     */
    function signalSignature(payload) {
        if (!payload || typeof payload !== 'object') return '';
        return [
            payload.type || '',
            payload.call_id != null ? payload.call_id : '',
            payload.conversation_id != null ? payload.conversation_id : '',
            payload.from_user_id != null ? payload.from_user_id : '',
            payload.sdp ? 'sdp' : '',
            payload.candidate ? 'ice' : '',
            payload.enabled != null ? String(payload.enabled) : '',
            payload.reason || ''
        ].join('|');
    }

    function isDuplicateSignal(payload) {
        var key = signalSignature(payload);
        if (!key) return false;
        var now = Date.now();
        var entry = seenSignalKeys[key];
        if (entry && (now - entry) < 5000) {
            return true;
        }
        seenSignalKeys[key] = now;
        // Keep the map small.
        Object.keys(seenSignalKeys).forEach(function (k) {
            if (now - seenSignalKeys[k] > 30000) {
                delete seenSignalKeys[k];
            }
        });
        return false;
    }

    function flushPendingSignals() {
        if (!pendingSignals.length) return;
        if (!window.CommsWebRTC || typeof window.CommsWebRTC.handleSignal !== 'function') return;
        var queued = pendingSignals.slice();
        pendingSignals = [];
        queued.forEach(function (payload) {
            try { window.CommsWebRTC.handleSignal(payload); } catch (e) { /* ignore */ }
        });
    }

    function handleIncomingSignal(raw) {
        var payload = unwrapBroadcast(raw);
        if (!payload || isOwnSignal(payload)) return;
        if (isDuplicateSignal(payload)) return;
        deliverSignal(payload);
    }

    function subscribeConversation(conversationId) {
        var sb = ensureClient();
        if (!sb || !conversationId) return;

        if (localTyping.active && localTyping.conversationId
            && Number(localTyping.conversationId) !== Number(conversationId)) {
            stopTyping(localTyping.conversationId);
        }

        activeConversationId = conversationId;

        if (messageChannel) {
            sb.removeChannel(messageChannel);
            messageChannel = null;
        }

        messageChannel = sb.channel('comms-messages-' + conversationId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: 'conversation_id=eq.' + conversationId
            }, function (payload) {
                deliverRealtimeInsert(payload.new || {});
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: 'conversation_id=eq.' + conversationId
            }, function (payload) {
                var updated = payload.new || {};
                if (window.CommsChat && typeof window.CommsChat.onMessageChange === 'function') {
                    window.CommsChat.onMessageChange(updated);
                }
                if (typeof window.onCommsHeaderMessageChange === 'function') {
                    window.onCommsHeaderMessageChange(updated);
                }
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            }, function (payload) {
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
            })
            .subscribe();

        // One channel per topic: the conversation channel and the call channel
        // share the "comms-signal-{id}" topic and must not be created twice.
        var previousTopic = previousConversationTopic;
        previousConversationTopic = 'comms-signal-' + conversationId;
        signalChannel = acquireTopicChannel(previousConversationTopic, conversationId);
        if (previousTopic && previousTopic !== previousConversationTopic) {
            releaseTopicChannel(previousTopic);
        }
    }

    /**
     * Get (or create) the single channel for a topic and bind its handlers
     * exactly once.
     */
    function acquireTopicChannel(topic, conversationId) {
        var sb = ensureClient();
        if (!sb || !topic) return null;

        var entry = topicChannels[topic];
        if (entry) {
            entry.refs += 1;
            return entry.channel;
        }

        var channel = sb.channel(topic, {
            config: { broadcast: { ack: true, self: false } }
        });

        channel.on('broadcast', { event: 'typing' }, function (raw) {
            var data = (raw && raw.payload) ? raw.payload : (raw || {});
            var cid = Number(data.conversation_id || conversationId || 0);
            if (!cid) return;
            if (data.user_id && Number(data.user_id) === myUserId()) return;

            var pageMatch = Number(window.__COMMS_PAGE_ACTIVE_ID__) === cid;
            var headerMatch = Number(window.__COMMS_HEADER_ACTIVE_ID__) === cid;
            var chatMatch = window.CommsChat && typeof window.CommsChat.getActiveId === 'function'
                && Number(window.CommsChat.getActiveId()) === cid;
            if (!pageMatch && !headerMatch && !chatMatch) return;

            clearTimeout(typingTimers[cid]);
            if (data.state === 'stopped') {
                applyTypingUi(cid, false);
                return;
            }
            applyTypingUi(cid, true, { name: data.display_name || 'Someone', userId: data.user_id });
            typingTimers[cid] = setTimeout(function () {
                applyTypingUi(cid, false);
            }, 4000);
        })
            .on('broadcast', { event: 'webrtc' }, function (payload) {
                handleIncomingSignal(payload);
            })
            .on('broadcast', { event: 'message' }, function (raw) {
                var data = unwrapBroadcast(raw) || {};
                var msg = data.message || data;
                if (msg && msg.id != null) {
                    deliverRealtimeInsert(msg);
                }
            })
            .subscribe();

        topicChannels[topic] = { channel: channel, refs: 1 };

        return channel;
    }

    /**
     * Release a topic channel. It is only removed when nothing uses it any
     * more, so a running call keeps its signaling channel alive.
     */
    function releaseTopicChannel(topic) {
        if (!topic || !topicChannels[topic]) return;
        var entry = topicChannels[topic];
        entry.refs -= 1;
        if (entry.refs > 0) return;

        var sb = ensureClient();
        try {
            if (sb) sb.removeChannel(entry.channel);
        } catch (e) { /* ignore */ }
        delete topicChannels[topic];
        if (signalChannel === entry.channel) {
            signalChannel = null;
        }
        if (callChannel === entry.channel) {
            callChannel = null;
            callChannelId = null;
        }
    }

    function conversationSignalChannel(conversationId) {
        if (!conversationId) return null;
        if (signalChannel && String(conversationId) === String(activeConversationId || '')) {
            return signalChannel;
        }
        if (callChannel && String(conversationId) === String(callChannelId || '')) {
            return callChannel;
        }
        return null;
    }

    function ensureCallChannel(conversationId) {
        var sb = ensureClient();
        if (!sb || !conversationId) return Promise.resolve(null);
        if (conversationSignalChannel(conversationId)) {
            return Promise.resolve(conversationSignalChannel(conversationId));
        }

        callChannelId = conversationId;
        // Reuse the topic channel when it already exists: a second channel on
        // the same topic would deliver every broadcast twice.
        callChannel = acquireTopicChannel('comms-signal-' + conversationId, conversationId);

        return new Promise(function (resolve) {
            var settled = false;
            var finish = function () {
                if (settled) return;
                settled = true;
                resolve(callChannel);
            };
            var timer = setTimeout(finish, 8000);
            if (!callChannel) {
                finish();
                return;
            }
            callChannel.subscribe(function (status) {
                if (status !== 'SUBSCRIBED') return;
                clearTimeout(timer);
                finish();
            });
        });
    }

    function teardownCallChannel(conversationId) {
        if (conversationId && String(callChannelId) !== String(conversationId)) return;
        if (!callChannel) return;
        var topic = 'comms-signal-' + callChannelId;
        releaseTopicChannel(topic);
        callChannel = null;
        callChannelId = null;
    }

    function sendOnChannel(channelName, payload) {
        return sendBroadcast(channelName, 'webrtc', payload);
    }

    function sendBroadcast(channelName, eventName, payload) {
        var sb = ensureClient();
        if (!sb || !channelName) return Promise.resolve();

        var packet = { type: 'broadcast', event: eventName || 'webrtc', payload: payload };

        // Reuse the live channel for this topic when we already have one:
        // creating a second channel on the same topic makes the client
        // receive every broadcast twice.
        var entry = topicChannels[channelName];
        if (entry && entry.channel) {
            return entry.channel.send(packet).catch(function () {});
        }

        var prior = typeof sb.getChannels === 'function' ? sb.getChannels().slice() : [];
        var ch = sb.channel(channelName, {
            config: { broadcast: { ack: true, self: false } }
        });
        var createdHere = prior.indexOf(ch) === -1;

        if (!createdHere) {
            return ch.send(packet).catch(function () {});
        }

        return new Promise(function (resolve) {
            var settled = false;
            var finish = function () {
                if (settled) return;
                settled = true;
                try { sb.removeChannel(ch); } catch (e) { /* ignore */ }
                resolve();
            };
            var timer = setTimeout(finish, 8000);
            ch.subscribe(function (status) {
                if (status !== 'SUBSCRIBED') return;
                ch.send(packet)
                    .then(function () {
                        clearTimeout(timer);
                        finish();
                    })
                    .catch(function () {
                        clearTimeout(timer);
                        finish();
                    });
            });
        });
    }

    function collectInboxes(options) {
        options = options || {};
        var names = [];
        var push = function (type, id) {
            var aliases = typeAliases(type);
            for (var i = 0; i < aliases.length; i += 1) {
                var name = peerInboxName(aliases[i], id);
                if (name && names.indexOf(name) === -1) names.push(name);
            }
        };
        push(options.peerType, options.peerId);
        var extra = Array.isArray(options.peers) ? options.peers : [];
        extra.forEach(function (peer) {
            if (!peer) return;
            push(peer.user_type || peer.type || peer.portal, peer.id || peer.user_id);
        });
        return names;
    }

    function typeAliases(type) {
        var t = String(type || '').toLowerCase().trim();
        if (!t) return [];
        if (t === 'students' || t === 'student' || t === 'kabataan' || t === 'user') {
            return ['students', 'student', 'kabataan', 'user'];
        }
        if (t === 'teachers' || t === 'teacher' || t === 'sk_official') {
            return ['teachers', 'teacher', 'sk_official'];
        }
        return [t];
    }

    function broadcastMessage(conversationId, message, options) {
        options = options || {};
        if (!ensureClient() || !message) return Promise.resolve();
        var cid = conversationId || message.conversation_id;
        var payload = {
            message: message,
            conversation_id: cid
        };
        var jobs = [];
        var existing = conversationSignalChannel(cid);
        if (existing) {
            jobs.push(existing.send({
                type: 'broadcast',
                event: 'message',
                payload: payload
            }).catch(function () {}));
        } else if (cid) {
            jobs.push(sendBroadcast('comms-signal-' + cid, 'message', payload));
        }
        collectInboxes(options).forEach(function (inbox) {
            jobs.push(sendBroadcast(inbox, 'message', payload));
        });
        return Promise.all(jobs);
    }

    /**
     * Broadcast WebRTC signal on conversation channel + peer inbox(es).
     */
    function broadcastSignal(conversationId, payload, options) {
        options = options || {};
        if (!ensureClient()) return Promise.resolve();

        var jobs = [];
        var existing = conversationSignalChannel(conversationId);
        if (existing) {
            jobs.push(existing.send({
                type: 'broadcast',
                event: 'webrtc',
                payload: payload
            }).catch(function () { /* ignore */ }));
        } else if (conversationId) {
            jobs.push(sendOnChannel('comms-signal-' + conversationId, payload));
        }

        collectInboxes(options).forEach(function (inbox) {
            jobs.push(sendOnChannel(inbox, payload));
        });

        return Promise.all(jobs);
    }

    function bootRoutes() {
        var routes = (window.CommsChat && window.CommsChat.routes) || {};
        if (routes.presence) return routes;
        var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
        if (boot && boot.dataset && boot.dataset.routes) {
            try {
                return Object.assign({}, routes, JSON.parse(boot.dataset.routes));
            } catch (e) { /* ignore */ }
        }
        return routes;
    }

    function startPresence() {
        var sb = ensureClient();
        var root = getRoot();
        if (!root) return;

        var userId = root.dataset.currentUserId;
        var routes = bootRoutes();

        var lastPresencePost = 0;

        function postPresence(online) {
            if (!routes.presence || !window.Comms || typeof window.Comms.api !== 'function') return;
            // Presence is a heartbeat: never send it more often than every 10
            // seconds. Visibility changes and the periodic heartbeat would
            // otherwise saturate the endpoint rate limit.
            var now = Date.now();
            if (now - lastPresencePost < 10000) return;
            lastPresencePost = now;
            window.Comms.api(routes.presence, {
                method: 'POST',
                body: JSON.stringify({ online: !!online }),
                dedupe: false
            }).catch(function () { /* ignore */ });
        }

        function applyPresenceMap(stateMap) {
            // Keys are "portal:userId" to avoid Students/Teachers numeric ID collisions.
            var onlineIds = {};
            Object.keys(stateMap || {}).forEach(function (key) {
                var metas = stateMap[key] || [];
                if (!metas.length) {
                    if (String(key).indexOf(':') !== -1) {
                        onlineIds[String(key).toLowerCase()] = true;
                    }
                    return;
                }
                metas.forEach(function (meta) {
                    var uid = Number((meta && meta.user_id) || 0);
                    var portal = String((meta && (meta.portal || meta.user_type || meta.type)) || '').trim().toLowerCase();
                    if (!uid) {
                        var parts = String(key || '').split(':');
                        if (parts.length === 2) {
                            portal = portal || String(parts[0] || '').toLowerCase();
                            uid = Number(parts[1] || 0);
                        }
                    }
                    if (!uid) return;
                    if (portal) onlineIds[portal + ':' + uid] = true;
                    // Keep numeric fallback only when portal is unknown.
                    else onlineIds[uid] = true;
                });
            });
            window.__COMMS_PRESENCE_ONLINE_IDS__ = onlineIds;
            if (window.CommsChat && typeof window.CommsChat.updatePeerOnlineFromPresence === 'function') {
                window.CommsChat.updatePeerOnlineFromPresence(stateMap);
            }
            if (typeof window.onCommsHeaderPresence === 'function') {
                window.onCommsHeaderPresence(stateMap);
            }
        }

        if (sb) {
            var portalKey = String(root.dataset.portalUserType || 'user').trim().toLowerCase();
            var presenceKey = portalKey + ':' + String(userId);
            presenceChannel = sb.channel('comms-presence', {
                config: { presence: { key: presenceKey } }
            });

            presenceChannel
                .on('presence', { event: 'sync' }, function () {
                    applyPresenceMap(presenceChannel.presenceState ? presenceChannel.presenceState() : {});
                })
                .on('presence', { event: 'join' }, function () {
                    applyPresenceMap(presenceChannel.presenceState ? presenceChannel.presenceState() : {});
                })
                .on('presence', { event: 'leave' }, function () {
                    applyPresenceMap(presenceChannel.presenceState ? presenceChannel.presenceState() : {});
                })
                .subscribe(async function (status) {
                    if (status === 'SUBSCRIBED') {
                        await presenceChannel.track({
                            user_id: Number(userId),
                            portal: portalKey,
                            user_type: portalKey,
                            online_at: new Date().toISOString()
                        });
                    }
                });
        }

        postPresence(true);
        // DB heartbeat is secondary to Supabase presence; keep it light.
        setInterval(function () {
            if (document.visibilityState === 'visible') postPresence(true);
        }, enabled ? 45000 : 25000);

        document.addEventListener('visibilitychange', function () {
            postPresence(document.visibilityState === 'visible');
        });

        window.addEventListener('pagehide', function () {
            try {
                var token = document.querySelector('meta[name="csrf-token"]');
                fetch(routes.presence, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': token ? token.getAttribute('content') : ''
                    },
                    credentials: 'same-origin',
                    keepalive: true,
                    body: JSON.stringify({ online: false })
                });
            } catch (e) { /* ignore */ }
        });
    }

    var inboxChannels = [];

    function myInboxNames() {
        var root = getRoot();
        var primary = myInboxName();
        var names = [];
        if (primary) names.push(primary);
        if (!root) return names;
        typeAliases(root.dataset.portalUserType).forEach(function (alias) {
            var name = peerInboxName(alias, root.dataset.currentUserId);
            if (name && names.indexOf(name) === -1) names.push(name);
        });
        return names;
    }

    function bindInboxChannel(sb, name) {
        return sb.channel(name, {
            config: { broadcast: { self: false } }
        })
            .on('broadcast', { event: 'webrtc' }, function (payload) {
                handleIncomingSignal(payload);
            })
            .on('broadcast', { event: 'message' }, function (raw) {
                var data = (raw && raw.payload) ? raw.payload : (raw || {});
                var msg = data.message || data;
                if (msg) deliverRealtimeInsert(msg);
            })
            .subscribe();
    }

    function startPersonalInbox() {
        var sb = ensureClient();
        var names = myInboxNames();
        if (!sb || !names.length) return;

        inboxChannels.forEach(function (channel) {
            try { sb.removeChannel(channel); } catch (e) { /* ignore */ }
        });
        inboxChannels = [];
        names.forEach(function (name) {
            inboxChannels.push(bindInboxChannel(sb, name));
        });
        inboxChannel = inboxChannels[0] || null;
    }

    function initGlobalMessageWatch() {
        var sb = ensureClient();
        if (!sb) return;
        sb.channel('comms-messages-global')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, function (payload) {
                deliverRealtimeInsert(payload.new || {});
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages'
            }, function (payload) {
                var updated = payload.new || {};
                if (window.CommsChat && typeof window.CommsChat.onMessageChange === 'function') {
                    window.CommsChat.onMessageChange(updated);
                }
                if (typeof window.onCommsHeaderMessageChange === 'function') {
                    window.onCommsHeaderMessageChange(updated);
                }
                scheduleInboxReload();
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            }, function (payload) {
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
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'calls'
            }, function (payload) {
                if (window.CommsWebRTC && typeof window.CommsWebRTC.handleCallRow === 'function') {
                    window.CommsWebRTC.handleCallRow(payload);
                }
            })
            .subscribe();
    }

    window.CommsRealtime = {
        enabled: enabled,
        __booted: true,
        subscribeConversation: subscribeConversation,
        ensureCallChannel: ensureCallChannel,
        teardownCallChannel: teardownCallChannel,
        broadcastTyping: broadcastTyping,
        stopTyping: stopTyping,
        broadcastSignal: broadcastSignal,
        broadcastMessage: broadcastMessage,
        refreshUnread: refreshUnread,
        updateHeaderBadge: updateHeaderBadge,
        flushPendingSignals: flushPendingSignals
    };

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            try {
                var stored = sessionStorage.getItem('commsUnreadTotal');
                if (stored !== null && stored !== '') {
                    updateHeaderBadge(Number(stored));
                }
            } catch (e) { /* ignore */ }
        }
        refreshUnread();
        if (window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
            window.CommsChat.reloadConversations();
        }
    });

    window.addEventListener('pagehide', function () {
        if (localTyping.active && localTyping.conversationId) {
            stopTyping(localTyping.conversationId);
        }
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && localTyping.active && localTyping.conversationId) {
            stopTyping(localTyping.conversationId);
            return;
        }
        if (document.visibilityState !== 'visible') return;
        var activeId = window.CommsChat && typeof window.CommsChat.getActiveId === 'function'
            ? window.CommsChat.getActiveId()
            : null;
        if (activeId) markOpenConversationRead(activeId);
        refreshUnread();
        if (window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
            window.CommsChat.reloadActiveMessages();
        }
        if (window.CommsWebRTC && typeof window.CommsWebRTC.syncIncomingFromServer === 'function') {
            window.CommsWebRTC.syncIncomingFromServer(null);
        }
    });

    if (enabled) {
        startPresence();
        startPersonalInbox();
        initGlobalMessageWatch();
    } else {
        // Still heartbeat so peers see accurate online/offline without realtime.
        startPresence();
    }

    refreshUnread();
    // Keep unread badge fresh even when broadcast is delayed. The interval is
    // deliberately generous: realtime pushes the updates, this is only a
    // safety net and must not trigger rate limiting.
    setInterval(refreshUnread, enabled ? 30000 : 20000);

    // Cleanup Supabase subscriptions on page unload
    window.addEventListener('beforeunload', function () {
        var sb = ensureClient();
        if (!sb) return;

        try {
            // Remove all channels explicitly for proper cleanup
            Object.keys(topicChannels).forEach(function (topic) {
                try { sb.removeChannel(topicChannels[topic].channel); } catch (e) { /* ignore */ }
                delete topicChannels[topic];
            });
            if (messageChannel) sb.removeChannel(messageChannel);
            if (signalChannel) sb.removeChannel(signalChannel);
            if (presenceChannel) sb.removeChannel(presenceChannel);
            if (inboxChannel) sb.removeChannel(inboxChannel);
            if (callChannel) sb.removeChannel(callChannel);

            // Note: Supabase client disconnect is automatic on page unload,
            // but explicit channel removal is good practice
        } catch (e) {
            // Ignore errors during cleanup
        }
    });
})();
