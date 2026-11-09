import { RING_MS } from './GroupMeshState.js';
import { me, routes, toast } from './GroupCallUtils.js';

export function createGroupCallLifecycle(ctx, deps) {
    var ui = deps.ui;
    var signaling = deps.signaling;
    var media = deps.media;
    var peers = deps.peers;

    async function cleanupMesh(opts) {
        opts = opts || {};
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopCallTimer === 'function') {
            window.CommsWebRTC.__stopCallTimer();
        }
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopRingtone === 'function') {
            window.CommsWebRTC.__stopRingtone();
        }
        if (ctx.ringTimer) {
            clearTimeout(ctx.ringTimer);
            ctx.ringTimer = null;
        }
        Object.keys(ctx.meshPeers).forEach(function (key) {
            try { ctx.meshPeers[key].pc && ctx.meshPeers[key].pc.close(); } catch (e) { /* ignore */ }
            ui.removeTile(key);
        });
        ctx.meshPeers = Object.create(null);
        if (ctx.meshLocalStream) {
            ctx.meshLocalStream.getTracks().forEach(function (t) { t.stop(); });
            ctx.meshLocalStream = null;
        }
        var e = ui.els();
        if (e.localVideo) e.localVideo.srcObject = null;
        if (e.remoteGrid) {
            e.remoteGrid.innerHTML = '';
            e.remoteGrid.hidden = true;
        }
        if (e.inCall) {
            e.inCall.classList.remove('is-group-call', 'has-remote-video', 'is-video-call', 'is-connected');
            if (!opts.keepOverlay) e.inCall.hidden = true;
        }
        ctx.meshCall = null;
        ctx.meshInvitees = [];
        ctx.meshConnected = false;
        ctx.meshRole = null;
        ctx.meshWantsVideo = false;
        ctx.meshCameraOn = false;
        window.__commsMeshTimerStarted = false;
    }

    async function startGroupCall(conversationId, callType, conversation) {
        if (!window.Comms) return;
        if (ctx.meshCall) return;
        try {
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopCallTimer === 'function') {
                window.CommsWebRTC.__stopCallTimer();
            }
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__startRingtone === 'function') {
                window.CommsWebRTC.__startRingtone('outgoing');
            }
            ctx.meshWantsVideo = callType === 'video';
            ctx.meshRole = 'caller';
            var r = routes();
            var data = await window.Comms.api(window.Comms.route(r.startCall, conversationId), {
                method: 'POST',
                body: JSON.stringify({ call_type: callType }),
                dedupe: false
            });
            ctx.meshCall = data.call;
            if (data.message && window.CommsChat && typeof window.CommsChat.publishSentMessage === 'function') {
                window.CommsChat.publishSentMessage(data.message, ctx.meshCall.invitees || []);
                if (typeof window.CommsChat.appendMessage === 'function') window.CommsChat.appendMessage(data.message);
            }
            if (!ctx.meshCall || !ctx.meshCall.is_group_call) {
                await cleanupMesh({ keepOverlay: true });
                if (window.CommsWebRTC.__startDirect) {
                    return window.CommsWebRTC.__startDirect(conversationId, callType, conversation);
                }
                return;
            }
            ctx.meshInvitees = Array.isArray(ctx.meshCall.invitees) ? ctx.meshCall.invitees.slice() : [];
            await media.ensureLocalMedia();
            ui.showGroupUi(ctx.meshCall, 'Ringing group…');
            await signaling.signal({
                type: 'group-invite',
                call_type: callType,
                peer_name: me().name,
                caller_id: ctx.meshCall.caller_id,
                caller_type: ctx.meshCall.caller_type,
                invitees: ctx.meshInvitees
            });
            ctx.ringTimer = setTimeout(function () {
                if (!ctx.meshConnected && ctx.meshRole === 'caller') {
                    leaveGroupCall('missed');
                }
            }, RING_MS);
            if (window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
                window.CommsChat.reloadActiveMessages();
            }
        } catch (err) {
            toast((err && err.message) || 'Unable to start group call.', 'error');
            await cleanupMesh();
        }
    }

    async function acceptGroupInvite(payload) {
        if (ctx.meshCall && Number(ctx.meshCall.id) === Number(payload.call_id)) return;
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopCallTimer === 'function') {
            window.CommsWebRTC.__stopCallTimer();
        }
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopRingtone === 'function') {
            window.CommsWebRTC.__stopRingtone();
        }
        ctx.meshWantsVideo = (payload.call_type || 'voice') === 'video';
        ctx.meshRole = 'callee';
        ctx.meshCall = {
            id: payload.call_id,
            conversation_id: payload.conversation_id,
            call_type: payload.call_type || 'voice',
            caller_id: payload.caller_id,
            caller_type: payload.caller_type,
            is_group_call: true,
            call_max_participants: payload.call_max_participants || 8,
            peer: { name: payload.peer_name || 'Group call', is_group: true },
            invitees: payload.invitees || []
        };
        ctx.meshInvitees = Array.isArray(ctx.meshCall.invitees) ? ctx.meshCall.invitees.slice() : [];
        await media.ensureLocalMedia();
        ui.showGroupUi(ctx.meshCall, 'Connecting…');
        await signaling.updateStatus('accepted');
        await signaling.signal({
            type: 'group-join',
            peer_name: me().name,
            call_type: ctx.meshCall.call_type
        });
        if (payload.caller_id) {
            await peers.connectToPeer(payload.caller_id, payload.caller_type, payload.peer_name || 'Caller');
        }
        ctx.meshConnected = true;
        ui.setStatus('Connected');
    }

    async function leaveGroupCall(reason) {
        if (!ctx.meshCall) {
            await cleanupMesh();
            return;
        }
        var callId = ctx.meshCall.id;
        var convId = ctx.meshCall.conversation_id;
        var isCaller = ctx.meshRole === 'caller';

        var isEndingEntireCall = isCaller && (reason === 'ended' || reason === 'cancelled' || reason === 'missed');

        if (isEndingEntireCall) {
            await signaling.signal({ type: 'group-end', reason: reason || 'ended' });
        } else {
            await signaling.signal({ type: 'group-leave', reason: reason || 'ended' });
        }

        if (isCaller) {
            var nextStatus = reason === 'cancelled' ? 'cancelled' : 'ended';
            if (reason === 'missed' && !ctx.meshConnected) nextStatus = 'missed';
            await signaling.updateStatus(nextStatus);
        } else if (reason === 'rejected') {
            await signaling.updateStatus('rejected');
        }
        await cleanupMesh();
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__showEnded === 'function') {
            window.CommsWebRTC.__showEnded(reason || 'ended', 'Group call', callId);
        }
        if (window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
            window.CommsChat.reloadActiveMessages();
        } else if (convId && window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
            window.CommsChat.reloadConversations();
        }
    }

    function isActive() {
        return !!ctx.meshCall;
    }

    return {
        cleanupMesh: cleanupMesh,
        startGroupCall: startGroupCall,
        acceptGroupInvite: acceptGroupInvite,
        leaveGroupCall: leaveGroupCall,
        isActive: isActive
    };
}
