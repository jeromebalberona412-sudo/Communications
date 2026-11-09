import { S, api } from '../core/CallStateManager.js';

function setMuteUi(muted) {
    if (!S.els || !S.els.muteBtn) return;
    api.setCtrlLabel(S.els.muteBtn, muted ? 'Unmute' : 'Mute');
    S.els.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    S.els.muteBtn.classList.toggle('is-off', !!muted);
    var iconWrap = S.els.muteBtn.querySelector('[data-mute-icon]');
    if (!iconWrap) return;
    if (muted) {
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
            '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
            '<line x1="12" y1="19" x2="12" y2="23"/>' +
            '<line x1="8" y1="23" x2="16" y2="23"/>' +
            '<line x1="4" y1="4" x2="20" y2="20"/>' +
            '</svg>';
    } else {
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
            '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
            '<line x1="12" y1="19" x2="12" y2="23"/>' +
            '<line x1="8" y1="23" x2="16" y2="23"/>' +
            '</svg>';
    }
}

export function bindCallControls() {
    if (bindCallControls._bound) return;
    bindCallControls._bound = true;

    document.addEventListener('click', function (e) {
        if (e.target && e.target.closest('#commsTapToPlay')) {
            e.preventDefault();
            api.unlockRemotePlayback();
            api.showTapToPlay(false);
            return;
        }
        if (e.target && e.target.closest('#commsIncomingCall') && S.ringtonePlaying) {
            api.unlockCallAudio();
        }
        if (e.target && e.target.closest('#commsAcceptCall')) {
            e.preventDefault();
            api.unlockRemotePlayback();
            api.acceptIncoming();
            return;
        }
        if (e.target && e.target.closest('#commsRejectCall')) {
            e.preventDefault();
            api.rejectIncoming();
            return;
        }
        if (e.target && e.target.closest('#commsEndCall')) {
            e.preventDefault();
            api.endCall();
            return;
        }
        if (e.target && e.target.closest('#commsCallEndedRedial')) {
            e.preventDefault();
            api.unlockCallAudio();
            api.redialLastCall();
            return;
        }
        if (e.target && e.target.closest('#commsCallEndedClose, #commsCallEndedX')) {
            e.preventDefault();
            api.hideEnded();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && S.els && S.els.ended && !S.els.ended.hidden) {
            api.hideEnded();
        }
    });

    if (S.els && S.els.muteBtn) {
        S.els.muteBtn.addEventListener('click', function () {
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__meshActive === 'function' && window.CommsWebRTC.__meshActive()) {
                var pressed = S.els.muteBtn.getAttribute('aria-pressed') === 'true';
                var nextMuted = !pressed;
                if (typeof window.CommsWebRTC.__meshSetMuted === 'function') {
                    window.CommsWebRTC.__meshSetMuted(nextMuted);
                }
                setMuteUi(nextMuted);
                return;
            }
            if (!S.localStream) {
                api.toast('The call is not connected yet.', 'error');
                return;
            }
            var audioTracks = S.localStream.getAudioTracks();
            if (!audioTracks.length) {
                api.toast('No microphone is available for this call.', 'error');
                return;
            }
            var currentlyEnabled = audioTracks.some(function (t) { return t.enabled; });
            var nextEnabled = !currentlyEnabled;
            audioTracks.forEach(function (t) { t.enabled = nextEnabled; });
            setMuteUi(!nextEnabled);
            if (S.currentCall) {
                api.signalPeer({
                    type: 'mic-state',
                    call_id: S.currentCall.id,
                    conversation_id: S.currentCall.conversation_id,
                    enabled: !!nextEnabled
                });
            }
        });
    }

    if (S.els && S.els.cameraBtn) {
        S.els.cameraBtn.hidden = false;
        S.els.cameraBtn.addEventListener('click', function () {
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__meshActive === 'function' && window.CommsWebRTC.__meshActive()) {
                var next = !(S.els.cameraBtn.getAttribute('aria-pressed') === 'true');
                if (typeof window.CommsWebRTC.__meshSetCamera === 'function') {
                    window.CommsWebRTC.__meshSetCamera(next).then(function () {
                        api.setCameraUi(next);
                        api.updateCameraUi();
                    }).catch(function (err) {
                        api.toast((err && err.message) || 'Unable to toggle camera.', 'error');
                    });
                }
                return;
            }
            if (!S.localStream || !S.pc) {
                api.toast('The call is not connected yet.', 'error');
                return;
            }
            var next = !S.cameraEnabled;
            S.cameraPending = next;
            api.syncCameraUi();
            api.setCameraEnabled(next).catch(function (err) {
                api.toast((err && err.message) || 'Unable to toggle camera.', 'error');
                api.syncCameraUi();
            });
        });
    }

    window.addEventListener('orientationchange', function () { api.syncLocalPipLayout(); });
    window.addEventListener('resize', function () { api.syncLocalPipLayout(); });
    if (window.screen && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
        screen.orientation.addEventListener('change', function () { api.syncLocalPipLayout(); });
    }
    window.addEventListener('pagehide', function () { api.releaseCallOnUnload(); });
    window.addEventListener('beforeunload', function () { api.releaseCallOnUnload(); });
}

api.setMuteUi = setMuteUi;
api.bindCallControls = bindCallControls;
