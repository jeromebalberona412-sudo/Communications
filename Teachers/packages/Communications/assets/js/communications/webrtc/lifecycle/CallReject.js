import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

async function finishUnanswered(reason) {
    if (!S.currentCall || S.callConnected) return;
    var callSnapshot = S.currentCall;
    if (callSnapshot.id != null) api.markCallTerminal(callSnapshot.id);
    api.rememberCallContext(callSnapshot);
    var peerName = (callSnapshot.peer && callSnapshot.peer.name) || '';
    var status = reason === 'rejected' ? 'rejected'
        : (reason === 'cancelled' ? 'cancelled' : 'missed');

    api.clearRingTimeout();
    api.stopRingtone();

    try {
        await api.signalPeer({
            type: 'call-end',
            reason: status,
            ended_by_role: S.role || (status === 'cancelled' ? 'caller' : 'callee'),
            call_id: callSnapshot.id,
            conversation_id: callSnapshot.conversation_id,
            caller_id: callSnapshot.caller_id,
            caller_type: callSnapshot.caller_type,
            receiver_id: callSnapshot.receiver_id,
            receiver_type: callSnapshot.receiver_type
        });
    } catch (hangupErr) { /* still clean up locally */ }
    S.currentCall = null;
    await api.cleanupMediaOnly();
    var serverCall = callSnapshot.id
        ? await api.withTimeout(api.updateCallStatus(callSnapshot.id, status), 4000)
        : null;
    api.showCallEnded(status, peerName, callSnapshot.id, null, serverCall);
    api.refreshCallChat(callSnapshot.conversation_id);
}

async function rejectIncoming() {
    if (typeof window.CommsWebRTC !== 'undefined'
        && typeof window.CommsWebRTC.__rejectGroupIfPending === 'function') {
        try {
            var groupRejected = await window.CommsWebRTC.__rejectGroupIfPending();
            if (groupRejected) {
                api.hideIncoming();
                api.stopRingtone();
                api.clearRingTimeout();
                return;
            }
        } catch (e) { /* fall through */ }
    }
    // Decline must update the exact call session shown in the modal.
    var modalCallId = S.incomingCallId != null ? Number(S.incomingCallId) : null;
    var source = (modalCallId != null && S.incomingCall && Number(S.incomingCall.id) === modalCallId)
        ? S.incomingCall
        : S.currentCall;
    if (!source) return;
    if (modalCallId != null && Number(source.id) !== modalCallId) {
        return;
    }
    S.currentCall = Object.assign({}, S.currentCall || {}, source);
    if (S.currentCall.id != null) api.markCallTerminal(S.currentCall.id);
    await api.finishUnanswered('rejected');
}

/**
 * Ask the server for the terminal state of a call, but never block the UI
 * for long. The server owns the authoritative duration.
 */

api.finishUnanswered = finishUnanswered;
api.rejectIncoming = rejectIncoming;
