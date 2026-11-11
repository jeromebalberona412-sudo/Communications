import { participantKey } from './ParticipantManager.js';
import { iceServers } from './GroupPeerManager.js';
import { me, samePortalType } from './GroupCallUtils.js';

export function createGroupMeshConnections(ctx, deps) {
    var ui = deps.ui;
    var signaling = deps.signaling;
    var media = deps.media;

    function aimedAtMe(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id) return false;
        return samePortalType(payload.to_user_type, self.type);
    }

    function plainSdp(sdp, fallbackType) {
        if (!sdp) return null;
        if (typeof sdp === 'string') return { type: fallbackType || 'offer', sdp: sdp };
        return { type: sdp.type || fallbackType || 'offer', sdp: sdp.sdp || '' };
    }

    function plainIce(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') return { candidate: raw };
        return {
            candidate: raw.candidate || '',
            sdpMid: raw.sdpMid == null ? null : raw.sdpMid,
            sdpMLineIndex: raw.sdpMLineIndex == null ? null : raw.sdpMLineIndex,
            usernameFragment: raw.usernameFragment || undefined
        };
    }

    function shouldOffer(remoteId, remoteType) {
        var self = me();
        if (self.id === Number(remoteId) && samePortalType(self.type, remoteType)) return false;
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

        var audioTracks = ctx.meshLocalStream.getAudioTracks();
        var videoTracks = ctx.meshLocalStream.getVideoTracks().filter(function (track) {
            return track && track.readyState === 'live';
        });
        audioTracks.forEach(function (track) {
            pc.addTrack(track, ctx.meshLocalStream);
        });
        if (videoTracks.length) {
            pc.addTrack(videoTracks[0], ctx.meshLocalStream);
        } else if (ctx.meshWantsVideo) {
            pc.addTransceiver('video', { direction: 'sendrecv' });
        }
        pc.getTransceivers().forEach(function (tx) {
            var track = tx.sender && tx.sender.track;
            if (track && track.readyState === 'live') {
                try { tx.direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
            }
        });

        pc.onicecandidate = function (ev) {
            if (!ev.candidate) return;
            signaling.signal({
                type: 'group-ice',
                candidate: plainIce(ev.candidate),
                to_user_id: entry.id,
                to_user_type: entry.type
            }, { id: entry.id, type: entry.type });
        };

        pc.ontrack = function (ev) {
            var track = ev.track;
            if (!track) return;
            var inbound = ev.streams && ev.streams[0] ? ev.streams[0] : null;
            if (inbound && typeof inbound.getTracks === 'function' && inbound.getTracks().length) {
                entry.stream = inbound;
            } else {
                if (!entry.stream) entry.stream = new MediaStream();
                if (!entry.stream.getTracks().some(function (t) { return t.id === track.id; })) {
                    entry.stream.addTrack(track);
                }
            }
            ui.bindPeerStream(key, entry.name, entry.stream);
            ctx.meshConnected = true;
            if (window.CommsWebRTC) {
                if (window.CommsWebRTC.__markAnswered) window.CommsWebRTC.__markAnswered();
                if (typeof window.CommsWebRTC.__startTimer === 'function') {
                    window.CommsWebRTC.__startTimer();
                }
            }
            var e = ui.els();
            if (e.timer) {
                e.timer.hidden = false;
                e.timer.removeAttribute('hidden');
                e.timer.classList.add('is-live');
            }
            ui.refreshGridLayout();
        };

        pc.onconnectionstatechange = function () {
            if (pc.connectionState === 'connected') {
                ctx.meshConnected = true;
                ui.refreshGridLayout();
            }
        };

        return entry;
    }

    async function connectToPeer(remoteId, remoteType, remoteName) {
        var self = me();
        if (Number(remoteId) === self.id && samePortalType(self.type, remoteType)) return;
        var key = participantKey(remoteId, remoteType);
        var unlimited = !!(ctx.meshCall && ctx.meshCall.call_unlimited);
        var max = Number((ctx.meshCall && ctx.meshCall.call_max_participants) || 0);
        if (!unlimited && max > 1 && Object.keys(ctx.meshPeers).length >= Math.max(1, max - 1) && !ctx.meshPeers[key]) {
            deps.toast('Call participant limit reached (' + max + ').', 'error');
            return;
        }

        var entry = await createPeerConnection(remoteId, remoteType, remoteName);
        if (!shouldOffer(remoteId, remoteType)) return;
        if (entry.pc.signalingState !== 'stable') return;

        var offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        await signaling.signal({
            type: 'group-offer',
            sdp: plainSdp(offer, 'offer'),
            to_user_id: entry.id,
            to_user_type: entry.type,
            call_type: ctx.meshCall.call_type,
            peer_name: me().name
        }, { id: entry.id, type: entry.type });
    }

    async function handleGroupOffer(payload) {
        if (!aimedAtMe(payload)) return;
        var desc = plainSdp(payload.sdp, 'offer');
        if (!desc || !desc.sdp) return;
        var entry = await createPeerConnection(
            payload.from_user_id,
            payload.from_user_type,
            payload.from_name || payload.peer_name || 'Participant'
        );
        if (entry.pc.signalingState === 'have-local-offer') {
            try { await entry.pc.setLocalDescription({ type: 'rollback' }); } catch (eRb) { /* ignore */ }
        }
        await entry.pc.setRemoteDescription(new RTCSessionDescription(desc));
        await flushIce(entry);
        entry.pc.getTransceivers().forEach(function (tx) {
            var track = tx.sender && tx.sender.track;
            if (track && track.readyState === 'live') {
                try { tx.direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
            }
        });
        var answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        await signaling.signal({
            type: 'group-answer',
            sdp: plainSdp(answer, 'answer'),
            to_user_id: entry.id,
            to_user_type: entry.type
        }, { id: entry.id, type: entry.type });
        ctx.meshConnected = true;
        ui.setStatus('Connected');
    }

    async function flushIce(entry) {
        var pending = entry.iceQueue.slice();
        entry.iceQueue = [];
        var i;
        for (i = 0; i < pending.length; i += 1) {
            var init = plainIce(pending[i]);
            if (!init || !init.candidate) continue;
            try { await entry.pc.addIceCandidate(new RTCIceCandidate(init)); } catch (e) { /* stale */ }
        }
    }

    async function handleGroupAnswer(payload) {
        if (!aimedAtMe(payload)) return;
        var desc = plainSdp(payload.sdp, 'answer');
        if (!desc || !desc.sdp) return;
        var key = participantKey(payload.from_user_id, payload.from_user_type);
        var entry = ctx.meshPeers[key];
        if (!entry || !entry.pc) return;
        if (entry.pc.signalingState !== 'have-local-offer') {
            entry.pendingAnswer = desc;
            return;
        }
        await entry.pc.setRemoteDescription(new RTCSessionDescription(desc));
        await flushIce(entry);
        ctx.meshConnected = true;
        ui.setStatus('Connected');
    }

    async function handleGroupIce(payload) {
        if (!aimedAtMe(payload)) return;
        if (!payload.candidate) return;
        var key = participantKey(payload.from_user_id, payload.from_user_type);
        var entry = ctx.meshPeers[key];
        if (!entry) {
            entry = await createPeerConnection(payload.from_user_id, payload.from_user_type, payload.from_name || 'Participant');
        }
        var init = plainIce(payload.candidate);
        if (!entry.pc.remoteDescription) {
            entry.iceQueue.push(init);
        } else {
            try { await entry.pc.addIceCandidate(new RTCIceCandidate(init)); } catch (e) { /* ignore */ }
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
