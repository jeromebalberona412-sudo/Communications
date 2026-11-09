import { toast } from './GroupCallUtils.js';

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
            Object.keys(ctx.meshPeers).forEach(function (key) {
                var pc = ctx.meshPeers[key].pc;
                if (!pc) return;
                var videoSender = pc.getSenders().find(function (s) {
                    return s && s.track && s.track.kind === 'video';
                }) || pc.getTransceivers().reduce(function (found, t) {
                    if (found) return found;
                    var kind = (t.receiver && t.receiver.track && t.receiver.track.kind)
                        || (t.sender && t.sender.track && t.sender.track.kind);
                    return kind === 'video' ? t.sender : null;
                }, null);
                if (videoSender) {
                    videoSender.replaceTrack(newTrack).catch(function () {});
                } else {
                    pc.addTrack(newTrack, ctx.meshLocalStream);
                }
            });
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

        ctx.meshCameraOn = true;
        syncMeshCameraUi();
        ctx.meshCameraSeq += 1;
        console.debug('[cam] Broadcasting camera ON, seq:', ctx.meshCameraSeq);
        await signaling.signal({ type: 'camera-state', enabled: true, seq: ctx.meshCameraSeq });
    }

    function syncMeshCameraUi() {
        var e = ui.els();
        if (e.localVideo) {
            e.localVideo.hidden = false;
            e.localVideo.classList.toggle('is-camera-off', !ctx.meshCameraOn);
        }
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
