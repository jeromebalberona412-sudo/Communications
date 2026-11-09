import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

async function endCall() {
    if (typeof window.CommsWebRTC !== 'undefined'
        && typeof window.CommsWebRTC.__meshActive === 'function'
        && window.CommsWebRTC.__meshActive()
        && typeof window.CommsWebRTC.__meshLeave === 'function') {
        return window.CommsWebRTC.__meshLeave('ended');
    }

    if (S.pendingStart) {
        await api.cancelPendingStart();
        api.setCtrlLabel(S.els.endBtn, 'End');
        return;
    }

    if (!S.currentCall) {
        await api.cleanupMediaOnly();
        return;
    }

    if (!S.callConnected) {
        await api.finishUnanswered(S.role === 'caller' ? 'cancelled' : 'rejected');
        return;
    }

    var peerName = (S.currentCall.peer && S.currentCall.peer.name) || '';
    var callSnapshot = S.currentCall;
    if (callSnapshot.id != null) api.markCallTerminal(callSnapshot.id);
    api.rememberCallContext(callSnapshot);
    
    // CRITICAL FIX: Stop all media/UI immediately
    api.stopRingtone();
    api.stopVibration();
    api.stopCallTimer();
    api.hideIncoming();
    
    // Send hangup first, fire-and-forget, while the channel is still alive.
    var endedByRole = S.role || 'caller';
    try {
        api.signalPeer({
            type: 'call-end',
            reason: 'ended',
            ended_by_role: endedByRole,
            call_id: callSnapshot.id,
            conversation_id: callSnapshot.conversation_id,
            caller_id: callSnapshot.caller_id,
            caller_type: callSnapshot.caller_type,
            receiver_id: callSnapshot.receiver_id,
            receiver_type: callSnapshot.receiver_type
        });
    } catch (err) {
        console.error('Failed to send hangup signal:', err);
    }
    
    // Clean up local state immediately
    S.currentCall = null;
    S.role = null;
    await api.cleanupMediaOnly();
    
    // CRITICAL FIX: Show "Call Ended" UI immediately, update server status in background
    api.showCallEnded('ended', peerName, callSnapshot.id, endedByRole, null);
    
    // Update server status in background (don't block UI)
    api.withTimeout(api.updateCallStatus(callSnapshot.id, 'ended'), 4000).then(function(serverCall) {
        if (serverCall && serverCall.duration_seconds != null) {
            var endedEl = document.querySelector('[data-call-ended-id="' + callSnapshot.id + '"]');
            if (endedEl && serverCall.duration_seconds > 0) {
                var durationText = formatCallDuration(serverCall.duration_seconds);
                var durationDisplay = endedEl.querySelector('.call-duration');
                if (durationDisplay) durationDisplay.textContent = durationText;
            }
        }
    }).catch(function() { /* ignore */ });
    
    api.refreshCallChat(callSnapshot.conversation_id);
}

function releaseCallOnUnload() {
    if (S.pendingStart) {
        api.clearPendingStart();
        return;
    }
    if (!S.currentCall || !S.currentCall.id) return;
    var callId = S.currentCall.id;
    var convId = S.currentCall.conversation_id;
    var status = S.callConnected ? 'ended' : (S.role === 'caller' ? 'cancelled' : 'rejected');
    try {
        api.signalPeer({
            type: 'call-end',
            reason: status,
            ended_by_role: S.role || 'caller',
            call_id: callId,
            conversation_id: convId,
            caller_id: S.currentCall.caller_id,
            caller_type: S.currentCall.caller_type,
            receiver_id: S.currentCall.receiver_id,
            receiver_type: S.currentCall.receiver_type
        });
    } catch (eSig) { /* ignore */ }
    var r = api.routes();
    if (!r.callStatus) {
        S.currentCall = null;
        S.callConnected = false;
        S.role = null;
        return;
    }
    var url = window.Comms && typeof window.Comms.route === 'function'
        ? window.Comms.route(r.callStatus, callId)
        : null;
    if (!url) {
        S.currentCall = null;
        S.callConnected = false;
        S.role = null;
        return;
    }
    var token = document.querySelector('meta[name="csrf-token"]');
    var body = JSON.stringify({ status: status });
    try {
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': token ? token.getAttribute('content') : '',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: body,
            keepalive: true,
            credentials: 'same-origin'
        }).catch(function () {});
    } catch (e) { /* ignore */ }
    S.currentCall = null;
    S.callConnected = false;
    S.role = null;
}


api.endCall = endCall;
api.releaseCallOnUnload = releaseCallOnUnload;
