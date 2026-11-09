import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

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
        }, 20);
    });
}

async function acceptIncoming() {
    api.stopRingtone();
    api.clearRingTimeout();
    if (typeof window.CommsWebRTC !== 'undefined'
        && typeof window.CommsWebRTC.__acceptGroupIfPending === 'function') {
        try {
            var groupHandled = await window.CommsWebRTC.__acceptGroupIfPending();
            if (groupHandled) {
                api.hideIncoming();
                api.stopRingtone();
                return;
            }
        } catch (err) {
            api.toast((err && err.message) || 'Unable to join group call.', 'error');
            return;
        }
    }

    // Answer must apply to the exact call id shown in the modal.
    var modalCallId = S.incomingCallId != null ? Number(S.incomingCallId) : null;
    var source = (modalCallId != null && S.incomingCall && Number(S.incomingCall.id) === modalCallId)
        ? S.incomingCall
        : S.currentCall;
    if (!source || S.startingCall) return;
    if (modalCallId != null && Number(source.id) !== modalCallId) {
        // The modal belongs to a different call — never answer the wrong one.
        return;
    }
    if (modalCallId != null && S.answeredCallIds[modalCallId]) return;

    // From here on the call object is the one the user accepted.
    var call = Object.assign({}, S.currentCall || {}, source);
    S.currentCall = call;

    S.startingCall = true;
    var acceptedCallId = call.id != null ? Number(call.id) : null;
    if (acceptedCallId) api.markCallTerminal(acceptedCallId);
    if (acceptedCallId) api.rememberCallId(S.answeredCallIds, acceptedCallId);
    S.answeredCall = call;

    // FIX BUG #3: Force stop any existing timer before accepting new call
    api.stopCallTimer();

    api.clearRingTimeout();
    api.stopRingtone();
    api.hideIncoming();
    try {
        api.assertMediaReady();
        api.showInCall(call, 'Connecting...');
        api.unlockRemotePlayback();
        api.armConnectionTimeout();
        S.wantsVideo = call.call_type === 'video';
        var acceptJobs = [
            api.subscribeCallChannel(call.conversation_id),
            api.signalPeer({
                type: 'call-accept',
                call_id: call.id,
                conversation_id: call.conversation_id,
                caller_id: call.caller_id,
                caller_type: call.caller_type,
                receiver_id: call.receiver_id,
                receiver_type: call.receiver_type
            }),
            api.ensurePeerConnection(S.wantsVideo)
        ];
        api.updateCallStatus(call.id, 'accepted').then(function (accepted) {
            if (accepted && S.currentCall && Number(S.currentCall.id) === Number(accepted.id)) {
                S.currentCall = Object.assign({}, S.currentCall, accepted);
                S.answeredCall = S.currentCall;
            }
        }).catch(function () {});
        await Promise.all(acceptJobs);
        if (S.wantsVideo) {
            S.cameraEnabled = true;
            var pickupTrack = api.findLiveVideoTrack();
            if (pickupTrack) pickupTrack.enabled = true;
            api.attachLocalVideo();
            api.syncCameraUi();
        }
        if (!call._remoteOffer && S.currentCall && S.currentCall._remoteOffer) {
            call._remoteOffer = S.currentCall._remoteOffer;
        }
        if (!call._remoteOffer) {
            await api.waitForRemoteOffer(8000);
        }
        if (!call._remoteOffer && S.currentCall && S.currentCall._remoteOffer) {
            call._remoteOffer = S.currentCall._remoteOffer;
        }
        api.keepActiveCallVisible('Connecting...');
        api.startCallHeartbeat();
        if (call._remoteOffer && S.pc) {
            await S.pc.setRemoteDescription(call._remoteOffer);
            var answer = await S.pc.createAnswer();
            await S.pc.setLocalDescription(answer);
            await api.signalPeer({
                type: 'answer',
                call_id: call.id,
                conversation_id: call.conversation_id,
                sdp: answer,
                caller_id: call.caller_id,
                caller_type: call.caller_type,
                receiver_id: call.receiver_id,
                receiver_type: call.receiver_type,
                started_at: call.started_at || call.answered_at || null,
                server_time: call.server_time || null
            });
            while (S.iceQueue.length) {
                await S.pc.addIceCandidate(S.iceQueue.shift());
            }
            api.setCallStatus('Connecting...');
            api.attachLocalVideo();
            api.signalMediaState();
        } else {
            api.setCallStatus('Connecting...');
            api.keepActiveCallVisible('Connecting...');
        }
    } catch (err) {
        api.toast(err.message || 'Unable to accept call.', 'error');
        api.keepActiveCallVisible('Connecting...');
        if (!S.pc && !S.localStream) {
            if (call && call.id) {
                try { await api.updateCallStatus(call.id, 'rejected'); } catch (e) { /* ignore */ }
            }
            var peer = (call && call.peer && call.peer.name) || '';
            var failId = call && call.id;
            var failConv = call && call.conversation_id;
            S.currentCall = null;
            await api.cleanupMediaOnly();
            api.showCallEnded('rejected', peer, failId);
            api.refreshCallChat(failConv);
        }
    }
}


api.waitForRemoteOffer = waitForRemoteOffer;
api.acceptIncoming = acceptIncoming;
