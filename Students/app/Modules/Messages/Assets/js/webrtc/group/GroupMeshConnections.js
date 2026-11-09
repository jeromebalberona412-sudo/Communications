import { participantKey } from './ParticipantManager.js';
import { iceServers } from './GroupPeerManager.js';
import { me } from './GroupCallUtils.js';

export function createGroupMeshConnections(ctx, deps) {
    var ui = deps.ui;
    var signaling = deps.signaling;
    var media = deps.media;

    function shouldOffer(remoteId, remoteType) {
        var self = me();
        if (self.id === Number(remoteId) && self.type === String(remoteType)) return false;
        if (self.id !== Number(remoteId)) return self.id > Number(remoteId);
        return String(self.type) > String(remoteType || '');
    }

    async function createPeerConnection(remoteId, remoteType, remoteName) {
        var key = participantKey(remoteId, remoteType);
        if (ctx.meshPeers[key] && ctx.meshPeers[key].pc) return ctx.meshPeers[key];

        await media.ensureLocalMedia();
        var pc = new RTCPeerConnection(iceServers());
        var entry = {
            pc: pc,
            iceQueue: [],
            id: Number(remoteId),
            type: String(remoteType || ''),
            name: remoteName || 'Participant',
            stream: null
        };
        ctx.meshPeers[key] = entry;

        ctx.meshLocalStream.getTracks().forEach(function (track) {
            pc.addTrack(track, ctx.meshLocalStream);
        });

        pc.onicecandidate = function (ev) {
            if (!ev.candidate) return;
            signaling.signal({
                type: 'group-ice',
                candidate: ev.candidate,
                to_user_id: entry.id,
                to_user_type: entry.type
            }, { id: entry.id, type: entry.type });
        };

        pc.ontrack = function (ev) {
            if (!entry.stream) entry.stream = new MediaStream();
            if (ev.track && !entry.stream.getTracks().some(function (t) { return t.id === ev.track.id; })) {
                entry.stream.addTrack(ev.track);
            }
            if (ev.streams && ev.streams[0]) {
                ev.streams[0].getTracks().forEach(function (t) {
                    if (!entry.stream.getTracks().some(function (x) { return x.id === t.id; })) {
                        entry.stream.addTrack(t);
                    }
                });
            }
            ui.bindPeerStream(key, entry.name, entry.stream);
            ctx.meshConnected = true;
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__startTimer === 'function') {
                window.CommsWebRTC.__startTimer();
            }
            var e = ui.els();
            if (e.timer) e.timer.hidden = false;
            ui.refreshGridLayout();
        };

        pc.onconnectionstatechange = function () {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
                // keep tile until hangup for brief reconnect attempts
            }
        };

        return entry;
    }

    async function connectToPeer(remoteId, remoteType, remoteName) {
        var self = me();
        if (Number(remoteId) === self.id && String(remoteType) === self.type) return;
        var key = participantKey(remoteId, remoteType);
        var max = Number((ctx.meshCall && ctx.meshCall.call_max_participants) || 8);
        if (Object.keys(ctx.meshPeers).length >= Math.max(1, max - 1) && !ctx.meshPeers[key]) {
            deps.toast('Call participant limit reached (' + max + ').', 'error');
            return;
        }

        var entry = await createPeerConnection(remoteId, remoteType, remoteName);
        if (!shouldOffer(remoteId, remoteType)) return;

        var offer = await entry.pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await entry.pc.setLocalDescription(offer);
        await signaling.signal({
            type: 'group-offer',
            sdp: offer,
            to_user_id: entry.id,
            to_user_type: entry.type,
            call_type: ctx.meshCall.call_type,
            peer_name: me().name
        }, { id: entry.id, type: entry.type });
    }

    async function handleGroupOffer(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id || String(payload.to_user_type || '') !== self.type) {
            return;
        }
        var entry = await createPeerConnection(
            payload.from_user_id,
            payload.from_user_type,
            payload.from_name || payload.peer_name || 'Participant'
        );
        await entry.pc.setRemoteDescription(payload.sdp);
        while (entry.iceQueue.length) {
            await entry.pc.addIceCandidate(entry.iceQueue.shift());
        }
        var answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        await signaling.signal({
            type: 'group-answer',
            sdp: answer,
            to_user_id: entry.id,
            to_user_type: entry.type
        }, { id: entry.id, type: entry.type });
        ctx.meshConnected = true;
        ui.setStatus('Connected');
    }

    async function handleGroupAnswer(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id || String(payload.to_user_type || '') !== self.type) {
            return;
        }
        var key = participantKey(payload.from_user_id, payload.from_user_type);
        var entry = ctx.meshPeers[key];
        if (!entry || !entry.pc) return;
        await entry.pc.setRemoteDescription(payload.sdp);
        while (entry.iceQueue.length) {
            await entry.pc.addIceCandidate(entry.iceQueue.shift());
        }
        ctx.meshConnected = true;
        ui.setStatus('Connected');
    }

    async function handleGroupIce(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id || String(payload.to_user_type || '') !== self.type) {
            return;
        }
        if (!payload.candidate) return;
        var key = participantKey(payload.from_user_id, payload.from_user_type);
        var entry = ctx.meshPeers[key];
        if (!entry) {
            entry = await createPeerConnection(payload.from_user_id, payload.from_user_type, payload.from_name || 'Participant');
        }
        if (!entry.pc.remoteDescription) {
            entry.iceQueue.push(payload.candidate);
        } else {
            await entry.pc.addIceCandidate(payload.candidate);
        }
    }

    return {
        createPeerConnection: createPeerConnection,
        connectToPeer: connectToPeer,
        handleGroupOffer: handleGroupOffer,
        handleGroupAnswer: handleGroupAnswer,
        handleGroupIce: handleGroupIce
    };
}
