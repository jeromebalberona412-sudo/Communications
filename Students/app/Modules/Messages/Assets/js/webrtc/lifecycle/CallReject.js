import { S, api } from '../core/CallStateManager.js';

/**
 * End a call that never connected.
 * The modal and ringtone close immediately. Signaling and the server
 * status update run after the UI has already moved on.
 */
async function finishUnanswered(reason) {
    if (!S.currentCall || S.callConnected) return;
    var callSnapshot = S.currentCall;
    if (callSnapshot.id != null) api.markCallTerminal(callSnapshot.id);
    api.rememberCallContext(callSnapshot);
    var peerName = (callSnapshot.peer && callSnapshot.peer.name) || '';
    var status = reason === 'rejected' ? 'rejected'
        : (reason === 'cancelled' ? 'cancelled' : 'missed');

    S.acceptGeneration = (S.acceptGeneration || 0) + 1;
    S.acceptingCallId = null;
    S.startingCall = false;
    S.decliningCall = false;
    S.currentCall = null;
    S.incomingCall = null;
    S.incomingCallId = null;
    api.clearRingTimeout();
    api.stopRingtone();
    api.hideIncoming();
    if (typeof api.setIncomingActionState === 'function') api.setIncomingActionState('idle');
    api.showCallEnded(status, peerName, callSnapshot.id, null, null);

    api.signalPeer({
        type: 'call-end',
        reason: status,
        ended_by_role: S.role || (status === 'cancelled' ? 'caller' : 'callee'),
        call_id: callSnapshot.id,
        conversation_id: callSnapshot.conversation_id,
        caller_id: callSnapshot.caller_id,
        caller_type: callSnapshot.caller_type,
        receiver_id: callSnapshot.receiver_id,
        receiver_type: callSnapshot.receiver_type
    }).catch(function () { /* local UI already closed */ });

    api.cleanupMediaOnly().catch(function () { /* ignore */ });
    if (callSnapshot.id) {
        api.updateCallStatus(callSnapshot.id, status).catch(function () { /* ignore */ });
    }
    api.refreshCallChat(callSnapshot.conversation_id);
}

async function rejectIncoming() {
    if (S.decliningCall) return;
    var modalIsGroup = !!(S.incomingCall && (S.incomingCall.is_group_call || S.incomingCall._groupInvite));
    if (modalIsGroup && window.__commsPendingGroupInvite
        && window.CommsWebRTC
        && typeof window.CommsWebRTC.__rejectGroupIfPending === 'function') {
        S.decliningCall = true;
        api.setIncomingActionState('declining');
        api.stopRingtone();
        api.clearRingTimeout();
        api.hideIncoming();
        try {
            var groupRejected = await window.CommsWebRTC.__rejectGroupIfPending();
            if (groupRejected) {
                S.decliningCall = false;
                return;
            }
        } catch (e) { /* fall through to the 1:1 decline */ }
        S.decliningCall = false;
    }

    var modalCallId = S.incomingCallId != null ? Number(S.incomingCallId) : null;
    var source = (modalCallId != null && S.incomingCall && Number(S.incomingCall.id) === modalCallId)
        ? S.incomingCall
        : S.currentCall;
    if (!source) return;
    if (modalCallId != null && Number(source.id) !== modalCallId) return;

    S.decliningCall = true;
    S.acceptGeneration = (S.acceptGeneration || 0) + 1;
    S.currentCall = Object.assign({}, S.currentCall || {}, source);
    api.setIncomingActionState('declining');
    api.stopRingtone();
    api.clearRingTimeout();
    api.hideIncoming();
    await api.finishUnanswered('rejected');
}

api.finishUnanswered = finishUnanswered;
api.rejectIncoming = rejectIncoming;
