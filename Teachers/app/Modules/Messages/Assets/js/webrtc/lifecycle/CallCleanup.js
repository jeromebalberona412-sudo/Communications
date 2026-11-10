import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

async function cleanupMediaOnly() {
    if (S.cleaningCall && !S.pc && !S.localStream) {
        return;
    }
    S.cleaningCall = true;
    api.clearPendingStart();
    api.clearRingTimeout();
    api.clearConnectionTimeout();
    api.stopCallHeartbeat();
    if (S.iceDisconnectTimer) {
        clearTimeout(S.iceDisconnectTimer);
        S.iceDisconnectTimer = null;
    }
    api.stopRingtone();
    
    clearInterval(S.callTimer);
    S.callTimer = null;
    S.lastCallDurationMs = api.callElapsedMs();
    S.callStartedAt = null;
    S.timerAnchored = false;
    if (S.els.timer) {
        S.els.timer.textContent = '00:00';
        S.els.timer.hidden = true;
        S.els.timer.setAttribute('hidden', '');
    }
    
    S.cameraEnabled = false;
    S.wantsVideo = false;
    S.callConnected = false;
    S.callAnswered = false;
    S.peerAnsweredFor = null;
    S.remoteCameraEnabled = true;
    S.remoteMicEnabled = true;
    S.remoteCameraSeq = 0;
    S.cameraSeq = 0;
    S.videoSender = null;
    S.cameraPending = null;
    S.cameraBusy = false;
    S.role = null;
    S.startingCall = false;
    S.acceptingCallId = null;
    S.answerAppliedFor = null;
    S.decliningCall = false;
    S.ringingPreview = false;
    S.previewGeneration = (S.previewGeneration || 0) + 1;
    S._previewJob = null;
    S.cameraChain = Promise.resolve();
    S.negotiating = false;
    
    if (S.els.endBtn) api.setCtrlLabel(S.els.endBtn, 'End');
    if (S.els.muteBtn) {
        S.els.muteBtn.hidden = false;
        api.setMuteUi(false);
    }
    if (S.els.cameraBtn) S.els.cameraBtn.hidden = false;
    if (S.localStream) {
        S.localStream.getTracks().forEach(function (t) { t.stop(); });
        S.localStream = null;
    }
    // Clean up remote track event listeners before nulling S.remoteStream
    if (S.remoteStream && typeof S.remoteStream.getTracks === 'function') {
        S.remoteStream.getTracks().forEach(function (track) {
            if (track._commsUnmuteHandler) {
                track.removeEventListener('unmute', track._commsUnmuteHandler);
                delete track._commsUnmuteHandler;
            }
            if (track._commsEndedHandler) {
                track.removeEventListener('ended', track._commsEndedHandler);
                delete track._commsEndedHandler;
            }
            try { track.stop(); } catch (e) { /* ignore */ }
        });
    }
    if (S.pc) {
        // Explicitly null out event handlers before closing
        S.pc.onicecandidate = null;
        S.pc.ontrack = null;
        S.pc.oniceconnectionstatechange = null;
        S.pc.onconnectionstatechange = null;
        S.pc.onnegotiationneeded = null;
        S.pc.ondatachannel = null;
        S.pc.onicecandidateerror = null;
        
        try { S.pc.close(); } catch (e) { /* ignore */ }
        S.pc = null;
    }
    // Close audio unlock context
    if (S.audioUnlockCtx) {
        try {
            S.audioUnlockCtx.close();
        } catch (e) { /* ignore */ }
        S.audioUnlockCtx = null;
    }
    // FIX BUG #4 & #5: Clear ICE queue to prevent stale candidates
    // VERIFIED: api.cleanupMediaOnly() clears S.iceQueue (line 1859) and calls 
    // teardownCallChannel() (line 1883) to prevent stale state.
    S.iceQueue = [];
    
    S.remoteStream = null;
    S.remoteDisplayStream = null;
    S.remotePlaybackStream = null;
    S.pendingRemoteAnswer = null;
    S._offerRebuildTried = false;
    S._remoteVideoSig = '';
    S.negotiating = false;
    if (S.els.remoteVideo) {
        S.els.remoteVideo.srcObject = null;
        // Remove event listeners bound to remote video
        if (S.els.remoteVideo._commsMetricsBound) {
            S.els.remoteVideo.removeEventListener('loadedmetadata', api.applyRemoteVideoMetrics);
            S.els.remoteVideo.removeEventListener('resize', api.applyRemoteVideoMetrics);
            S.els.remoteVideo._commsMetricsBound = false;
        }
    }
    if (S.els.localVideo) S.els.localVideo.srcObject = null;
    if (S.els.remoteAudio) S.els.remoteAudio.srcObject = null;
    if (S.els.inCall) {
        S.els.inCall.hidden = true;
        S.els.inCall.classList.remove('is-connected', 'has-remote-video', 'is-video-call', 'is-remote-portrait', 'is-remote-landscape', 'is-ringing-preview');
    }
    if (S.els.remoteVideo) {
        S.els.remoteVideo.classList.remove('is-remote-portrait', 'is-remote-landscape');
    }
    // FIX BUG #5: Always teardown call channel to prevent stale signals
    if (window.CommsRealtime && typeof window.CommsRealtime.teardownCallChannel === 'function') {
        window.CommsRealtime.teardownCallChannel();
    }
    if (S.els.callCenter) {
        S.els.callCenter.classList.remove('is-compact');
        S.els.callCenter.hidden = false;
    }
    if (S.els.incoming) S.els.incoming.hidden = true;
    if (S.els.remoteVideoOff) S.els.remoteVideoOff.hidden = true;
    if (S.els.localVideoOff) S.els.localVideoOff.hidden = true;
    var remoteMicOffEl = document.getElementById('commsRemoteMicOff');
    if (remoteMicOffEl) remoteMicOffEl.hidden = true;
    document.documentElement.classList.remove('comms-in-call');
    document.body.classList.remove('comms-in-call');
    S.cleaningCall = false;
}


api.cleanupMediaOnly = cleanupMediaOnly;
