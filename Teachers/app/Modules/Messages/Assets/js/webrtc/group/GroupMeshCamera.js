import { me, toast } from './GroupCallUtils.js';

export function createGroupMeshCamera(ctx, deps) {
    var ui = deps.ui;
    var signaling = deps.signaling;
    var media = deps.media;

    function setCameraEnabled(enabled) {
        ctx.meshCameraPending = !!enabled;
        ctx.meshCameraChain = ctx.meshCameraChain
            .then(function () {
                return applyMeshCameraState(ctx.meshCameraPending);
            })
            .catch(function (err) {
                toast((err && err.message) || 'Unable to toggle camera.', 'error');
            })
            .then(function () {
                if (ctx.meshCameraPending !== null && ctx.meshCameraPending !== ctx.meshCameraOn) {
                    return setCameraEnabled(ctx.meshCameraPending);
                }
                return null;
            });
        return ctx.meshCameraChain;
    }

    async function applyMeshCameraState(enabled) {
        if (!ctx.meshLocalStream) return;
        enabled = !!enabled;

        console.debug('[cam] Apply local camera state:', enabled ? 'ON' : 'OFF');

        var videoTracks = ctx.meshLocalStream.getVideoTracks();
        var live = videoTracks.filter(function (t) { return t.readyState === 'live'; });

        if (!enabled) {
            console.debug('[cam] Disabling camera, setting tracks.enabled = false');
            videoTracks.forEach(function (t) {
                try { t.enabled = false; } catch (eOff) {}
            });
            Object.keys(ctx.meshPeers).forEach(function (key) {
                var pc = ctx.meshPeers[key] && ctx.meshPeers[key].pc;
                if (!pc) return;
                pc.getSenders().forEach(function (sender) {
                    if (sender && sender.track && sender.track.kind === 'video') {
                        try { sender.track.enabled = false; } catch (eEn) {}
                    }
                });
            });
            ctx.meshCameraOn = false;
            if (!ctx.meshCall || ctx.meshCall.call_type !== 'video') {
                ctx.meshWantsVideo = false;
            }
            syncMeshCameraUi();
            ctx.meshCameraSeq += 1;
            console.debug('[cam] Broadcasting camera OFF, seq:', ctx.meshCameraSeq);
            await signaling.signal({ type: 'camera-state', enabled: false, seq: ctx.meshCameraSeq });
            return;
        }

        if (!live.length) {
            var cam = await navigator.mediaDevices.getUserMedia(media.videoOnlyConstraints());
            await media.prepareLocalStream(cam);
            var newTrack = cam.getVideoTracks()[0];
            if (!newTrack) throw new Error('No camera found.');

            videoTracks.forEach(function (t) {
                if (t.readyState === 'ended') {
                    try { ctx.meshLocalStream.removeTrack(t); } catch (e) {}
                    try { t.stop(); } catch (e2) {}
                }
            });
            cam.getVideoTracks().forEach(function (t) {
                if (t !== newTrack) {
                    try { t.stop(); } catch (e3) {}
                }
            });

            ctx.meshLocalStream.addTrack(newTrack);
            var e = ui.els();
            if (e.localVideo) {
                e.localVideo.srcObject = ctx.meshLocalStream;
                try {
                    var lp = e.localVideo.play();
                    if (lp && typeof lp.catch === 'function') lp.catch(function () {});
                } catch (ePlay) { /* ignore */ }
            }
        } else {
            live.forEach(function (t) { t.enabled = true; });
        }

        ctx.meshWantsVideo = true;
        ctx.meshCameraOn = true;
        syncMeshCameraUi();
        await pushVideoToPeers();
        ctx.meshCameraSeq += 1;
        console.debug('[cam] Broadcasting camera ON, seq:', ctx.meshCameraSeq);
        await signaling.signal({ type: 'camera-state', enabled: true, seq: ctx.meshCameraSeq });
    }

    function findVideoSender(pc) {
        var sender = pc.getSenders().find(function (item) {
            return item && item.track && item.track.kind === 'video';
        });
        if (sender) return sender;
        return pc.getTransceivers().reduce(function (found, item) {
            if (found) return found;
            var kind = (item.receiver && item.receiver.track && item.receiver.track.kind)
                || (item.sender && item.sender.track && item.sender.track.kind);
            return kind === 'video' ? item.sender : null;
        }, null);
    }

    async function pushVideoToPeers() {
        if (!ctx.meshLocalStream) return;
        var track = ctx.meshLocalStream.getVideoTracks().find(function (item) {
            return item && item.readyState === 'live' && item.enabled !== false;
        });
        if (!track) return;
        var offerKeys = [];
        var keys = Object.keys(ctx.meshPeers);
        var n;
        for (n = 0; n < keys.length; n += 1) {
            var key = keys[n];
            var entry = ctx.meshPeers[key];
            var pc = entry && entry.pc;
            if (!pc) continue;
            var sender = findVideoSender(pc);
            if (sender) {
                var hadTrack = !!sender.track;
                try { await sender.replaceTrack(track); } catch (eReplace) { /* offer still carries the m-line */ }
                try {
                    var tx = pc.getTransceivers().find(function (item) { return item.sender === sender; });
                    if (tx && (tx.direction === 'inactive' || tx.direction === 'recvonly')) tx.direction = 'sendrecv';
                } catch (eDir) { /* direction is best-effort */ }
                if (!hadTrack) offerKeys.push(key);
                continue;
            }
            try {
                pc.addTrack(track, ctx.meshLocalStream);
                offerKeys.push(key);
            } catch (eAdd) { /* already attached */ }
        }
        var i;
        for (i = 0; i < offerKeys.length; i += 1) {
            await renegotiatePeer(offerKeys[i]);
        }
        if (typeof ui.refreshGridLayout === 'function') ui.refreshGridLayout();
    }

    async function renegotiatePeer(key, attempt) {
        var entry = ctx.meshPeers[key];
        if (!entry || !entry.pc) return;
        if (entry.pc.signalingState !== 'stable') {
            if ((attempt || 0) < 4) {
                await new Promise(function (resolve) { window.setTimeout(resolve, 350); });
                return renegotiatePeer(key, (attempt || 0) + 1);
            }
            return;
        }
        try {
            var offer = await entry.pc.createOffer();
            await entry.pc.setLocalDescription(offer);
            await signaling.signal({
                type: 'group-offer',
                renegotiate: true,
                sdp: { type: offer.type, sdp: offer.sdp },
                to_user_id: entry.id,
                to_user_type: entry.type,
                call_type: 'video',
                peer_name: me().name || ''
            }, { id: entry.id, type: entry.type });
        } catch (eOffer) { /* the next camera toggle retries */ }
    }

    function syncMeshCameraUi() {
        var e = ui.els();
        if (e.localVideo) {
            e.localVideo.hidden = !ctx.meshCameraOn;
            e.localVideo.classList.toggle('is-camera-off', !ctx.meshCameraOn);
        }
        if (typeof ui.refreshGridLayout === 'function') ui.refreshGridLayout();
        var off = document.getElementById('commsLocalVideoOff');
        if (off) {
            off.hidden = !!ctx.meshCameraOn;
        }
        if (e.inCall) {
            e.inCall.classList.toggle('is-local-camera-off', !ctx.meshCameraOn);
        }
    }

    function setMuted(muted) {
        if (!ctx.meshLocalStream) return;
        ctx.meshLocalStream.getAudioTracks().forEach(function (t) { t.enabled = !muted; });
    }

    return {
        setCameraEnabled: setCameraEnabled,
        setMuted: setMuted
    };
}
