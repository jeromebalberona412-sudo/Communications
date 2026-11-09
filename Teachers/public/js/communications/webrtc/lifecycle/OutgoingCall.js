import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function clearConnectionTimeout() {
    if (S.connectionTimeout) {
        clearTimeout(S.connectionTimeout);
        S.connectionTimeout = null;
    }
}

function armConnectionTimeout() {
    api.clearConnectionTimeout();
    S.connectionTimeout = setTimeout(function () {
        if (!S.currentCall) return;
        var state = S.pc && (S.pc.connectionState || S.pc.iceConnectionState);
        if (state === 'connected' || state === 'completed' || S.callConnected) return;
        api.toast('Call could not connect in time.', 'error');
        api.endCall();
    }, CONNECTION_TIMEOUT_MS);
}

/**
 * Report a live call to the server so a dead tab can be told apart from a
 * real call. Without this the server has to guess and long calls get
 * force-ended (or keep blocking new calls).
 */
function clearPendingStart() {
    if (S.pendingStartTimer) {
        clearTimeout(S.pendingStartTimer);
        S.pendingStartTimer = null;
    }
    if (S.pendingStartTick) {
        clearInterval(S.pendingStartTick);
        S.pendingStartTick = null;
    }
    S.pendingStart = null;
}

async function cancelPendingStart() {
    if (!S.pendingStart) return false;
    api.clearPendingStart();
    S.role = null;
    S.currentCall = null;
    await api.cleanupMediaOnly();
    api.hideEnded();
    api.toast('Call cancelled.', 'info');
    return true;
}

function beginCallCountdown(conversationId, callType, conversation, receiverId) {
    if (S.startingCall || S.pendingStart) return;
    // Stale FE state after a failed/ended call must not block a new start.
    if (S.currentCall) {
        var inCallVisible = S.els.inCall && !S.els.inCall.hidden;
        var incomingVisible = S.els.incoming && !S.els.incoming.hidden;
        if (inCallVisible || incomingVisible || S.callConnected) return;
        S.currentCall = null;
    }

    var peer = (conversation && conversation.other_user) || {};
    if (!api.isPeerCallableOnline(peer)) {
        api.toast((peer.name || 'This contact') + ' is currently offline.', 'error');
        api.showCallEnded('offline', peer.name || 'Contact', null);
        api.setCallStatus('Offline — call ended');
        return;
    }

    try {
        api.assertMediaReady();
    } catch (err) {
        api.toast(err.message || 'Unable to start call.', 'error');
        return;
    }
    if (!window.CommsRealtime || !window.CommsRealtime.enabled) {
        api.toast('Realtime is not configured. Rebuild after setting VITE_SUPABASE keys.', 'error');
        return;
    }

    S.role = 'caller';
    S.callConnected = false;
    S.lastEndedCallId = null;
    S.pendingStart = {
        conversationId: conversationId,
        callType: callType,
        conversation: conversation,
        receiverId: receiverId || null
    };

    peer = peer.name ? peer : { name: 'Contact' };
    var remaining = Math.ceil(CALL_START_DELAY_MS / 1000);
    api.showInCall({ peer: peer, call_type: callType }, 'Starting in ' + remaining + 's...');
    if (S.els.muteBtn) S.els.muteBtn.hidden = true;
    if (S.els.cameraBtn) S.els.cameraBtn.hidden = true;
    api.setCtrlLabel(S.els.endBtn, 'Cancel');

    api.setCallStatus('Starting in ' + remaining + 's — tap Cancel to stop');
    S.pendingStartTick = setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) return;
        api.setCallStatus('Starting in ' + remaining + 's — tap Cancel to stop');
    }, 1000);

    S.pendingStartTimer = setTimeout(function () {
        var queuedReceiverId = S.pendingStart ? S.pendingStart.receiverId : null;
        var queuedConversation = S.pendingStart ? S.pendingStart.conversation : conversation;
        var queuedType = S.pendingStart ? S.pendingStart.callType : callType;
        api.clearPendingStart();
        if (S.els.muteBtn) S.els.muteBtn.hidden = false;
        if (S.els.cameraBtn) S.els.cameraBtn.hidden = false;
        api.setCtrlLabel(S.els.endBtn, 'End');
        // Caller UI: show ringing immediately when countdown ends (before API finishes).
        var callerPeer = (queuedConversation && queuedConversation.other_user) || peer || { name: 'Contact' };
        S.role = 'caller';
        S.callConnected = false;
        api.showInCall({
            peer: callerPeer,
            call_type: queuedType || callType
        }, 'Calling...');
        api.startRingtone('outgoing');
        api.placeCall(conversationId, queuedType || callType, queuedConversation, queuedReceiverId);
    }, CALL_START_DELAY_MS);
}

function isPeerCallableOnline(peer) {
    peer = peer || {};
    var peerId = Number(peer.id || 0);
    var portal = peer.user_type || peer.type || peer.portal || '';
    if (peerId && api.isPresenceOnline(peerId, portal)) {
        return true;
    }
    var status = String(peer.online_status || '').toLowerCase().trim();
    // Unknown status: allow attempt (presence may not have hydrated yet).
    if (!status) {
        return true;
    }
    return status === 'online';
}

function callErrorMessage(err) {
    var msg = (err && err.message) || 'Unable to start call.';
    if (/not allowed to message this account/i.test(msg)) {
        return 'You are not allowed to call this account.';
    }
    if (/currently on another call/i.test(msg)) {
        return msg;
    }
    return msg;
}

async function placeCall(conversationId, callType, conversation, receiverId) {
    if (!window.Comms || S.startingCall) return;
    S.startingCall = true;
    
    // FIX BUG #3: Force stop any existing timer before starting new call
    api.stopCallTimer();
    
    var r = api.routes();
    try {
        api.assertMediaReady();
        if (!window.CommsRealtime || !window.CommsRealtime.enabled) {
            throw new Error('Realtime is not configured. Rebuild after setting VITE_SUPABASE keys.');
        }

        var body = { call_type: callType };
        if (receiverId) {
            body.receiver_id = Number(receiverId);
        }
        var data = await window.Comms.api(window.Comms.route(r.startCall, conversationId), {
            method: 'POST',
            body: JSON.stringify(body),
            dedupe: false
        });
        S.role = 'caller';
        S.callConnected = false;
        S.lastEndedCallId = null;
        S.lastCallDurationMs = 0;
        S.currentCall = data.call;
        api.publishCallNotice(data);
        S.wantsVideo = callType === 'video';
        if (conversation && conversation.other_user && !conversation.other_user.is_group) {
            S.currentCall.peer = conversation.other_user;
        }
        api.rememberCallContext(S.currentCall);
        if (S.els.muteBtn) S.els.muteBtn.hidden = false;
        if (S.els.cameraBtn) S.els.cameraBtn.hidden = false;
        api.setCtrlLabel(S.els.endBtn, 'End');
        api.showInCall(Object.assign({}, S.currentCall, {
            peer: S.currentCall.peer || (conversation && conversation.other_user) || { name: 'Contact' }
        }), 'Ringing...');
        api.startRingtone('outgoing');
        api.armRingTimeout();
        var callerDisplayName = (api.myIdentity().name)
            || document.getElementById('commsPeerName')?.textContent
            || 'Caller';
        // Construct caller_profile from current user's dataset attributes
        var root = api.getCallRoot();
        var caller_profile = {
            name: api.myIdentity().name,
            sk_position: root ? root.dataset.currentUserPosition : '',
            barangay_name: root ? root.dataset.currentUserBarangay : '',
            profile_image_url: root ? root.dataset.currentUserAvatar : ''
        };
        // Subscribe + ring peer immediately (do not wait for getUserMedia / SDP).
        var channelReady = api.subscribeCallChannel(conversationId);
        var ringSignal = api.signalPeer({
            type: 'call-invite',
            call_id: S.currentCall.id,
            conversation_id: conversationId,
            call_type: callType,
            peer_name: callerDisplayName,
            from_name: callerDisplayName,
            caller_id: S.currentCall.caller_id,
            caller_type: S.currentCall.caller_type,
            receiver_id: S.currentCall.receiver_id,
            receiver_type: S.currentCall.receiver_type,
            caller_profile: caller_profile
        });
        await Promise.all([channelReady, ringSignal]);
        api.setCallStatus('Ringing...');
        await api.ensurePeerConnection(S.wantsVideo);
        if (S.wantsVideo) {
            S.cameraEnabled = true;
            var outTrack = api.findLiveVideoTrack();
            if (outTrack) outTrack.enabled = true;
            api.attachLocalVideo();
            api.syncCameraUi();
        }
        var offer = await S.pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: !!S.wantsVideo
        });
        await S.pc.setLocalDescription(offer);
        await api.signalPeer({
            type: 'offer',
            call_id: S.currentCall.id,
            conversation_id: conversationId,
            sdp: offer,
            call_type: callType,
            peer_name: callerDisplayName,
            from_name: callerDisplayName,
            caller_id: S.currentCall.caller_id,
            caller_type: S.currentCall.caller_type,
            receiver_id: S.currentCall.receiver_id,
            receiver_type: S.currentCall.receiver_type,
            caller_profile: caller_profile
        });
        api.setCallStatus('Ringing...');
        api.refreshCallChat(conversationId);
    } catch (err) {
        api.toast(api.callErrorMessage(err), 'error');
        if (S.currentCall && S.currentCall.id) {
            try { await api.updateCallStatus(S.currentCall.id, 'cancelled'); } catch (e) { /* ignore */ }
        }
        S.currentCall = null;
        await api.cleanupMediaOnly();
        api.hideEnded();
    } finally {
        S.startingCall = false;
    }
}

async function startCall(conversationId, callType, conversation, receiverId) {
    // Groups skip offline peer check — recipient is chosen explicitly.
    if (conversation && (conversation.conversation_type === 'group' || conversation.is_default_group || (conversation.other_user && conversation.other_user.is_group))) {
        if (S.startingCall || S.pendingStart || S.currentCall) return;
        try {
            api.assertMediaReady();
        } catch (err) {
            api.toast(api.callErrorMessage(err), 'error');
            return;
        }
        if (!window.CommsRealtime || !window.CommsRealtime.enabled) {
            api.toast('Realtime is not configured. Rebuild after setting VITE_SUPABASE keys.', 'error');
            return;
        }
        api.placeCall(conversationId, callType, conversation, receiverId);
        return;
    }
    api.beginCallCountdown(conversationId, callType, conversation, receiverId);
}


api.clearConnectionTimeout = clearConnectionTimeout;
api.armConnectionTimeout = armConnectionTimeout;
api.clearPendingStart = clearPendingStart;
api.cancelPendingStart = cancelPendingStart;
api.beginCallCountdown = beginCallCountdown;
api.isPeerCallableOnline = isPeerCallableOnline;
api.callErrorMessage = callErrorMessage;
api.placeCall = placeCall;
api.startCall = startCall;
