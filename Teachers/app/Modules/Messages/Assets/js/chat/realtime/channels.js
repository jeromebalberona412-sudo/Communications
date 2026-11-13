import { state } from './state.js';
import { ensureClient } from './client.js';
import {
    myUserId,
    unwrapBroadcast,
    typeAliases,
    peerInboxName
} from './helpers.js';
import { applyTypingUi, stopTyping } from './typing.js';
import { handleIncomingSignal } from './signals.js';
import { deliverRealtimeInsert, handleMessageChange, handleReactionPayload } from './message-delivery.js';

export function acquireTopicChannel(topic, conversationId) {
    var sb = ensureClient();
    if (!sb || !topic) return null;

    var entry = state.topicChannels[topic];
    if (entry) {
        entry.refs += 1;
        return entry.channel;
    }

    var channel = sb.channel(topic, {
        config: { broadcast: { ack: false, self: false } }
    });
    state.topicChannels[topic] = { channel: channel, refs: 1, ready: false, queue: [] };

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

        clearTimeout(state.typingTimers[cid]);
        if (data.state === 'stopped') {
            applyTypingUi(cid, false);
            return;
        }
        applyTypingUi(cid, true, { name: data.display_name || 'Someone', userId: data.user_id });
        state.typingTimers[cid] = setTimeout(function () {
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
        .on('broadcast', { event: 'message-read' }, function (raw) {
            var data = unwrapBroadcast(raw) || {};
            if (window.CommsChat && typeof window.CommsChat.applyReadReceipt === 'function') {
                window.CommsChat.applyReadReceipt(data);
            }
        })
        .on('broadcast', { event: 'message-delivered' }, function (raw) {
            var data = unwrapBroadcast(raw) || {};
            if (window.CommsChat && typeof window.CommsChat.applyDelivered === 'function') {
                window.CommsChat.applyDelivered(data);
            }
        })
        .subscribe(function (status) {
            var row = state.topicChannels[topic];
            if (!row) return;
            if (status === 'SUBSCRIBED') {
                row.ready = true;
                row.tries = 0;
                var queued = row.queue || [];
                row.queue = [];
                queued.forEach(function (item) {
                    channel.send(item).catch(function () {});
                });
                return;
            }
            if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
            row.ready = false;
            row.tries = (row.tries || 0) + 1;
            if (row.tries > 2) return;
            window.setTimeout(function () {
                try { channel.subscribe(); } catch (e) { /* ignore */ }
            }, 500);
        });

    return channel;
}

export function releaseTopicChannel(topic) {
    if (!topic || !state.topicChannels[topic]) return;
    var entry = state.topicChannels[topic];
    entry.refs -= 1;
    if (entry.refs > 0) return;

    var sb = ensureClient();
    try {
        if (sb) sb.removeChannel(entry.channel);
    } catch (e) { /* ignore */ }
    delete state.topicChannels[topic];
    if (state.signalChannel === entry.channel) {
        state.signalChannel = null;
    }
    if (state.callChannel === entry.channel) {
        state.callChannel = null;
        state.callChannelId = null;
    }
}

export function conversationSignalChannel(conversationId) {
    if (!conversationId) return null;
    if (state.signalChannel && String(conversationId) === String(state.activeConversationId || '')) {
        return state.signalChannel;
    }
    if (state.callChannel && String(conversationId) === String(state.callChannelId || '')) {
        return state.callChannel;
    }
    return null;
}

export function ensureCallChannel(conversationId) {
    var sb = ensureClient();
    if (!sb || !conversationId) return Promise.resolve(null);

    if (state.callChannel && String(state.callChannelId) === String(conversationId)) {
        return Promise.resolve(state.callChannel);
    }
    if (state.callChannel && String(state.callChannelId) !== String(conversationId)) {
        teardownCallChannel();
    }

    var already = !!conversationSignalChannel(conversationId);
    state.callChannelId = conversationId;
    state.callChannel = acquireTopicChannel('comms-signal-' + conversationId, conversationId);
    if (already) {
        return Promise.resolve(state.callChannel);
    }

    return new Promise(function (resolve) {
        var settled = false;
        var finish = function () {
            if (settled) return;
            settled = true;
            resolve(state.callChannel);
        };
        var timer = setTimeout(finish, 1500);
        if (!state.callChannel) {
            finish();
            return;
        }
        state.callChannel.subscribe(function (status) {
            if (status !== 'SUBSCRIBED') return;
            clearTimeout(timer);
            finish();
        });
    });
}

export function teardownCallChannel(conversationId) {
    if (conversationId && String(state.callChannelId) !== String(conversationId)) return;
    if (!state.callChannel) return;
    var topic = 'comms-signal-' + state.callChannelId;
    releaseTopicChannel(topic);
    state.callChannel = null;
    state.callChannelId = null;
}

function sendOnChannel(channelName, payload) {
    if (String(channelName).indexOf('comms-signal-') === 0 && !state.topicChannels[channelName]) {
        acquireTopicChannel(channelName, String(channelName).replace('comms-signal-', ''));
    }
    return sendBroadcast(channelName, 'webrtc', payload);
}

function holdChannel(channelName) {
    var existing = state.topicChannels[channelName];
    if (existing && existing.channel) return existing;
    var sb = ensureClient();
    if (!sb) return null;
    var channel = sb.channel(channelName, {
        config: { broadcast: { ack: false, self: false } }
    });
    var row = { channel: channel, refs: 1, ready: false, queue: [], tries: 0 };
    state.topicChannels[channelName] = row;
    channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
            row.ready = true;
            row.tries = 0;
            var queued = row.queue || [];
            row.queue = [];
            queued.forEach(function (item) {
                channel.send(item).catch(function () {});
            });
            return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
        row.ready = false;
        row.tries += 1;
        if (row.tries > 2) return;
        window.setTimeout(function () {
            try { channel.subscribe(); } catch (e) { /* ignore */ }
        }, 500);
    });
    return row;
}

export function sendBroadcast(channelName, eventName, payload) {
    if (!ensureClient() || !channelName) return Promise.resolve();
    var packet = { type: 'broadcast', event: eventName || 'webrtc', payload: payload };
    var entry = holdChannel(channelName);
    if (!entry) return Promise.resolve();
    if (entry.ready) {
        return entry.channel.send(packet).catch(function () {});
    }
    entry.queue = entry.queue || [];
    entry.queue.push(packet);
    if (entry.queue.length > 60) entry.queue.shift();
    return Promise.resolve();
}

export function collectInboxes(options) {
    options = options || {};
    var names = [];
    var push = function (type, id) {
        var aliases = typeAliases(type);
        var list = aliases.length ? aliases : [type];
        var i;
        for (i = 0; i < list.length; i += 1) {
            var name = peerInboxName(list[i], id);
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

export function broadcastMessage(conversationId, message, options) {
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

export function broadcastSignal(conversationId, payload, options) {
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

export function subscribeConversation(conversationId) {
    var sb = ensureClient();
    if (!sb || !conversationId) return;

    if (state.localTyping.active && state.localTyping.conversationId
        && Number(state.localTyping.conversationId) !== Number(conversationId)) {
        stopTyping(state.localTyping.conversationId);
    }

    state.activeConversationId = conversationId;

    if (state.messageChannel) {
        sb.removeChannel(state.messageChannel);
        state.messageChannel = null;
    }

    state.messageChannel = sb.channel('comms-messages-' + conversationId)
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
            handleMessageChange(payload.new || {});
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'message_reactions'
        }, function (payload) {
            handleReactionPayload(payload);
        })
        .subscribe();

    var previousTopic = state.previousConversationTopic;
    state.previousConversationTopic = 'comms-signal-' + conversationId;
    state.signalChannel = acquireTopicChannel(state.previousConversationTopic, conversationId);
    if (previousTopic && previousTopic !== state.previousConversationTopic) {
        releaseTopicChannel(previousTopic);
    }
}
