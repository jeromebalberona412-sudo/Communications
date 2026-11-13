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

function remoteVideoTrackShowing(track) {
    return !!(track && track.readyState === 'live' && track.enabled !== false);
}

function streamIsOnlyLocal(stream) {
    if (!stream || !S.localStream || typeof stream.getTracks !== 'function') return false;
    var localIds = Object.create(null);
    S.localStream.getTracks().forEach(function (track) {
        if (track) localIds[track.id] = true;
    });
    var tracks = stream.getTracks();
    return tracks.length > 0 && tracks.every(function (track) { return !!(track && localIds[track.id]); });
}

function hasLiveRemoteVideo() {
    if (S.remoteCameraSeq > 0 && S.remoteCameraEnabled === false) return false;
    var streams = [S.remoteDisplayStream, S.remoteStream, S.els.remoteVideo && S.els.remoteVideo.srcObject];
    var i;
    var live = false;
    for (i = 0; i < streams.length; i += 1) {
        var stream = streams[i];
        if (!stream || typeof stream.getVideoTracks !== 'function') continue;
        if (streamIsOnlyLocal(stream)) continue;
        if (stream.getVideoTracks().some(remoteVideoTrackShowing)) live = true;
    }
    if (!live) return false;
    if (S.els.remoteVideo && Number(S.els.remoteVideo.videoWidth || 0) > 0) return true;
    if (S.remoteHasFrames) return true;
    return false;
}

function transceiverKind(transceiver) {
    if (!transceiver) return '';
    var receiverKind = transceiver.receiver && transceiver.receiver.track && transceiver.receiver.track.kind;
    if (receiverKind) return receiverKind;
    var senderKind = transceiver.sender && transceiver.sender.track && transceiver.sender.track.kind;
    return senderKind || '';
}

function findKindTransceiver(kind) {
    if (!S.pc) return null;
    var txs = S.pc.getTransceivers();
    var i;
    for (i = 0; i < txs.length; i += 1) {
        if (transceiverKind(txs[i]) === kind) return txs[i];
    }
    return null;
}

function plainDescription(desc, fallbackType) {
    if (!desc) return null;
    if (typeof desc === 'string') return { type: fallbackType || 'offer', sdp: desc };
    return {
        type: desc.type || fallbackType || 'offer',
        sdp: desc.sdp || ''
    };
}

/**
 * Put local tracks on transceivers that match the negotiated m-lines.
 * Audio is installed before video so both sides share the same order.
 * When the remote offer is already applied, replaceTrack is used so the
 * answer sends video instead of leaving the m-line recvonly.
 */
async function installLocalSenders(videoEnabled) {
    if (!S.pc || !S.localStream) return;
    var audioTracks = S.localStream.getAudioTracks();
    var videoTracks = S.localStream.getVideoTracks().filter(function (track) {
        return track && track.readyState === 'live';
    });
    var wantVideo = !!videoEnabled && videoTracks.length > 0;

    async function place(track) {
        if (!track) return;
        var tx = findKindTransceiver(track.kind);
        if (tx && tx.sender) {
            if (tx.sender.track !== track) {
                try { await tx.sender.replaceTrack(track); } catch (eRep) { /* ignore */ }
            }
            try { tx.direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
            if (track.kind === 'video') S.videoSender = tx.sender;
            return;
        }
        try {
            var sender = S.pc.addTrack(track, S.localStream);
            if (track.kind === 'video') S.videoSender = sender;
        } catch (eAdd) { /* sender already exists */ }
    }

    var a;
    for (a = 0; a < audioTracks.length; a += 1) {
        try { audioTracks[a].enabled = true; } catch (eEn) { /* ignore */ }
        await place(audioTracks[a]);
    }
    if (wantVideo) {
        await place(videoTracks[0]);
        videoTracks.slice(1).forEach(function (extra) {
            try { extra.enabled = false; } catch (eExtra) { /* ignore */ }
        });
    }

    if (!findKindTransceiver('audio')) {
        try { S.pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (eAudio) { /* ignore */ }
    }
    if (videoEnabled && !findKindTransceiver('video')) {
        try {
            var videoTx = wantVideo
                ? S.pc.addTransceiver(videoTracks[0], { direction: 'sendrecv', streams: [S.localStream] })
                : S.pc.addTransceiver('video', { direction: 'sendrecv' });
            if (videoTx && videoTx.sender) S.videoSender = videoTx.sender;
        } catch (eVideo) { /* ignore */ }
    }

    S.pc.getTransceivers().forEach(function (tx) {
        var kind = transceiverKind(tx);
        if (kind === 'audio' && audioTracks.length) {
            try { tx.direction = 'sendrecv'; } catch (eA) { /* ignore */ }
        }
        if (kind === 'video' && wantVideo) {
            try { tx.direction = 'sendrecv'; } catch (eV) { /* ignore */ }
            if (tx.sender) S.videoSender = tx.sender;
        }
    });
}

async function applyRemoteOfferIfReady() {
    if (!S.pc || S.role === 'caller') return false;
    if (!S.currentCall || !S.currentCall._remoteOffer) return false;
    if (S.pc.currentRemoteDescription) return true;
    if (S.pc.signalingState !== 'stable') return false;
    var offer = plainDescription(S.currentCall._remoteOffer, 'offer');
    if (!offer || !offer.sdp) return false;
    await S.pc.setRemoteDescription(new RTCSessionDescription(offer));
    return true;
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

function showTapToPlay() {
    // Manual "tap to play / open camera" is not part of the call UI.
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
            // Remote audio plays on the audio element. The video element stays
            // muted so autoplay can paint the other participant's camera.
            S.els.remoteVideo.muted = true;
            S.els.remoteVideo.setAttribute('muted', '');
            S.els.remoteVideo.playsInline = true;
            S.els.remoteVideo.setAttribute('playsinline', '');
            var vp = S.els.remoteVideo.play();
            if (vp && typeof vp.catch === 'function') vp.catch(function () {});
        } catch (e2) { /* autoplay retry is handled by the next track event */ }
    }
}

function ensureRemoteAudioPlaying() {
    if (!S.els.remoteAudio) S.els.remoteAudio = document.getElementById('commsRemoteAudio');
    if (!S.els.remoteAudio) return;
    try {
        if ((!S.els.remoteAudio.srcObject || !S.els.remoteAudio.srcObject.getAudioTracks().length)
            && S.remoteStream && S.remoteStream.getAudioTracks().length) {
            S.els.remoteAudio.srcObject = new MediaStream(S.remoteStream.getAudioTracks());
        }
        S.els.remoteAudio.muted = false;
        S.els.remoteAudio.removeAttribute('muted');
        S.els.remoteAudio.volume = 1;
        S.els.remoteAudio.autoplay = true;
        var playPromise = S.els.remoteAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function () {
                window.setTimeout(function () {
                    if (!S.els.remoteAudio) return;
                    var retry = S.els.remoteAudio.play();
                    if (retry && typeof retry.catch === 'function') retry.catch(function () {});
                }, 300);
            });
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
        if (existing._commsMuteHandler) {
            existing.removeEventListener('mute', existing._commsMuteHandler);
            delete existing._commsMuteHandler;
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

        if (track.kind === 'video' && track.muted !== true && track.readyState === 'live'
            && S.remoteCameraSeq === 0) {
            S.remoteCameraEnabled = true;
        }

        var unmuteHandler = function () {
            if (track.kind === 'video' && S.remoteCameraSeq === 0) {
                S.remoteCameraEnabled = true;
            }
            api.bindRemoteMedia(S.remoteStream);
            api.updateCameraUi();
        };
        var endedHandler = function () {
            try { S.remoteStream.removeTrack(track); } catch (err) { /* ignore */ }
            api.refreshRemoteFromReceivers();
        };

        var muteHandler = function () {
            api.updateCameraUi();
        };
        track.addEventListener('unmute', unmuteHandler);
        track.addEventListener('mute', muteHandler);
        track.addEventListener('ended', endedHandler);
        track._commsUnmuteHandler = unmuteHandler;
        track._commsMuteHandler = muteHandler;
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
    var hasFrames = w > 0 && h > 0;
    if (hasFrames !== !!S.remoteHasFrames) {
        S.remoteHasFrames = hasFrames;
        if (typeof api.updateCameraUi === 'function') api.updateCameraUi();
    }
    if (!w || !h) return;
    var portrait = (w / h) < 0.92;
    S.els.remoteVideo.classList.toggle('is-remote-portrait', portrait);
    S.els.remoteVideo.classList.toggle('is-remote-landscape', !portrait);
    S.els.inCall.classList.toggle('is-remote-portrait', portrait);
    S.els.inCall.classList.toggle('is-remote-landscape', !portrait);
    api.updateCameraUi();
}

function refreshRemoteFromReceivers() {
    if (!S.pc) {
        if (S.remoteStream) api.bindRemoteMedia(S.remoteStream);
        return;
    }
    S.pc.getReceivers().forEach(function (recv) {
        if (!recv || !recv.track || recv.track.readyState === 'ended') return;
        if (S.localStream && S.localStream.getTracks().some(function (local) {
            return local && local.id === recv.track.id;
        })) return;
        rememberRemoteVideoTrack(recv.track, null);
        api.mergeRemoteTrack(recv.track, null);
    });
    if (S.remotePlaybackStream || S.remoteDisplayStream || S.remoteStream) {
        api.bindRemoteMedia(S.remoteStream);
    }
}

function ensureOutboundVideo() {
    if (!S.pc) return;
    S.pc.getTransceivers().forEach(function (tx) {
        var track = tx.sender && tx.sender.track;
        if (!track || track.readyState !== 'live') return;
        try { tx.direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
        if (track.kind === 'video') S.videoSender = tx.sender;
    });
}

function remoteVideoSignature(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return '';
    return stream.getVideoTracks().map(function (track) {
        if (!track || track.readyState === 'ended') return '';
        return track.id + ':' + track.readyState;
    }).filter(Boolean).join('|');
}

function isLocalMedia(stream) {
    if (!stream || !S.localStream) return false;
    if (stream === S.localStream) return true;
    if (typeof stream.getTracks !== 'function' || typeof S.localStream.getTracks !== 'function') return false;
    var localIds = {};
    S.localStream.getTracks().forEach(function (track) {
        if (track) localIds[track.id] = true;
    });
    var tracks = stream.getTracks();
    return tracks.length > 0 && tracks.every(function (track) { return !!(track && localIds[track.id]); });
}

function liveVideoTracks(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return [];
    return stream.getVideoTracks().filter(function (track) {
        return track && track.readyState !== 'ended';
    });
}

function rememberRemoteVideoTrack(track, inbound) {
    if (!track || track.kind !== 'video') return;
    if (S.localStream && S.localStream.getTracks().some(function (local) { return local && local.id === track.id; })) return;
    if (!S.remotePlaybackStream) S.remotePlaybackStream = new MediaStream();
    if (!S.remotePlaybackStream.getTrackById(track.id)) {
        S.remotePlaybackStream.addTrack(track);
    }
    if (inbound && !isLocalMedia(inbound) && liveVideoTracks(inbound).length) {
        S.remoteDisplayStream = inbound;
    }
}

function bindRemoteMedia(stream) {
    if (!stream && !S.remoteDisplayStream && !S.remotePlaybackStream) return;
    var videoEl = document.getElementById('commsRemoteVideo');
    if (videoEl) S.els.remoteVideo = videoEl;
    var display = (S.remoteDisplayStream && !isLocalMedia(S.remoteDisplayStream) && liveVideoTracks(S.remoteDisplayStream).length)
        ? S.remoteDisplayStream
        : null;
    var playback = (S.remotePlaybackStream && liveVideoTracks(S.remotePlaybackStream).length)
        ? S.remotePlaybackStream
        : null;
    var fallback = (stream && !isLocalMedia(stream) && liveVideoTracks(stream).length) ? stream : null;
    var videoSource = display || playback || fallback;
    if (S.els.remoteVideo && videoSource) {
        var videoTracks = liveVideoTracks(videoSource);
        var sig = remoteVideoSignature(videoSource);
        // Mute only this element so autoplay can paint the picture.
        // Remote speech stays on the separate audio element.
        S.els.remoteVideo.muted = true;
        S.els.remoteVideo.defaultMuted = true;
        S.els.remoteVideo.setAttribute('muted', '');
        S.els.remoteVideo.playsInline = true;
        S.els.remoteVideo.setAttribute('playsinline', '');
        S.els.remoteVideo.autoplay = true;
        S.els.remoteVideo.hidden = false;
        S.els.remoteVideo.removeAttribute('hidden');
        S.els.remoteVideo.style.setProperty('display', 'block', 'important');
        S.els.remoteVideo.style.setProperty('visibility', 'visible', 'important');
        S.els.remoteVideo.style.setProperty('opacity', '1', 'important');
        if (S.els.remoteVideoOff) S.els.remoteVideoOff.hidden = true;
        if (S.els.inCall) {
            S.els.inCall.classList.add('is-video-call', 'has-remote-video');
            S.els.inCall.classList.remove('is-audio-call', 'is-remote-camera-off');
        }
        var current = S.els.remoteVideo.srcObject;
        var currentHasTrack = current && typeof current.getVideoTracks === 'function'
            && current.getVideoTracks().some(function (track) {
                return track && videoTracks.some(function (kept) { return kept.id === track.id; });
            });
        if (videoTracks.length && (!currentHasTrack || S._remoteVideoSig !== sig)) {
            S._remoteVideoSig = sig;
            var sameIds = videoSource.getVideoTracks().every(function (track) {
                return videoTracks.some(function (kept) { return kept.id === track.id; });
            });
            S.els.remoteVideo.srcObject = sameIds ? videoSource : new MediaStream(videoTracks);
        }
        try {
            var vp = S.els.remoteVideo.play();
            if (vp && typeof vp.catch === 'function') vp.catch(function () {});
        } catch (e) { /* the next frame event retries playback */ }
        if (!S.els.remoteVideo._commsMetricsBound) {
            S.els.remoteVideo._commsMetricsBound = true;
            S.els.remoteVideo.addEventListener('loadedmetadata', applyRemoteVideoMetrics);
            S.els.remoteVideo.addEventListener('resize', applyRemoteVideoMetrics);
        }
        api.applyRemoteVideoMetrics();
    }
    var audioSource = (stream && typeof stream.getAudioTracks === 'function' && stream.getAudioTracks().length)
        ? stream
        : S.remoteStream;
    if (S.els.remoteAudio && audioSource && typeof audioSource.getAudioTracks === 'function' && audioSource.getAudioTracks().length) {
        var audioTracks = audioSource.getAudioTracks();
        audioTracks.forEach(function (t) {
            try { t.enabled = true; } catch (err) { /* ignore */ }
        });
        S.els.remoteAudio.muted = false;
        S.els.remoteAudio.removeAttribute('muted');
        S.els.remoteAudio.volume = 1;
        S.els.remoteAudio.autoplay = true;
        S.els.remoteAudio.setAttribute('playsinline', '');
        // Reuse the inbound stream when possible so track timing stays natural.
        var nextAudio = audioTracks.length === (audioSource.getTracks ? audioSource.getTracks().length : -1)
            ? audioSource
            : new MediaStream(audioTracks);
        if (S.els.remoteAudio.srcObject !== nextAudio) {
            S.els.remoteAudio.srcObject = nextAudio;
        }
        api.ensureRemoteAudioPlaying();
    }
    api.updateCameraUi();
}

function localPreviewUsable(videoEnabled) {
    if (!S.localStream || typeof S.localStream.getTracks !== 'function') return false;
    var tracks = S.localStream.getTracks();
    if (!tracks.length) return false;
    if (tracks.some(function (track) { return !track || track.readyState === 'ended'; })) return false;
    var audio = S.localStream.getAudioTracks().filter(function (track) {
        return track && track.readyState !== 'ended';
    });
    if (!audio.length) return false;
    if (videoEnabled && typeof api.findLiveVideoTrack === 'function' && !api.findLiveVideoTrack()) return false;
    return true;
}

function prepareLocalPreview(videoEnabled) {
    if (S._previewJob) return S._previewJob;
    S.wantsVideo = !!videoEnabled;
    if (localPreviewUsable(!!videoEnabled)) {
        if (S.localStream) {
            S.localStream.getVideoTracks().forEach(function (track) {
                if (!track || track.readyState !== 'live') return;
                try { track.enabled = !!videoEnabled; } catch (eOff) { /* ignore */ }
            });
        }
        S.cameraEnabled = !!videoEnabled && !!(typeof api.findLiveVideoTrack === 'function' && api.findLiveVideoTrack());
        api.remountCallEls();
        api.attachLocalVideo();
        if (typeof api.syncCameraUi === 'function') api.syncCameraUi();
        return Promise.resolve(S.localStream);
    }
    var generation = S.previewGeneration || 0;
    var job = api.getLocalStream(!!videoEnabled).then(function (stream) {
        if (!stream) return null;
        if (generation !== (S.previewGeneration || 0)) {
            stream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) { /* ignore */ } });
            return null;
        }
        if (S.localStream && S.localStream !== stream) {
            S.localStream.getTracks().forEach(function (track) { try { track.stop(); } catch (e2) { /* ignore */ } });
        }
        S.localStream = stream;
        if (!videoEnabled) {
            stream.getVideoTracks().forEach(function (track) {
                try { track.enabled = false; } catch (eOff) { /* ignore */ }
            });
        }
        S.cameraEnabled = !!videoEnabled && !!(typeof api.findLiveVideoTrack === 'function' && api.findLiveVideoTrack());
        api.remountCallEls();
        api.attachLocalVideo();
        if (typeof api.updateCameraUi === 'function') api.updateCameraUi();
        return stream;
    });
    S._previewJob = job;
    job.then(function () {
        if (S._previewJob === job) S._previewJob = null;
    }, function () {
        if (S._previewJob === job) S._previewJob = null;
    });
    return job;
}

async function ensurePeerConnection(videoEnabled) {
    if (S.pc) {
        api.attachLocalVideo();
        try { await api.applyRemoteOfferIfReady(); } catch (eOffer) { /* answer path retries */ }
        await api.installLocalSenders(!!videoEnabled || !!S.cameraEnabled);
        if ((videoEnabled || S.cameraEnabled) && S.localStream && !api.findLiveVideoTrack()) {
            try { await api.applyCameraState(true); } catch (eCam) { /* keep audio call */ }
        }
        return S.pc;
    }

    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC is not supported in this browser.');
    }

    S.wantsVideo = !!videoEnabled;
    await api.prepareLocalPreview(!!videoEnabled);
    if (!S.localStream) {
        throw new Error('Camera/microphone is not available.');
    }
    S.cameraEnabled = !!videoEnabled && !!(typeof api.findLiveVideoTrack === 'function' && api.findLiveVideoTrack());
    api.attachLocalVideo();

    S.pc = new RTCPeerConnection(stunConfig());
    S.iceRestarted = false;
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
        var track = ev.track;
        if (!track) return;
        if (S.localStream && S.localStream.getTracks().some(function (local) {
            return local && local.id === track.id;
        })) return;
        var inbound = ev.streams && ev.streams[0] && !isLocalMedia(ev.streams[0]) ? ev.streams[0] : null;
        rememberRemoteVideoTrack(track, inbound);
        var merged = api.mergeRemoteTrack(track, inbound);
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
            if (st === 'failed') api.recoverIce();
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
            api.recoverIce();
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
    try { await api.applyRemoteOfferIfReady(); } catch (eOffer) { /* answer path retries */ }
    await api.installLocalSenders(!!videoEnabled || !!S.cameraEnabled);
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

function recoverIce() {
    if (!S.pc || !S.currentCall || S.iceRestarted) return Promise.resolve(false);
    if (S.role !== 'caller') {
        S.iceRestarted = true;
        return api.signalPeer({
            type: 'ice-restart',
            call_id: S.currentCall.id,
            conversation_id: S.currentCall.conversation_id
        }).catch(function () {
            S.iceRestarted = false;
            return false;
        });
    }
    if (S.pc.signalingState !== 'stable') return Promise.resolve(false);
    S.iceRestarted = true;
    return S.pc.createOffer({ iceRestart: true }).then(function (offer) {
        return S.pc.setLocalDescription(offer).then(function () {
            return api.signalPeer({
                type: 'offer',
                renegotiate: true,
                call_id: S.currentCall.id,
                conversation_id: S.currentCall.conversation_id,
                sdp: offer
            });
        });
    }).catch(function () {
        S.iceRestarted = false;
        return false;
    });
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
api.installLocalSenders = installLocalSenders;
api.ensureOutboundVideo = ensureOutboundVideo;
api.applyRemoteOfferIfReady = applyRemoteOfferIfReady;
api.plainDescription = plainDescription;
api.scheduleRemoteVideoUiRefresh = scheduleRemoteVideoUiRefresh;
api.showTapToPlay = showTapToPlay;
api.prepareLocalPreview = prepareLocalPreview;
api.unlockRemotePlayback = unlockRemotePlayback;
api.ensureRemoteAudioPlaying = ensureRemoteAudioPlaying;
api.dropRemoteTracksOfKind = dropRemoteTracksOfKind;
api.mergeRemoteTrack = mergeRemoteTrack;
api.applyRemoteVideoMetrics = applyRemoteVideoMetrics;
api.refreshRemoteFromReceivers = refreshRemoteFromReceivers;
api.bindRemoteMedia = bindRemoteMedia;
api.ensurePeerConnection = ensurePeerConnection;
api.recoverIce = recoverIce;
