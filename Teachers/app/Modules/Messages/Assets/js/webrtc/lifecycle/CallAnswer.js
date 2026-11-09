import { S, api } from '../core/CallStateManager.js';

function waitForRemoteOffer(ms) {
    return new Promise(function (resolve) {
        if (S.currentCall && S.currentCall._remoteOffer) {
            resolve(true);
            return;
        }
        var started = Date.now();
        var timer = setInterval(function () {
            if (S.currentCall && S.currentCall._remoteOffer) {
                clearInterval(timer);
                resolve(true);
                return;
            }
            if (Date.now() - started >= ms) {
                clearInterval(timer);
                resolve(false);
            }
        }, 40);
    });
}

function callStillLive(generation, callId) {
    return generation === S.acceptGeneration
        && S.currentCall
        && Number(S.currentCall.id) === Number(callId)
        && !S.decliningCall;
}

/**
 * Apply the caller's offer and send the SDP answer once.
 * Safe to call from the answer click and from a late offer signal.
 */
async function tryCompleteCalleeAnswer() {
    if (S.role === 'caller' || S.decliningCall) return false;
    if (!S.currentCall || !S.pc || !S.currentCall._remoteOffer) return false;
    var callId = Number(S.currentCall.id);
    if (S.answerAppliedFor != null && Number(S.answerAppliedFor) === callId && S.pc.currentRemoteDescription) {
        var incomingSdp = S.currentCall._remoteOffer && S.currentCall._remoteOffer.sdp;
        var currentSdp = S.pc.currentRemoteDescription.sdp;
        if (!incomingSdp || incomingSdp === currentSdp) {
            return true;
        }
    }
    if (S.negotiating) return false;
    S.negotiating = true;
    try {
        if (S.pc.signalingState === 'have-local-offer') {
            try { await S.pc.setLocalDescription({ type: 'rollback' }); } catch (rbErr) { /* ignore */ }
        }
        if (S.pc.signalingState === 'stable' && !S.pc.currentRemoteDescription) {
            await S.pc.setRemoteDescription(S.currentCall._remoteOffer);
        }
        var call = S.currentCall;
        var answerSdp = S.pc.localDescription;
        if (S.pc.signalingState === 'have-remote-offer') {
            answerSdp = await S.pc.createAnswer();
            await S.pc.setLocalDescription(answerSdp);
        }
        if (!S.pc.currentRemoteDescription || !answerSdp) return false;
        await api.signalPeer({
            type: 'answer',
            call_id: call.id,
            conversation_id: call.conversation_id,
            sdp: answerSdp,
            caller_id: call.caller_id,
            caller_type: call.caller_type,
            receiver_id: call.receiver_id,
            receiver_type: call.receiver_type,
            started_at: call.started_at || call.answered_at || null,
            server_time: call.server_time || null
        });
        S.answerAppliedFor = callId;
        while (S.iceQueue.length && S.pc) {
            try { await S.pc.addIceCandidate(S.iceQueue.shift()); } catch (iceErr) { /* stale candidate */ }
        }
        api.attachLocalVideo();
        api.signalMediaState();
        api.setCallStatus(S.callConnected ? 'Connected' : 'Connecting...');
        api.keepActiveCallVisible(S.callConnected ? 'Connected' : 'Connecting...');
        return true;
    } catch (err) {
        return false;
    } finally {
        S.negotiating = false;
    }
}

async function acceptIncoming() {
    var pendingGroup = window.__commsPendingGroupInvite;
    var modalIsGroup = !!(S.incomingCall && (S.incomingCall.is_group_call || S.incomingCall._groupInvite));
    if (S.decliningCall) return;
    if (modalIsGroup && pendingGroup
        && window.CommsWebRTC
        && typeof window.CommsWebRTC.__acceptGroupIfPending === 'function') {
        api.setIncomingActionState('answering');
        api.stopRingtone();
        api.clearRingTimeout();
        api.hideIncoming();
        try {
            var groupHandled = await window.CommsWebRTC.__acceptGroupIfPending();
            if (groupHandled) return;
        } catch (err) {
            api.setIncomingActionState('idle');
            api.toast((err && err.message) || 'Unable to join group call.', 'error');
            return;
        }
    }

    var modalCallId = S.incomingCallId != null ? Number(S.incomingCallId) : null;
    var source = (modalCallId != null && S.incomingCall && Number(S.incomingCall.id) === modalCallId)
        ? S.incomingCall
        : S.currentCall;
    if (!source || source.id == null) {
        api.toast('This call is no longer available.', 'error');
        return;
    }
    if (modalCallId != null && Number(source.id) !== modalCallId) return;

    var callId = Number(source.id);
    if (S.acceptingCallId != null && Number(S.acceptingCallId) === callId) return;
    if (S.callConnected && S.currentCall && Number(S.currentCall.id) === callId) {
        api.hideIncoming();
        api.keepActiveCallVisible('Connected');
        return;
    }

    var call = Object.assign({}, S.currentCall || {}, source);
    S.currentCall = call;
    S.role = 'callee';
    S.callConnected = false;
    S.acceptingCallId = callId;
    S.acceptGeneration = (S.acceptGeneration || 0) + 1;
    var generation = S.acceptGeneration;
    S.startingCall = true;
    S.lifecycle = 'accepted';
    S.answeredCall = call;
    api.rememberCallId(S.answeredCallIds, callId);
    api.stopCallTimer();
    api.clearRingTimeout();
    api.stopRingtone();
    api.setIncomingActionState('answering');
    api.hideIncoming();
    S.wantsVideo = call.call_type === 'video';
    api.showInCall(call, 'Connecting...');
    api.updateCameraUi();
    api.unlockRemotePlayback();

    var alive = function () { return callStillLive(generation, callId); };

    api.signalPeer({
        type: 'call-accept',
        call_id: call.id,
        conversation_id: call.conversation_id,
        caller_id: call.caller_id,
        caller_type: call.caller_type,
        receiver_id: call.receiver_id,
        receiver_type: call.receiver_type
    }).catch(function () { /* realtime will retry on the next signal */ });

    api.updateCallStatus(call.id, 'accepted').then(function (accepted) {
        if (!alive() || !accepted) return;
        S.currentCall = Object.assign({}, S.currentCall, accepted);
        S.answeredCall = S.currentCall;
        if (S.callConnected) api.maybeStartConnectedTimer();
    }).catch(function () {});

    api.subscribeCallChannel(call.conversation_id);

    try {
        api.assertMediaReady();
        api.armConnectionTimeout();
        S.lifecycle = 'connecting';
        await api.ensurePeerConnection(!!S.wantsVideo);
        if (!alive()) return;
        if (S.wantsVideo) {
            S.cameraEnabled = true;
            var pickupTrack = api.findLiveVideoTrack && api.findLiveVideoTrack();
            if (pickupTrack) pickupTrack.enabled = true;
            api.attachLocalVideo();
            api.syncCameraUi();
        }
        if (S.currentCall && S.currentCall._remoteOffer) {
            call._remoteOffer = S.currentCall._remoteOffer;
        }
        api.keepActiveCallVisible('Connecting...');
        api.startCallHeartbeat();
        if (!S.currentCall._remoteOffer) {
            await api.waitForRemoteOffer(12000);
        }
        if (!alive()) return;
        var applied = await api.tryCompleteCalleeAnswer();
        if (!alive()) return;
        if (!applied) {
            api.setCallStatus('Waiting for the other person...');
            api.keepActiveCallVisible('Waiting for the other person...');
        }
    } catch (err) {
        if (!alive()) return;
        api.toast((err && err.message) || 'Unable to accept call.', 'error');
        S.startingCall = false;
        S.acceptingCallId = null;
        var peer = (call.peer && call.peer.name) || '';
        var failConv = call.conversation_id;
        S.currentCall = null;
        try { await api.cleanupMediaOnly(); } catch (cleanErr) { /* ignore */ }
        api.showCallEnded('failed', peer, callId);
        api.refreshCallChat(failConv);
    }
}

api.waitForRemoteOffer = waitForRemoteOffer;
api.tryCompleteCalleeAnswer = tryCompleteCalleeAnswer;
api.acceptIncoming = acceptIncoming;
