import { state } from './state.js';
import { ensureClient } from './client.js';
import { getRoot, myInboxName, peerInboxName, typeAliases } from './helpers.js';
import { handleIncomingSignal } from './signals.js';
import { deliverRealtimeInsert } from './message-delivery.js';

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

export function startPersonalInbox() {
    var sb = ensureClient();
    var names = myInboxNames();
    if (!sb || !names.length) return;

    state.inboxChannels.forEach(function (channel) {
        try { sb.removeChannel(channel); } catch (e) { /* ignore */ }
    });
    state.inboxChannels = [];
    names.forEach(function (name) {
        state.inboxChannels.push(bindInboxChannel(sb, name));
    });
    state.inboxChannel = state.inboxChannels[0] || null;
}
