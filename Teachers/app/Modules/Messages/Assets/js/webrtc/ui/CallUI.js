import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function mountCallUiToBody() {
    ['incoming', 'inCall', 'ended'].forEach(function (key) {
        var node = S.els[key];
        if (node && node.parentNode !== document.body) {
            document.body.appendChild(node);
        }
    });
    // Re-bind element refs after move (keeps Accept/Decline clicks reliable).
    S.els.accept = document.getElementById('commsAcceptCall');
    S.els.reject = document.getElementById('commsRejectCall');
    S.els.endBtn = document.getElementById('commsEndCall');
    S.els.endedClose = document.getElementById('commsCallEndedClose');
    S.els.endedDismiss = document.getElementById('commsCallEndedX');
    S.els.endedRedial = document.getElementById('commsCallEndedRedial');
    S.els.muteBtn = document.getElementById('commsMuteBtn');
    S.els.cameraBtn = document.getElementById('commsCameraBtn');
    S.els.localVideo = document.getElementById('commsLocalVideo');
    S.els.remoteVideo = document.getElementById('commsRemoteVideo');
    S.els.remoteAudio = document.getElementById('commsRemoteAudio');
    S.els.localVideoOff = document.getElementById('commsLocalVideoOff');
    S.els.remoteVideoOff = document.getElementById('commsRemoteVideoOff');
    S.els.incoming = document.getElementById('commsIncomingCall');
    S.els.inCall = document.getElementById('commsInCall');
    S.els.ended = document.getElementById('commsCallEnded');
    S.els.endedPeer = document.getElementById('commsCallEndedPeer');
    S.els.endedReason = document.getElementById('commsCallEndedReason');
    S.els.endedTitle = document.getElementById('commsCallEndedTitle');
    S.els.endedAvatar = document.getElementById('commsCallEndedAvatar');
    S.els.endedDuration = document.getElementById('commsCallEndedDuration');
    S.els.callAvatar = document.getElementById('commsCallPeerAvatar');
    S.els.callCenter = document.getElementById('commsCallCenter');
    S.els.peerName = document.getElementById('commsCallPeerName');
    S.els.callStatus = document.getElementById('commsCallStatus');
    S.els.timer = document.getElementById('commsCallTimer');
}

function endedCopy(reason, endedByRole) {
    var actor = endedByRole || S.role;
    switch (reason) {
        case 'missed':
            return {
                title: 'Call ended',
                reason: 'Call ended. No pickup.'
            };
        case 'rejected':
            return {
                title: 'Call declined',
                reason: S.role === 'caller' ? 'The other person declined the call.' : 'You declined the call.'
            };
        case 'cancelled':
            return {
                title: 'Call cancelled',
                reason: actor === 'caller'
                    ? (S.role === 'caller' ? 'You cancelled the call.' : 'The caller cancelled the call.')
                    : (S.role === 'callee' ? 'You cancelled the call.' : 'The other person cancelled the call.')
            };
        case 'offline':
            return {
                title: 'Call ended',
                reason: 'The person you are calling is offline.'
            };
        default:
            return {
                title: 'Call ended',
                reason: 'The call has ended.'
            };
    }
}

function rememberCallContext(call) {
    if (!call) return;
    var groupCall = !!(call.is_group_call || (call.peer && call.peer.is_group));
    S.lastCallContext = {
        conversationId: call.conversation_id,
        callType: call.call_type || 'voice',
        isGroup: groupCall,
        conversation: {
            id: call.conversation_id,
            conversation_type: groupCall ? 'group' : 'private',
            is_default_group: groupCall,
            name: (call.peer && call.peer.name) || '',
            other_user: call.peer || null
        },
        peerName: (call.peer && call.peer.name) || '',
        peerAvatar: (call.peer && (call.peer.profile_image_url || call.peer.avatar_url)) || ''
    };
}

function setCtrlLabel(btn, label) {
    if (!btn) return;
    var labelEl = btn.querySelector('.comms-call-ctrl-label');
    if (labelEl) labelEl.textContent = label;
    btn.setAttribute('aria-label', label);
    btn.removeAttribute('title');
}

function paintAvatar(target, name, src) {
    if (!target) return;
    target.textContent = '';
    if (src) {
        var img = document.createElement('img');
        img.src = String(src);
        img.alt = '';
        target.appendChild(img);
        return;
    }
    target.textContent = String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function setCallPeerAvatar(call) {
    var peer = (call && call.peer) || {};
    var name = peer.name || 'Participant';
    var src = peer.profile_image_url || peer.avatar_url || '';
    api.paintAvatar(S.els.callAvatar, name, src);
    var remoteOffAvatar = document.getElementById('commsRemoteVideoOffAvatar');
    if (remoteOffAvatar) {
        api.paintAvatar(remoteOffAvatar, name, src);
    }
    var remoteOffName = document.getElementById('commsRemoteVideoOffName');
    if (remoteOffName) {
        remoteOffName.textContent = name;
    }
}

function hideEnded() {
    if (S.endedAutoClose) {
        clearTimeout(S.endedAutoClose);
        S.endedAutoClose = null;
    }
    if (S.els.ended) S.els.ended.hidden = true;
}

function showCallEnded(reason, peerName, callId, endedByRole, callPayload) {
    var callKey = callId != null ? String(callId) : '';
    if (callKey && S.summaryShownFor[callKey]) {
        return;
    }
    if (S.els.ended && !S.els.ended.hidden && callKey && Number(S.lastEndedCallId) === Number(callId)) {
        return;
    }
    if (callId != null) S.lastEndedCallId = callId;
    if (callKey) S.summaryShownFor[callKey] = true;

    // Group calls end without api.cleanupMediaOnly(), so the timer may still be running here.
    if (S.callStartedAt) {
        S.lastCallDurationMs = api.callElapsedMs();
        clearInterval(S.callTimer);
        S.callTimer = null;
        S.callStartedAt = null;
    }

    api.hideIncoming();
    if (S.els.inCall) S.els.inCall.hidden = true;
    api.clearRingTimeout();
    api.stopRingtone();
    api.stopCallHeartbeat();

    var statusKey = String(reason || 'ended');
    var serverStatus = callPayload && callPayload.status
        ? String(callPayload.status).toLowerCase()
        : '';
    if (serverStatus) {
        statusKey = serverStatus;
    }
    var copy = api.endedCopy(statusKey, endedByRole);
    var displayName = peerName
        || (S.lastCallContext && S.lastCallContext.peerName)
        || (S.currentCall && S.currentCall.peer && S.currentCall.peer.name)
        || ((callPayload && callPayload.peer && callPayload.peer.name) || '');
    var avatarSrc = (S.lastCallContext && (!peerName || peerName === S.lastCallContext.peerName))
        ? (S.lastCallContext.peerAvatar || '')
        : '';
    if (!avatarSrc && callPayload && callPayload.peer) {
        avatarSrc = callPayload.peer.profile_image_url || callPayload.peer.avatar_url || '';
    }
    var callType = (S.lastCallContext && S.lastCallContext.callType)
        || (S.currentCall && S.currentCall.call_type)
        || (callPayload && callPayload.call_type)
        || 'voice';
    var typeLabel = String(callType) === 'video' ? 'Video call' : 'Voice call';

    var serverDuration = api.authoritativeDurationMs(callPayload);
    var connected = serverDuration !== null
        ? serverDuration >= 500
        : (S.lastCallDurationMs >= 1000);

    var statusLabel = ({
        ended: 'Call ended',
        completed: 'Call ended',
        missed: 'Missed',
        rejected: 'Declined',
        cancelled: 'Cancelled',
        canceled: 'Cancelled',
        offline: 'Call ended',
        failed: 'Call ended'
    })[statusKey] || copy.title || 'Ended';

    if (S.els.endedTitle) S.els.endedTitle.textContent = copy.title;
    if (S.els.endedReason) S.els.endedReason.textContent = copy.reason;
    if (S.els.endedPeer) {
        S.els.endedPeer.textContent = displayName;
        S.els.endedPeer.hidden = !displayName;
    }
    api.paintAvatar(S.els.endedAvatar, displayName, avatarSrc);
    var endedType = document.getElementById('commsCallEndedType');
    if (endedType) {
        endedType.textContent = typeLabel;
        endedType.hidden = false;
    }
    var endedStatus = document.getElementById('commsCallEndedStatus');
    if (endedStatus) {
        endedStatus.textContent = statusLabel;
        endedStatus.hidden = false;
    }
    var durationMs = serverDuration !== null ? serverDuration : S.lastCallDurationMs;
    if (S.els.endedDuration) {
        // A completed-call summary only makes sense for a call that connected.
        var showDuration = connected && (statusKey === 'ended' || statusKey === 'completed');
        S.els.endedDuration.textContent = showDuration ? ('Duration: ' + api.formatDuration(durationMs)) : '';
        S.els.endedDuration.hidden = !showDuration;
    }
    var endedStarted = document.getElementById('commsCallEndedStarted');
    if (endedStarted) {
        var startedAt = (callPayload && callPayload.started_at)
            || (callPayload && callPayload.answered_at)
            || '';
        var startedText = api.formatClockTime(startedAt);
        endedStarted.textContent = startedText ? ('Started: ' + startedText) : '';
        endedStarted.hidden = !startedText;
    }
    var endedAt = document.getElementById('commsCallEndedAt');
    if (endedAt) {
        var endText = api.formatClockTime((callPayload && callPayload.ended_at) || '');
        endedAt.textContent = endText ? ('Ended: ' + endText) : '';
        endedAt.hidden = !endText;
    }
    S.lastCallDurationMs = 0;
    S.role = null;
    S.currentCall = null;
    S.incomingCall = null;
    S.incomingCallId = null;
    S.answeredCall = null;

    if (S.els.ended) S.els.ended.hidden = false;
    if (S.els.endedRedial) {
        S.els.endedRedial.hidden = false;
        S.els.endedRedial.removeAttribute('hidden');
        S.els.endedRedial.removeAttribute('aria-hidden');
        S.els.endedRedial.removeAttribute('tabindex');
    }
    if (S.els.endedClose) {
        try { S.els.endedClose.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    if (S.endedAutoClose) clearTimeout(S.endedAutoClose);
    S.endedAutoClose = setTimeout(function () {
        api.hideEnded();
    }, 12000);
}

function redialLastCall() {
    if (!S.lastCallContext || !S.lastCallContext.conversationId) return;
    if (S.startingCall || S.currentCall || S.pendingStart || S.redialLock) return;

    S.redialLock = true;
    var ctx = {
        conversationId: S.lastCallContext.conversationId,
        callType: S.lastCallContext.callType || 'voice',
        conversation: S.lastCallContext.conversation || null
    };

    api.hideEnded();
    api.stopCallTimer();
    S.lastEndedCallId = null;
    S.answerAppliedFor = null;
    S.acceptingCallId = null;
    S.peerAnsweredFor = null;
    S.callAnswered = false;
    S.callConnected = false;
    S.iceQueue = [];
    S.remoteCameraSeq = 0;
    S.cameraSeq = 0;
    S.wantsVideo = ctx.callType === 'video';
    S.cameraEnabled = S.wantsVideo;
    S.videoLayoutLatched = S.wantsVideo;

    Promise.resolve(api.cleanupMediaOnly()).then(function () {
        S.startingCall = false;
        S.currentCall = null;
        S.callConnected = false;
        S.wantsVideo = ctx.callType === 'video';
        S.cameraEnabled = S.wantsVideo;
        S.videoLayoutLatched = S.wantsVideo;
        try {
            api.startCall(ctx.conversationId, ctx.callType, ctx.conversation, null, true);
        } finally {
            S.redialLock = false;
        }
    }).catch(function (err) {
        console.error('Cleanup failed before redial:', err);
        S.redialLock = false;
        S.currentCall = null;
        S.startingCall = false;
        api.toast('Unable to redial. Please try again.', 'error');
    });
}

function setCallStatus(text) {
    if (S.els.callStatus) S.els.callStatus.textContent = text || '';
    if (typeof api.syncCallTimerVisibility === 'function') api.syncCallTimerVisibility();
}

function remountCallEls() {
    S.els.inCall = document.getElementById('commsInCall') || S.els.inCall;
    S.els.incoming = document.getElementById('commsIncomingCall') || S.els.incoming;
    S.els.remoteVideo = document.getElementById('commsRemoteVideo') || S.els.remoteVideo;
    S.els.localVideo = document.getElementById('commsLocalVideo') || S.els.localVideo;
    S.els.remoteAudio = document.getElementById('commsRemoteAudio') || S.els.remoteAudio;
    S.els.timer = document.getElementById('commsCallTimer') || S.els.timer;
    S.els.callStatus = document.getElementById('commsCallStatus') || S.els.callStatus;
    S.els.peerName = document.getElementById('commsCallPeerName') || S.els.peerName;
    S.els.localVideoOff = document.getElementById('commsLocalVideoOff') || S.els.localVideoOff;
    S.els.remoteVideoOff = document.getElementById('commsRemoteVideoOff') || S.els.remoteVideoOff;
    if (S.els.inCall && S.els.inCall.parentNode !== document.body) {
        document.body.appendChild(S.els.inCall);
    }
}

function keepActiveCallVisible(statusText) {
    api.remountCallEls();
    if (!S.els.inCall) return;
    api.hideEnded();
    if (S.els.incoming) S.els.incoming.hidden = true;
    S.els.inCall.hidden = false;
    S.els.inCall.removeAttribute('hidden');
    document.documentElement.classList.add('comms-in-call');
    document.body.classList.add('comms-in-call');
    if (S.callAnswered || S.callConnected) api.stopRingtone();
    if (statusText != null) api.setCallStatus(statusText);
    if (typeof api.syncCallTimerVisibility === 'function') api.syncCallTimerVisibility();
    api.attachLocalVideo();
    if (S.remoteStream) api.bindRemoteMedia(S.remoteStream);
}

function isLiveAcceptedCall() {
    if (S.ringingPreview && !S.callConnected && !S.startingCall && !S.pc) return false;
    if (S.startingCall || S.callConnected || S.pc || S.pendingStart) return true;
    if (S.els.inCall && !S.els.inCall.hidden && S.currentCall && !S.ringingPreview) return true;
    if (S.currentCall && S.currentCall.id != null && S.answeredCallIds[Number(S.currentCall.id)]) return true;
    return false;
}

function revealRingingPreview(call) {
    api.remountCallEls();
    if (!S.els.inCall) return;
    api.hideEnded();
    S.ringingPreview = true;
    S.callConnected = false;
    S.els.inCall.hidden = false;
    S.els.inCall.removeAttribute('hidden');
    S.els.inCall.classList.add('is-ringing-preview');
    if (String((call && call.call_type) || '') === 'video') {
        S.els.inCall.classList.add('is-video-call');
    }
    document.documentElement.classList.add('comms-in-call');
    document.body.classList.add('comms-in-call');
    if (S.els.peerName) {
        S.els.peerName.textContent = (call && call.peer && call.peer.name) || 'Incoming call';
    }
    api.setCallPeerAvatar(call || {});
    api.setCallStatus('Ringing...');
    if (S.els.incoming) {
        S.els.incoming.hidden = false;
        S.els.incoming.removeAttribute('hidden');
    }
    api.attachLocalVideo();
    api.syncLocalPipLayout();
}

function showInCall(call, statusText) {
    api.remountCallEls();
    if (!S.els.inCall) return;
    api.hideEnded();
    if (S.els.incoming) S.els.incoming.hidden = true;
    S.els.inCall.hidden = false;
    S.els.inCall.removeAttribute('hidden');
    document.documentElement.classList.add('comms-in-call');
    document.body.classList.add('comms-in-call');
    if (S.els.peerName) {
        S.els.peerName.textContent = (call.peer && call.peer.name) || 'Call';
    }
    api.setCallPeerAvatar(call);
    var videoCall = String((call && call.call_type) || '') === 'video' || !!S.wantsVideo;
    var callId = call && call.id != null ? Number(call.id) : null;
    if (callId != null && S.layoutCallId !== callId) {
        S.layoutCallId = callId;
        if (!S.remoteCameraSeq) S.remoteCameraEnabled = !!videoCall;
    } else if (callId == null && !videoCall && !S.callConnected && !S.remoteCameraSeq) {
        S.remoteCameraEnabled = false;
    }
    var groupCall = S.els.inCall.classList.contains('is-group-call');
    if (!groupCall) {
        S.els.inCall.classList.toggle('is-video-call', videoCall);
        S.els.inCall.classList.toggle('is-audio-call', !videoCall);
        S.els.inCall.classList.toggle('is-ringing-preview', videoCall && !S.callConnected && !S.callAnswered);
    }
    if (videoCall && !S.callConnected && !S.callAnswered) {
        S.els.inCall.classList.remove('has-remote-video');
        if (S.els.remoteVideoOff) S.els.remoteVideoOff.hidden = true;
        if (S.els.localVideoOff) S.els.localVideoOff.hidden = true;
    }
    if (S.callConnected || S.callAnswered) {
        S.els.inCall.classList.add('is-connected');
        S.els.inCall.classList.remove('is-ringing-preview');
    }
    api.setCallStatus(statusText != null ? statusText : (S.callConnected ? 'Connected' : 'Calling...'));
    if (typeof api.syncCallTimerVisibility === 'function') api.syncCallTimerVisibility();
    api.setMuteUi(false);
    api.attachLocalVideo();
    if (S.remoteStream) api.bindRemoteMedia(S.remoteStream);
    api.updateCameraUi();
    api.syncLocalPipLayout();
    api.unlockRemotePlayback();
}


api.mountCallUiToBody = mountCallUiToBody;
api.endedCopy = endedCopy;
api.rememberCallContext = rememberCallContext;
api.setCtrlLabel = setCtrlLabel;
api.paintAvatar = paintAvatar;
api.setCallPeerAvatar = setCallPeerAvatar;
api.hideEnded = hideEnded;
api.showCallEnded = showCallEnded;
api.redialLastCall = redialLastCall;
api.setCallStatus = setCallStatus;
api.remountCallEls = remountCallEls;
api.keepActiveCallVisible = keepActiveCallVisible;
api.isLiveAcceptedCall = isLiveAcceptedCall;
api.revealRingingPreview = revealRingingPreview;
api.showInCall = showInCall;
