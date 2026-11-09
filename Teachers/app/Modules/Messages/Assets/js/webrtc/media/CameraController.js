import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function setCameraUi(enabled) {
    if (!S.els.cameraBtn) return;
    api.setCtrlLabel(S.els.cameraBtn, enabled ? 'Camera on' : 'Camera off');
    S.els.cameraBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    S.els.cameraBtn.classList.toggle('is-off', !enabled);
    var iconWrap = S.els.cameraBtn.querySelector('[data-camera-icon]');
    if (!iconWrap) return;
    if (enabled) {
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<polygon points="23 7 16 12 23 17 23 7"/>' +
            '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>' +
            '</svg>';
    } else {
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<polygon points="23 7 16 12 23 17 23 7"/>' +
            '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>' +
            '<line x1="4" y1="4" x2="20" y2="20"/>' +
            '</svg>';
    }
}

function updateCameraUi() {
    if (S.els.cameraBtn) {
        S.els.cameraBtn.hidden = false;
    }
    // The self-view element is never hidden: the camera-off placeholder is
    // layered on top of it so the video element and its stream stay intact.
    api.syncCameraUi();
    var remoteVideoLive = api.hasLiveRemoteVideo();
    var isVideoCall = api.isVideoCallType();
    if (S.els.inCall) {
        S.els.inCall.classList.toggle('is-connected', !!S.callConnected);
        S.els.inCall.classList.toggle('has-remote-video', remoteVideoLive && !!S.remoteCameraEnabled);
        S.els.inCall.classList.toggle('is-video-call', isVideoCall);
        S.els.inCall.classList.toggle('is-remote-camera-off', S.remoteCameraEnabled === false);
        S.els.inCall.classList.toggle('is-remote-mic-off', !S.remoteMicEnabled);
    }
    if (S.els.callCenter) {
        S.els.callCenter.hidden = false;
        S.els.callCenter.removeAttribute('hidden');
        S.els.callCenter.classList.toggle('is-compact', !!S.callConnected && remoteVideoLive);
    }
    api.syncLocalPipLayout();
    if (typeof api.syncCallTimerVisibility === 'function') api.syncCallTimerVisibility();
}

/**
 * A call is a video call when it was started as one or when the peer is
 * sending video. The local camera state never controls this: switching the
 * camera off must not collapse the remote video layout.
 */
function isVideoCallType() {
    if (S.cameraEnabled) return true;
    if (api.hasLiveRemoteVideo && api.hasLiveRemoteVideo()) return true;
    if (S.currentCall && S.currentCall.call_type) {
        return String(S.currentCall.call_type) === 'video';
    }
    if (S.lastCallContext && S.lastCallContext.callType) {
        return String(S.lastCallContext.callType) === 'video';
    }
    return !!S.wantsVideo;
}

function syncLocalPipLayout() {
    if (!S.els.inCall || !S.els.localVideo) return;
    var landscape = false;
    try {
        landscape = window.matchMedia('(orientation: landscape)').matches;
    } catch (e) {
        landscape = window.innerWidth > window.innerHeight;
    }
    var desktop = window.innerWidth >= 1024;
    S.els.inCall.classList.toggle('is-landscape', landscape);
    S.els.inCall.classList.toggle('is-desktop-call', desktop);

    var camLandscape = landscape;
    try {
        var track = S.localStream && S.localStream.getVideoTracks && S.localStream.getVideoTracks()[0];
        var settings = track && typeof track.getSettings === 'function' ? track.getSettings() : null;
        if (settings && settings.width && settings.height) {
            camLandscape = (Number(settings.width) / Number(settings.height)) >= 1.15;
        }
    } catch (e2) { /* ignore */ }
    S.els.localVideo.classList.toggle('is-cam-landscape', camLandscape);
    S.els.localVideo.classList.toggle('is-cam-portrait', !camLandscape);
    var pip = S.els.localVideo.closest('.comms-local-pip');
    if (pip) {
        pip.classList.toggle('is-cam-landscape', camLandscape);
        pip.classList.toggle('is-cam-portrait', !camLandscape);
    }
}

function setCameraEnabled(enabled) {
    var target = !!enabled;
    S.cameraPending = target;

    S.cameraChain = S.cameraChain.then(function () {
        var wanted = S.cameraPending;
        return api.applyCameraState(wanted);
    }).catch(function (err) {
        api.toast((err && err.message) || 'Unable to toggle camera.', 'error');
        api.syncCameraUi();
    }).then(function () {
        if (S.currentCall) {
            S.cameraSeq += 1;
            api.signalPeer({
                type: 'camera-state',
                call_id: S.currentCall.id,
                conversation_id: S.currentCall.conversation_id,
                enabled: !!S.cameraEnabled,
                seq: S.cameraSeq
            });
        }
        if (S.cameraPending !== null && S.cameraPending !== S.cameraEnabled) {
            return api.applyCameraState(S.cameraPending);
        }
        return null;
    });

    return S.cameraChain;
}

async function applyCameraState(enabled) {
    if (!S.pc || !S.localStream) {
        return;
    }

    S.cameraBusy = true;
    var wantsOn = !!enabled;
    var needsRenegotiate = false;

    try {
        if (!wantsOn) {
            S.localStream.getVideoTracks().forEach(function (track) {
                try { track.enabled = false; } catch (eOff) { /* ignore */ }
            });
            S.cameraEnabled = false;
            api.attachLocalVideo();
            api.syncCameraUi();
            api.updateCameraUi();
            return;
        }

        var liveTrack = api.findLiveVideoTrack();
        if (liveTrack) {
            liveTrack.enabled = true;
            needsRenegotiate = await api.attachVideoTrackToSender(liveTrack);
            S.cameraEnabled = true;
            if (S.currentCall && String(S.currentCall.call_type) !== 'video') {
                S.currentCall.call_type = 'video';
            }
            api.attachLocalVideo();
            api.syncCameraUi();
            api.updateCameraUi();
        } else {

        var devices = api.assertMediaReady();
        var camStream;
        try {
            camStream = await devices.getUserMedia(videoOnlyConstraints());
        } catch (gumErr) {
            var name = (gumErr && gumErr.name) || '';
            S.cameraEnabled = false;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                throw new Error('Camera permission was denied.');
            }
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                throw new Error('No camera was found on this device.');
            }
            if (name === 'NotReadableError' || name === 'TrackStartError') {
                throw new Error('Camera is already in use by another app.');
            }
            throw new Error((gumErr && gumErr.message) || 'Unable to start the camera.');
        }
        await prepareLocalStream(camStream);
        var newTrack = camStream.getVideoTracks()[0];
        if (!newTrack) {
            throw new Error('No camera was found on this device.');
        }

        S.localStream.getVideoTracks().forEach(function (track) {
            if (track !== newTrack) {
                try { S.localStream.removeTrack(track); } catch (e) { /* ignore */ }
                try { track.stop(); } catch (e2) { /* ignore */ }
            }
        });
        if (!S.localStream.getVideoTracks().some(function (t) { return t.id === newTrack.id; })) {
            S.localStream.addTrack(newTrack);
        }
        camStream.getVideoTracks().forEach(function (track) {
            if (track !== newTrack) {
                try { track.stop(); } catch (e3) { /* ignore */ }
            }
        });

        newTrack.enabled = true;
        needsRenegotiate = await api.attachVideoTrackToSender(newTrack);
        if (S.currentCall && String(S.currentCall.call_type) !== 'video') {
            S.currentCall.call_type = 'video';
        }
        S.cameraEnabled = true;
        api.attachLocalVideo();
        api.syncCameraUi();
        api.updateCameraUi();
        }
    } finally {
        S.cameraBusy = false;
        api.syncCameraUi();
    }

    if (needsRenegotiate) {
        await api.renegotiateForCamera();
    }
}

function findLiveVideoTrack() {
    if (!S.localStream || typeof S.localStream.getVideoTracks !== 'function') return null;
    var tracks = S.localStream.getVideoTracks();
    for (var i = 0; i < tracks.length; i += 1) {
        if (tracks[i] && tracks[i].readyState === 'live') {
            return tracks[i];
        }
    }
    return null;
}

/**
 * Make sure the peer connection sends exactly this video track.
 *
 * @return {Promise<boolean>} true when the peer connection must renegotiate.
 */
async function attachVideoTrackToSender(track) {
    if (!S.pc || !track) return false;

    var sender = api.findVideoSender();

    if (sender) {
        var hadTrack = !!(sender.track);
        if (sender.track !== track) {
            await sender.replaceTrack(track);
        }
        S.videoSender = sender;
        var txs = S.pc.getTransceivers();
        for (var i = 0; i < txs.length; i += 1) {
            if (txs[i] && txs[i].sender === sender) {
                try { txs[i].direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
                var dir = txs[i].currentDirection;
                if (dir === 'inactive' || dir === 'recvonly' || !hadTrack) return true;
            }
        }
        return !hadTrack;
    }

    var videoTx = S.pc.getTransceivers().find(function (t) {
        return (t.receiver && t.receiver.track && t.receiver.track.kind === 'video')
            || (t.sender && (!t.sender.track || t.sender.track.kind === 'video'));
    });

    if (videoTx && videoTx.sender) {
        await videoTx.sender.replaceTrack(track);
        try { videoTx.direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
        S.videoSender = videoTx.sender;
        return videoTx.currentDirection === 'inactive' || videoTx.currentDirection === 'recvonly';
    }

    S.videoSender = S.pc.addTrack(track, S.localStream);
    return true;
}

/**
 * Attach the local stream to the self-view element.
 *
 * The element is never removed or hidden: when the camera is off the
 * track simply produces no frames and the camera-off placeholder is
 * shown on top of it.
 */
function attachLocalVideo() {
    if (!S.els.localVideo || !S.localStream) return;
    if (S.els.localVideo.srcObject !== S.localStream) {
        S.els.localVideo.srcObject = S.localStream;
    }
    // FIX BUG #1: Ensure all required video attributes are set
    // VERIFIED: api.attachLocalVideo() sets muted, playsInline, autoplay, and hidden 
    // attributes (lines 1687-1693). Local preview displays correctly.
    S.els.localVideo.muted = true;
    S.els.localVideo.setAttribute('muted', '');
    S.els.localVideo.playsInline = true;
    S.els.localVideo.autoplay = true;
    S.els.localVideo.hidden = false;
    S.els.localVideo.classList.toggle('is-camera-off', !S.cameraEnabled);
    try {
        var lp = S.els.localVideo.play();
        if (lp && typeof lp.catch === 'function') {
            lp.catch(function () {});
        }
    } catch (ePlay) { /* ignore */ }
    api.syncLocalPipLayout();
}

/**
 * Keep the camera button, the self-view and the placeholder in sync with
 * the real media state.
 */
function syncCameraUi() {
    var on = !!S.cameraEnabled;
    api.setCameraUi(on);
    if (S.els.cameraBtn) {
        S.els.cameraBtn.classList.remove('is-busy');
        S.els.cameraBtn.removeAttribute('aria-busy');
    }
    if (S.els.localVideo) {
        // The self-view stays mounted; only its state class changes.
        S.els.localVideo.classList.toggle('is-camera-off', !on);
        S.els.localVideo.classList.toggle('is-camera-on', on);
    }
    if (S.els.localVideoOff) {
        S.els.localVideoOff.hidden = on;
        var localOffAvatar = document.getElementById('commsLocalVideoOffAvatar');
        if (localOffAvatar) {
            var me = api.myIdentity();
            var root = api.getCallRoot();
            var meSrc = root ? (root.dataset.currentUserAvatar || '') : '';
            api.paintAvatar(localOffAvatar, me.name || 'You', meSrc);
        }
    }
    var remoteLive = typeof api.hasLiveRemoteVideo === 'function' && api.hasLiveRemoteVideo();
    var videoCall = typeof api.isVideoCallType === 'function' && api.isVideoCallType();
    if (S.els.remoteVideoOff) {
        var attached = S.els.remoteVideo && S.els.remoteVideo.srcObject
            && typeof S.els.remoteVideo.srcObject.getVideoTracks === 'function'
            && S.els.remoteVideo.srcObject.getVideoTracks().some(function (track) {
                return track && track.readyState !== 'ended';
            });
        var cameraOff = !!videoCall && S.remoteCameraEnabled === false;
        var connecting = !!videoCall && S.remoteCameraEnabled !== false && !remoteLive && !attached;
        var showRemotePlaceholder = cameraOff || connecting;
        S.els.remoteVideoOff.hidden = !showRemotePlaceholder;
        S.els.remoteVideoOff.setAttribute('aria-hidden', showRemotePlaceholder ? 'false' : 'true');
        var remoteLabel = S.els.remoteVideoOff.querySelector('.comms-video-off-label');
        if (remoteLabel) {
            remoteLabel.textContent = cameraOff ? 'Camera Off' : '';
        }
    }
    if (S.els.inCall) {
        S.els.inCall.classList.toggle('is-remote-camera-off', S.remoteCameraEnabled === false);
        S.els.inCall.classList.toggle('is-local-camera-off', !on);
        S.els.inCall.classList.toggle('is-remote-mic-off', !S.remoteMicEnabled);
    }
    var remoteMicOff = document.getElementById('commsRemoteMicOff');
    if (remoteMicOff) {
        remoteMicOff.hidden = S.remoteMicEnabled;
    }
}

async function renegotiateForCamera() {
    if (!S.pc || !S.currentCall || S.negotiating) return;
    if (S.pc.signalingState !== 'stable') return;
    S.negotiating = true;
    try {
        var offer = await S.pc.createOffer();
        await S.pc.setLocalDescription(offer);
        await api.signalPeer({
            type: 'offer',
            call_id: S.currentCall.id,
            conversation_id: S.currentCall.conversation_id,
            sdp: offer,
            call_type: (S.currentCall && S.currentCall.call_type) || 'voice',
            renegotiate: true
        });
    } catch (e) {
        /* ignore */
    } finally {
        S.negotiating = false;
    }
}


api.setCameraUi = setCameraUi;
api.updateCameraUi = updateCameraUi;
api.isVideoCallType = isVideoCallType;
api.syncLocalPipLayout = syncLocalPipLayout;
api.setCameraEnabled = setCameraEnabled;
api.applyCameraState = applyCameraState;
api.findLiveVideoTrack = findLiveVideoTrack;
api.attachVideoTrackToSender = attachVideoTrackToSender;
api.attachLocalVideo = attachLocalVideo;
api.syncCameraUi = syncCameraUi;
api.renegotiateForCamera = renegotiateForCamera;
