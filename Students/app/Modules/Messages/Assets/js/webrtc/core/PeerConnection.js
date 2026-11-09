import { S, api, refreshEls } from './CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function findVideoSender() {
    if (!S.pc) return null;
    if (S.videoSender && S.pc.getSenders().indexOf(S.videoSender) !== -1) {
        return S.videoSender;
    }
    var senders = S.pc.getSenders();
    var i;
    for (i = 0; i < senders.length; i += 1) {
        if (senders[i] && senders[i].track && senders[i].track.kind === 'video') {
            S.videoSender = senders[i];
            return S.videoSender;
        }
    }
    var txs = S.pc.getTransceivers();
    for (i = 0; i < txs.length; i += 1) {
        var t = txs[i];
        var recvKind = t.receiver && t.receiver.track && t.receiver.track.kind;
        var sendKind = t.sender && t.sender.track && t.sender.track.kind;
        if (recvKind === 'video' || sendKind === 'video') {
            S.videoSender = t.sender || null;
            return S.videoSender;
        }
    }
    return S.videoSender;
}

function hasLiveRemoteVideo() {
    var stream = (S.els.remoteVideo && S.els.remoteVideo.srcObject) || S.remoteStream;
    if (!stream || typeof stream.getVideoTracks !== 'function') return false;
    return stream.getVideoTracks().some(function (track) {
        return !!(track && track.readyState === 'live' && track.enabled !== false);
    });
}

function scheduleRemoteVideoUiRefresh() {
    [200, 600, 1200, 2000].forEach(function (ms) {
        setTimeout(function () {
            if (!S.currentCall || !S.pc) return;
            if (S.remoteStream) api.bindRemoteMedia(S.remoteStream);
            api.unlockRemotePlayback();
            api.updateCameraUi();
        }, ms);
    });
}

function showTapToPlay(show) {
    var btn = document.getElementById('commsTapToPlay');
    if (!btn) return;
    btn.hidden = !show;
}

function unlockRemotePlayback() {
    try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx && !S.audioUnlockCtx) S.audioUnlockCtx = new Ctx();
        if (S.audioUnlockCtx && S.audioUnlockCtx.state === 'suspended') {
            S.audioUnlockCtx.resume().catch(function () {});
        }
    } catch (e) { /* ignore */ }
    api.ensureRemoteAudioPlaying();
    if (S.els.remoteVideo) {
        try {
            S.els.remoteVideo.muted = false;
            S.els.remoteVideo.removeAttribute('muted');
            S.els.remoteVideo.playsInline = true;
            var vp = S.els.remoteVideo.play();
            if (vp && typeof vp.then === 'function') {
                vp.then(function () { api.showTapToPlay(false); }).catch(function () { api.showTapToPlay(true); });
            }
        } catch (e2) {
            api.showTapToPlay(true);
        }
    }
}

function ensureRemoteAudioPlaying() {
    if (!S.els.remoteAudio) return;
    try {
        S.els.remoteAudio.muted = false;
        S.els.remoteAudio.removeAttribute('muted');
        S.els.remoteAudio.volume = 1;
        S.els.remoteAudio.autoplay = true;
        var playPromise = S.els.remoteAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function () {});
        }
    } catch (e) { /* ignore */ }
}

function dropRemoteTracksOfKind(kind, exceptId) {
    if (!S.remoteStream || typeof S.remoteStream.getTracks !== 'function') return;
    S.remoteStream.getTracks().forEach(function (existing) {
        if (!existing || existing.kind !== kind) return;
        if (exceptId && existing.id === exceptId) return;
        if (existing._commsUnmuteHandler) {
            existing.removeEventListener('unmute', existing._commsUnmuteHandler);
            delete existing._commsUnmuteHandler;
        }
        if (existing._commsEndedHandler) {
            existing.removeEventListener('ended', existing._commsEndedHandler);
            delete existing._commsEndedHandler;
        }
        try { S.remoteStream.removeTrack(existing); } catch (eRm) { /* ignore */ }
    });
}

function mergeRemoteTrack(track, inboundStream) {
    if (!S.remoteStream) S.remoteStream = new MediaStream();
    if (track && !S.remoteStream.getTracks().some(function (t) { return t.id === track.id; })) {
        api.dropRemoteTracksOfKind(track.kind, track.id);
        S.remoteStream.addTrack(track);

        if (track.kind === 'video' && track.muted !== true && track.readyState === 'live') {
            S.remoteCameraEnabled = true;
        }

        var unmuteHandler = function () {
            if (track.kind === 'video') S.remoteCameraEnabled = true;
            api.bindRemoteMedia(S.remoteStream);
            api.updateCameraUi();
        };
        var endedHandler = function () {
            try { S.remoteStream.removeTrack(track); } catch (err) { /* ignore */ }
            api.refreshRemoteFromReceivers();
        };

        track.addEventListener('unmute', unmuteHandler);
        track.addEventListener('ended', endedHandler);
        track._commsUnmuteHandler = unmuteHandler;
        track._commsEndedHandler = endedHandler;
    }
    if (inboundStream && typeof inboundStream.getTracks === 'function') {
        inboundStream.getTracks().forEach(function (t) {
            if (!t) return;
            if (S.remoteStream.getTracks().some(function (x) { return x.id === t.id; })) return;
            api.dropRemoteTracksOfKind(t.kind, t.id);
            S.remoteStream.addTrack(t);
        });
    }
    return S.remoteStream;
}

function applyRemoteVideoMetrics() {
    if (!S.els.remoteVideo || !S.els.inCall) return;
    var w = Number(S.els.remoteVideo.videoWidth || 0);
    var h = Number(S.els.remoteVideo.videoHeight || 0);
    if (!w || !h) return;
    var portrait = (w / h) < 0.92;
    S.els.remoteVideo.classList.toggle('is-remote-portrait', portrait);
    S.els.remoteVideo.classList.toggle('is-remote-landscape', !portrait);
    S.els.inCall.classList.toggle('is-remote-portrait', portrait);
    S.els.inCall.classList.toggle('is-remote-landscape', !portrait);
}

function refreshRemoteFromReceivers() {
    if (!S.pc) {
        if (S.remoteStream) api.bindRemoteMedia(S.remoteStream);
        return;
    }
    S.pc.getReceivers().forEach(function (recv) {
        if (recv && recv.track && recv.track.readyState !== 'ended') {
            api.mergeRemoteTrack(recv.track, null);
        }
    });
    if (S.remoteStream) api.bindRemoteMedia(S.remoteStream);
}

function bindRemoteMedia(stream) {
    if (!stream) return;
    if (S.els.remoteVideo) {
        S.els.remoteVideo.muted = false;
        S.els.remoteVideo.removeAttribute('muted');
        S.els.remoteVideo.playsInline = true;
        S.els.remoteVideo.autoplay = true;
        S.els.remoteVideo.style.visibility = '';
        S.els.remoteVideo.srcObject = null;
        S.els.remoteVideo.srcObject = stream;
        try {
            var vp = S.els.remoteVideo.play();
            if (vp && typeof vp.catch === 'function') {
                vp.catch(function () { api.showTapToPlay(true); });
            }
        } catch (e) {
            api.showTapToPlay(true);
        }
        if (!S.els.remoteVideo._commsMetricsBound) {
            S.els.remoteVideo._commsMetricsBound = true;
            S.els.remoteVideo.addEventListener('loadedmetadata', applyRemoteVideoMetrics);
            S.els.remoteVideo.addEventListener('resize', applyRemoteVideoMetrics);
        }
        api.applyRemoteVideoMetrics();
    }
    if (S.els.remoteAudio) {
        var audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
        audioTracks.forEach(function (t) {
            try { t.enabled = true; } catch (err) { /* ignore */ }
        });
        S.els.remoteAudio.muted = false;
        S.els.remoteAudio.removeAttribute('muted');
        S.els.remoteAudio.volume = 1;
        S.els.remoteAudio.autoplay = true;
        S.els.remoteAudio.setAttribute('playsinline', '');
        // Reuse the inbound stream when possible so track timing stays natural.
        var nextAudio = audioTracks.length === (stream.getTracks ? stream.getTracks().length : -1)
            ? stream
            : new MediaStream(audioTracks);
        if (S.els.remoteAudio.srcObject !== nextAudio) {
            S.els.remoteAudio.srcObject = nextAudio;
        }
        api.ensureRemoteAudioPlaying();
    }
    api.updateCameraUi();
}

async function ensurePeerConnection(videoEnabled) {
    if (S.pc) {
        api.attachLocalVideo();
        if (videoEnabled && S.localStream && !api.findLiveVideoTrack()) {
            try { await api.applyCameraState(true); } catch (eCam) { /* keep audio call */ }
        }
        return S.pc;
    }

    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC is not supported in this browser.');
    }

    S.wantsVideo = !!videoEnabled;
    S.cameraEnabled = !!videoEnabled;
    S.localStream = await api.getLocalStream(!!videoEnabled);
    
    // FIX BUG #1: Immediately attach local video after acquiring stream
    api.attachLocalVideo();

    S.pc = new RTCPeerConnection(stunConfig());
    S.pc.onicecandidate = function (ev) {
        if (!ev.candidate || !S.currentCall) return;
        api.signalPeer({
            type: 'ice-candidate',
            call_id: S.currentCall.id,
            conversation_id: S.currentCall.conversation_id,
            candidate: ev.candidate
        });
    };
    S.pc.ontrack = function (ev) {
        var merged = api.mergeRemoteTrack(
            ev.track,
            ev.streams && ev.streams[0] ? ev.streams[0] : null
        );
        // Immediately bind remote media to display video on first frame arrival (REVIEW FIX #1)
        api.bindRemoteMedia(merged);
        api.unlockRemotePlayback();
        api.ensureRemoteAudioPlaying();
        if (ev.track && ev.track.kind === 'video') {
            api.updateCameraUi();
            api.scheduleRemoteVideoUiRefresh();
        }
        api.unlockRemotePlayback();
        // FIX BUG #1: Ensure local video stays visible when peer joins
        api.attachLocalVideo();
    };
    S.pc.oniceconnectionstatechange = function () {
        var st = S.pc && S.pc.iceConnectionState;
        if (st === 'connected' || st === 'completed') {
            if (S.iceDisconnectTimer) {
                clearTimeout(S.iceDisconnectTimer);
                S.iceDisconnectTimer = null;
            }
            S.callConnected = true;
            S.lifecycle = 'connected';
            api.clearConnectionTimeout();
            api.keepActiveCallVisible('Connected');
            api.maybeStartConnectedTimer();
            api.refreshRemoteFromReceivers();
            api.attachLocalVideo();
            api.unlockRemotePlayback();
            api.updateCameraUi();
            api.signalMediaState();
        }
        if (st === 'disconnected' || st === 'failed') {
            if (S.iceDisconnectTimer) clearTimeout(S.iceDisconnectTimer);
            S.iceDisconnectTimer = setTimeout(function () {
                S.iceDisconnectTimer = null;
                if (!S.pc || !S.currentCall) return;
                var now = S.pc.iceConnectionState;
                if (now === 'failed') {
                    api.toast('Call connection failed.', 'error');
                    api.endCall();
                }
            }, 8000);
        }
    };
    S.pc.onconnectionstatechange = function () {
        if (S.pc && S.pc.connectionState === 'connected') {
            S.callConnected = true;
            S.lifecycle = 'connected';
            api.clearConnectionTimeout();
            api.keepActiveCallVisible('Connected');
            api.maybeStartConnectedTimer();
            api.refreshRemoteFromReceivers();
            api.attachLocalVideo();
            api.unlockRemotePlayback();
            api.updateCameraUi();
            api.signalMediaState();
        }
        if (S.pc && S.pc.connectionState === 'failed') {
            if (S.iceDisconnectTimer) clearTimeout(S.iceDisconnectTimer);
            S.iceDisconnectTimer = setTimeout(function () {
                S.iceDisconnectTimer = null;
                if (!S.pc || !S.currentCall) return;
                if (S.pc.connectionState === 'failed') {
                    api.toast('Call connection failed.', 'error');
                    api.endCall();
                }
            }, 8000);
        }
    };

    S.videoSender = null;
    S.localStream.getTracks().forEach(function (track) {
        var sender = S.pc.addTrack(track, S.localStream);
        if (track.kind === 'video') S.videoSender = sender;
    });
    if (!S.videoSender) {
        try {
            var videoTx = S.pc.addTransceiver('video', {
                direction: videoEnabled ? 'sendrecv' : 'recvonly'
            });
            S.videoSender = videoTx.sender;
        } catch (eVid) { /* ignore */ }
    }
    var kinds = {};
    S.pc.getTransceivers().forEach(function (t) {
        var kind = (t.receiver && t.receiver.track && t.receiver.track.kind)
            || (t.sender && t.sender.track && t.sender.track.kind);
        if (kind) kinds[kind] = true;
    });
    if (!kinds.audio) {
        try { S.pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e2) { /* ignore */ }
    }
    // FIX BUG #1: Attach local video with all required attributes for immediate preview
    if (S.els.localVideo) {
        S.els.localVideo.srcObject = S.localStream;
        S.els.localVideo.muted = true;
        S.els.localVideo.setAttribute('muted', '');
        S.els.localVideo.playsInline = true;
        S.els.localVideo.autoplay = true;
        S.els.localVideo.hidden = false;
        try {
            var playPromise = S.els.localVideo.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function() {});
            }
        } catch (e) { /* ignore */ }
        api.syncLocalPipLayout();
    }
    if (S.els.muteBtn) api.setMuteUi(false);
    api.updateCameraUi();
    return S.pc;
}

/**
 * Toggle the camera without destroying the call.
 *
 * - Turning the camera off only disables the video track. The track, the
 *   MediaStream, the RTCRtpSender and the peer connection stay alive, so
 *   the microphone and the call are never interrupted.
 * - Turning the camera on re-enables the existing track. When the track
 *   was ended (device removed, permission revoked) a fresh track is
 *   acquired and installed with replaceTrack() instead of reusing the
 *   dead one.
 * - Rapid clicks are serialised: the last requested state always wins and
 *   only one camera stream exists at a time.
 */

api.findVideoSender = findVideoSender;
api.hasLiveRemoteVideo = hasLiveRemoteVideo;
api.scheduleRemoteVideoUiRefresh = scheduleRemoteVideoUiRefresh;
api.showTapToPlay = showTapToPlay;
api.unlockRemotePlayback = unlockRemotePlayback;
api.ensureRemoteAudioPlaying = ensureRemoteAudioPlaying;
api.dropRemoteTracksOfKind = dropRemoteTracksOfKind;
api.mergeRemoteTrack = mergeRemoteTrack;
api.applyRemoteVideoMetrics = applyRemoteVideoMetrics;
api.refreshRemoteFromReceivers = refreshRemoteFromReceivers;
api.bindRemoteMedia = bindRemoteMedia;
api.ensurePeerConnection = ensurePeerConnection;
