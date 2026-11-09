import { me, routes } from './GroupCallUtils.js';

export function createGroupCallSignaling(ctx) {
    function signal(payload, targetPeer) {
        if (!ctx.meshCall || !window.CommsRealtime || typeof window.CommsRealtime.broadcastSignal !== 'function') {
            return Promise.resolve();
        }
        var options = {};
        if (targetPeer) {
            options.peerId = targetPeer.id;
            options.peerType = targetPeer.type || targetPeer.user_type;
        } else if (ctx.meshInvitees.length) {
            options.peers = ctx.meshInvitees.map(function (p) {
                return { id: p.id, type: p.user_type || p.type };
            });
        }
        var self = me();
        payload.from_user_id = self.id;
        payload.from_user_type = self.type;
        payload.from_name = self.name;
        payload.call_id = ctx.meshCall.id;
        payload.conversation_id = ctx.meshCall.conversation_id;
        payload.is_group_call = true;
        return window.CommsRealtime.broadcastSignal(ctx.meshCall.conversation_id, payload, options);
    }

    async function updateStatus(status) {
        if (!ctx.meshCall || !window.Comms) return null;
        var r = routes();
        if (!r.callStatus) return null;
        return window.Comms.api(window.Comms.route(r.callStatus, ctx.meshCall.id), {
            method: 'POST',
            body: JSON.stringify({ status: status }),
            dedupe: false
        }).then(function (data) {
            if (data && data.message && window.CommsChat && typeof window.CommsChat.publishSentMessage === 'function') {
                window.CommsChat.publishSentMessage(data.message, (data.call && data.call.invitees) || ctx.meshInvitees);
                if (typeof window.CommsChat.appendMessage === 'function') window.CommsChat.appendMessage(data.message);
            }
            return data && data.call;
        }).catch(function () { return null; });
    }

    return {
        signal: signal,
        updateStatus: updateStatus
    };
}
