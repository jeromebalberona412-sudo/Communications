import { RING_MS } from './GroupMeshState.js';
import { me, routes, samePortalType, toast } from './GroupCallUtils.js';

export function createGroupCallLifecycle(ctx, deps) {
    var ui = deps.ui;
    var signaling = deps.signaling;
    var media = deps.media;
    var peers = deps.peers;

    async function cleanupMesh(opts) {
        opts = opts || {};
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__forceStopCall === 'function') {
            window.CommsWebRTC.__forceStopCall();
        } else if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopCallTimer === 'function') {
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
        ctx.pendingSignals = [];
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
            e.inCall.classList.remove('is-group-call', 'has-remote-video', 'is-video-call', 'is-connected', 'is-ringing-preview');
            if (!opts.keepOverlay) e.inCall.hidden = true;
        }
        ctx.meshCall = null;
        ctx.meshInvitees = [];
        ctx.meshConnected = false;
        ctx.meshRole = null;
        ctx.meshWantsVideo = false;
        ctx.meshCameraOn = false;
        ctx.meshVideoLatched = false;
        ctx.meshStarting = false;
        window.__commsMeshTimerStarted = false;
    }

    async function linkKnownParticipants(callerId, callerType, callerName) {
        var people = [];
        var seen = Object.create(null);
        function add(id, type, name) {
            if (!id) return;
            var key = String(id) + ':' + String(type || '');
            if (seen[key]) return;
            seen[key] = true;
            people.push({ id: id, type: type, name: name || 'Participant' });
        }
        add(callerId, callerType, callerName || 'Caller');
        (ctx.meshInvitees || []).forEach(function (person) {
            add(person.id || person.user_id, person.user_type || person.type, person.name);
        });
        var i;
        for (i = 0; i < people.length; i += 1) {
            try {
                await peers.connectToPeer(people[i].id, people[i].type, people[i].name);
            } catch (eLink) { /* the next join signal retries this peer */ }
        }
    }

    async function startGroupCall(conversationId, callType, conversation, forceNew) {
        if (!window.Comms) return;
        var now = Date.now();
        if (ctx.meshCall || ctx.meshStarting) return;
        if (ctx.meshLastStartAt && (now - ctx.meshLastStartAt) < 2000) return;
        ctx.meshLastStartAt = now;
        ctx.meshStarting = true;
        try {
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopCallTimer === 'function') {
                window.CommsWebRTC.__stopCallTimer();
            }
            ctx.meshWantsVideo = callType === 'video';
            ctx.meshCameraOn = callType === 'video';
            ctx.meshRole = 'caller';
            if (callType === 'video') {
                try { await media.ensureLocalMedia(); } catch (ePreview) { /* the call screen still opens */ }
            }
            var peer = (conversation && conversation.other_user) || {};
            ui.showGroupUi({
                peer: {
                    name: peer.name || (conversation && conversation.name) || 'Group',
                    is_group: true,
                    profile_image_url: peer.profile_image_url || peer.avatar_url || ''
                },
                call_type: callType
            }, 'Ringing...');
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__startRingtone === 'function') {
                window.CommsWebRTC.__startRingtone('outgoing');
            }
            var mediaReady = media.ensureLocalMedia();
            var r = routes();
            var data = await window.Comms.api(window.Comms.route(r.startCall, conversationId), {
                method: 'POST',
                body: JSON.stringify({ call_type: callType, force_new: !!forceNew }),
                dedupe: false
            });
            ctx.meshCall = data.call;
            if (data.message && window.CommsChat && typeof window.CommsChat.publishSentMessage === 'function') {
                window.CommsChat.publishSentMessage(data.message, ctx.meshCall.invitees || []);
                if (typeof window.CommsChat.appendMessage === 'function') window.CommsChat.appendMessage(data.message);
            }
            if (!ctx.meshCall || !ctx.meshCall.is_group_call) {
                try { await mediaReady; } catch (eMedia) { /* direct call acquires its own media */ }
                await cleanupMesh({ keepOverlay: true });
                if (window.CommsWebRTC.__startDirect) {
                    return window.CommsWebRTC.__startDirect(conversationId, callType, conversation);
                }
                return;
            }
            ctx.meshInvitees = Array.isArray(ctx.meshCall.invitees) ? ctx.meshCall.invitees.slice() : [];
            await mediaReady;
            var self = me();
            var joining = !!(data && data.joined_existing) && !forceNew;
            var iAmHost = Number(ctx.meshCall.caller_id) === Number(self.id)
                && samePortalType(ctx.meshCall.caller_type, self.type);
            var groupPeer = (ctx.meshCall && ctx.meshCall.peer) || {
                name: peer.name || (conversation && conversation.name) || 'Group',
                is_group: true,
                profile_image_url: peer.profile_image_url || peer.avatar_url || ''
            };
            if (joining && !iAmHost) {
                ctx.meshRole = 'callee';
                ctx.meshWantsVideo = (ctx.meshCall.call_type || callType) === 'video' || callType === 'video';
                ctx.meshCameraOn = ctx.meshWantsVideo;
                if (window.CommsWebRTC && typeof window.CommsWebRTC.__markAnswered === 'function') {
                    window.CommsWebRTC.__markAnswered(ctx.meshCall && ctx.meshCall.id);
                } else if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopRingtone === 'function') {
                    window.CommsWebRTC.__stopRingtone();
                }
                ui.showGroupUi(Object.assign({}, ctx.meshCall, { peer: groupPeer }), 'Connected');
                var acceptedJoin = await signaling.updateStatus('accepted');
                if (acceptedJoin && (acceptedJoin.started_at || acceptedJoin.answered_at)) {
                    ctx.meshCall.started_at = acceptedJoin.started_at || acceptedJoin.answered_at;
                    ctx.meshCall.server_time = acceptedJoin.server_time || null;
                    if (window.CommsWebRTC && typeof window.CommsWebRTC.__syncTimer === 'function') {
                        window.CommsWebRTC.__syncTimer(ctx.meshCall.started_at, ctx.meshCall.server_time);
                    }
                }
                await signaling.signal({
                    type: 'group-join',
                    peer_name: self.name,
                    call_type: ctx.meshCall.call_type || callType,
                    started_at: ctx.meshCall.started_at || null,
                    server_time: ctx.meshCall.server_time || null
                });
                await linkKnownParticipants(ctx.meshCall.caller_id, ctx.meshCall.caller_type, 'Host');
                ctx.meshConnected = true;
                ui.setStatus('Connected');
                return;
            }
            if (joining && iAmHost) {
                if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopRingtone === 'function') {
                    window.CommsWebRTC.__stopRingtone();
                }
                ui.showGroupUi(Object.assign({}, ctx.meshCall, { peer: groupPeer }), 'Ringing...');
                return;
            }
            ui.showGroupUi(Object.assign({}, ctx.meshCall, { peer: groupPeer }), 'Ringing...');
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

    async function flushPendingSignals() {
        var queued = (ctx.pendingSignals || []).slice();
        ctx.pendingSignals = [];
        var i;
        for (i = 0; i < queued.length; i += 1) {
            var payload = queued[i];
            try {
                if (payload.type === 'group-offer') await peers.handleGroupOffer(payload);
                else if (payload.type === 'group-answer') await peers.handleGroupAnswer(payload);
                else if (payload.type === 'group-ice') await peers.handleGroupIce(payload);
            } catch (e) { /* a later signal retries the media */ }
        }
    }

    async function acceptGroupInvite(payload) {
        if (ctx.meshCall && Number(ctx.meshCall.id) === Number(payload.call_id)) return;
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopCallTimer === 'function') {
            window.CommsWebRTC.__stopCallTimer();
        }
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__markAnswered === 'function') {
            window.CommsWebRTC.__markAnswered(payload.call_id);
        } else if (window.CommsWebRTC && typeof window.CommsWebRTC.__stopRingtone === 'function') {
            window.CommsWebRTC.__stopRingtone();
        }
        ctx.meshWantsVideo = (payload.call_type || 'voice') === 'video';
        ctx.meshCameraOn = ctx.meshWantsVideo;
        ctx.meshRole = 'callee';
        ctx.meshCall = {
            id: payload.call_id,
            conversation_id: payload.conversation_id,
            call_type: payload.call_type || 'voice',
            caller_id: payload.caller_id,
            caller_type: payload.caller_type,
            is_group_call: true,
            call_max_participants: payload.call_max_participants || 0,
            call_unlimited: !!payload.call_unlimited,
            peer: { name: payload.peer_name || 'Group call', is_group: true },
            invitees: payload.invitees || []
        };
        ctx.meshInvitees = Array.isArray(ctx.meshCall.invitees) ? ctx.meshCall.invitees.slice() : [];
        await media.ensureLocalMedia();
        ui.showGroupUi(ctx.meshCall, 'Connected');
        await flushPendingSignals();
        var accepted = await signaling.updateStatus('accepted');
        if (accepted && (accepted.started_at || accepted.answered_at)) {
            ctx.meshCall.started_at = accepted.started_at || accepted.answered_at;
            ctx.meshCall.server_time = accepted.server_time || null;
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__syncTimer === 'function') {
                window.CommsWebRTC.__syncTimer(ctx.meshCall.started_at, ctx.meshCall.server_time);
            }
        }
        await signaling.signal({
            type: 'group-join',
            peer_name: me().name,
            call_type: ctx.meshCall.call_type,
            started_at: ctx.meshCall.started_at || null,
            server_time: ctx.meshCall.server_time || null
        });
        await linkKnownParticipants(payload.caller_id, payload.caller_type, payload.peer_name || 'Caller');
        ctx.meshConnected = true;
        ui.setStatus('Connected');
    }

    async function leaveGroupCall(reason, opts) {
        opts = opts || {};
        if (ctx.meshLeaving) return;
        if (!ctx.meshCall) {
            await cleanupMesh();
            return;
        }
        ctx.meshLeaving = true;
        var callId = ctx.meshCall.id;
        var convId = ctx.meshCall.conversation_id;
        var isCaller = ctx.meshRole === 'caller';
        var remote = !!opts.remote;

        if (!remote) {
            var endEveryone = reason !== 'rejected';
            signaling.signal({ type: endEveryone ? 'group-end' : 'group-leave', reason: reason || 'ended' });
            var nextStatus = reason === 'cancelled' ? 'cancelled' : (reason === 'missed' ? 'missed' : (reason === 'rejected' ? 'rejected' : 'ended'));
            if (isCaller || endEveryone) signaling.updateStatus(nextStatus);
        }
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__rememberCall === 'function') {
            window.CommsWebRTC.__rememberCall({
                id: callId,
                conversation_id: convId,
                call_type: ctx.meshCall.call_type || (ctx.meshWantsVideo ? 'video' : 'voice'),
                is_group_call: true,
                peer: Object.assign({ is_group: true, name: 'Group call' }, ctx.meshCall.peer || {})
            });
        }
        await cleanupMesh();
        ctx.meshLeaving = false;
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
        return !!(ctx.meshCall || ctx.meshStarting || ctx.meshLocalStream);
    }

    async function prepareRingPreview() {
        return;
    }

    function releaseRingPreview() {
        if (ctx.meshCall) return;
        if (ctx.meshLocalStream) {
            ctx.meshLocalStream.getTracks().forEach(function (track) {
                try { track.stop(); } catch (e) { /* ignore */ }
            });
            ctx.meshLocalStream = null;
        }
        var e = ui.els();
        if (e.localVideo) e.localVideo.srcObject = null;
        if (e.inCall) {
            e.inCall.hidden = true;
            e.inCall.classList.remove('is-group-call', 'is-video-call', 'is-ringing-preview');
        }
    }

    return {
        cleanupMesh: cleanupMesh,
        startGroupCall: startGroupCall,
        acceptGroupInvite: acceptGroupInvite,
        leaveGroupCall: leaveGroupCall,
        isActive: isActive,
        prepareRingPreview: prepareRingPreview,
        releaseRingPreview: releaseRingPreview
    };
}
