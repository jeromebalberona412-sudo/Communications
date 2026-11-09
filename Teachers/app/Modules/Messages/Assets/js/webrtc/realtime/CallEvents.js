import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

var ringingPollTimer = null;

function applyPeerAnswered() {
    api.stopRingtone();
    api.stopVibration();
    api.clearRingTimeout();
    var cid = S.currentCall && S.currentCall.id != null ? Number(S.currentCall.id) : null;
    if (cid != null) api.rememberCallId(S.answeredCallIds, cid);
    if (S.peerAnsweredFor != null && cid != null && S.peerAnsweredFor === cid) {
        api.keepActiveCallVisible(S.callConnected ? 'Connected' : 'Connecting...');
        api.attachLocalVideo();
        return;
    }
    S.peerAnsweredFor = cid;
    S.startingCall = true;
    S.role = 'caller';
    api.keepActiveCallVisible('Connecting...');
    api.armConnectionTimeout();
    api.attachLocalVideo();
    api.updateCameraUi();
    api.unlockRemotePlayback();
    var ice = S.pc && (S.pc.iceConnectionState || S.pc.connectionState);
    if (ice === 'connected' || ice === 'completed') {
        S.callConnected = true;
        api.setCallStatus('Connected');
        api.maybeStartConnectedTimer();
    }
    api.startCallHeartbeat();
    api.signalMediaState();
}

async function handleSignal(payload) {
    if (!payload || !payload.type) return;
    payload = Object.assign({}, payload, { type: api.signalType(payload) });

    if (payload.type === 'incoming-call' || payload.type === 'offer') {
        var meOffer = api.myIdentity();
        var iAmOfferCaller = Number(payload.caller_id) === meOffer.id
            && (!meOffer.type || api.portalTypesMatch(payload.caller_type, meOffer.type));
        if (iAmOfferCaller) return;

        var signalCallId = payload.call_id != null ? Number(payload.call_id) : null;
        // Terminal calls: ignore BOTH stale incoming-call AND late offers (except renegotiation
        // while actively in that same call). Late offers after Decline used to re-open the modal.
        if (signalCallId && api.isCallAlreadyHandled(signalCallId)) {
            var sameActiveCall = S.currentCall && Number(S.currentCall.id) === signalCallId;
            if (payload.type === 'offer' && payload.sdp && sameActiveCall && !S.decliningCall) {
                S.currentCall._remoteOffer = payload.sdp;
                if (typeof api.tryCompleteCalleeAnswer === 'function') {
                    api.tryCompleteCalleeAnswer();
                }
                return;
            }
            if (!(payload.type === 'offer' && payload.sdp && api.isActivelyInCall(signalCallId) && S.callConnected)) {
                return;
            }
        }
        if (signalCallId && api.isActivelyInCall(signalCallId) && payload.type === 'incoming-call') {
            return;
        }
        if (S.callConnected && S.currentCall && payload.type === 'incoming-call'
            && Number(S.currentCall.id) !== Number(payload.call_id)) {
            api.replyBusy(payload);
            return;
        }
        if (S.callConnected && S.currentCall && payload.type === 'incoming-call') {
            return;
        }

        if (payload.type === 'offer' && payload.sdp && S.currentCall && S.pc && S.callConnected
            && Number(S.currentCall.id) === Number(payload.call_id)) {
            try {
                if (S.pc.signalingState === 'have-local-offer') {
                    try { await S.pc.setLocalDescription({ type: 'rollback' }); } catch (rbErr) { /* ignore */ }
                }
                if (S.pc.signalingState === 'stable') {
                    await S.pc.setRemoteDescription(payload.sdp);
                    var renegoAnswer = await S.pc.createAnswer();
                    await S.pc.setLocalDescription(renegoAnswer);
                    await api.signalPeer({
                        type: 'answer',
                        call_id: S.currentCall.id,
                        conversation_id: S.currentCall.conversation_id,
                        sdp: renegoAnswer,
                        renegotiate: true
                    });
                    api.unlockRemotePlayback();
                    api.updateCameraUi();
                    api.scheduleRemoteVideoUiRefresh();
                } else {
                    S.currentCall._remoteOffer = payload.sdp;
                }
            } catch (renegoErr) {
                S.currentCall._remoteOffer = payload.sdp;
            }
            return;
        }

        if (S.role === 'caller' && api.sameCall(payload)) return;
        if (payload.type === 'offer' && S.currentCall && S.currentCall._remoteOffer
            && Number(S.currentCall.id) === Number(payload.call_id)) {
            S.currentCall._remoteOffer = payload.sdp;
            if (!payload.renegotiate && typeof api.tryCompleteCalleeAnswer === 'function') {
                api.tryCompleteCalleeAnswer();
            }
            return;
        }
        S.lastEndedCallId = null;
        S.role = 'callee';
        S.currentCall = Object.assign({}, S.currentCall || {}, {
            id: payload.call_id,
            conversation_id: payload.conversation_id || (window.CommsChat && window.CommsChat.getActiveId()),
            call_type: payload.call_type || 'voice',
            peer: {
                name: payload.peer_name || payload.from_name
                    || (S.currentCall && S.currentCall.peer && S.currentCall.peer.name)
                    || 'Incoming caller'
            },
            caller_id: payload.caller_id,
            caller_type: payload.caller_type,
            receiver_id: payload.receiver_id,
            receiver_type: payload.receiver_type,
            caller_profile: payload.caller_profile || (S.currentCall && S.currentCall.caller_profile) || null,
            _remoteOffer: payload.type === 'offer' ? payload.sdp : (S.currentCall && S.currentCall._remoteOffer)
        });
        api.subscribeCallChannel(S.currentCall.conversation_id);
        api.showIncoming(S.currentCall);
        return;
    }

    if (payload.type === 'call-busy') {
        if (payload.call_id != null && S.currentCall && Number(S.currentCall.id) !== Number(payload.call_id)) return;
        if (!S.currentCall || S.callConnected) return;
        api.toast('The other person is on another call.', 'error');
        await api.finishUnanswered('rejected');
        return;
    }

    if (payload.type === 'call-accepted' || payload.type === 'accepted') {
        if (payload.call_id != null && S.currentCall && Number(S.currentCall.id) !== Number(payload.call_id)) {
            return;
        }
        var meAccept = api.myIdentity();
        var iAmCallerAccept = S.currentCall
            && Number(S.currentCall.caller_id) === meAccept.id
            && (!meAccept.type || api.portalTypesMatch(S.currentCall.caller_type, meAccept.type)
                || Number(S.currentCall.caller_id) === meAccept.id);
        if (S.role === 'callee' && !iAmCallerAccept) return;
        if (!S.currentCall && payload.call_id == null) return;
        S.role = 'caller';
        api.applyPeerAnswered();
        return;
    }

    if (payload.type === 'hangup' || payload.type === 'call-end') {
        // FIX BUG #3: Handle both 'hangup' (old) and 'call-end' (new) signal types
        var hangupMatchesIncoming = S.incomingCallId != null
            && payload.call_id != null
            && Number(S.incomingCallId) === Number(payload.call_id);
        if (S.currentCall && payload.call_id != null && Number(S.currentCall.id) !== Number(payload.call_id)
            && !hangupMatchesIncoming) {
            return;
        }
        if (!S.currentCall && !hangupMatchesIncoming && !(S.els.inCall && !S.els.inCall.hidden)
            && !(S.els.incoming && !S.els.incoming.hidden)) {
            if (payload.call_id != null) api.markCallTerminal(payload.call_id);
            return;
        }
        var reason = payload.reason || 'ended';
        var peerName = (S.currentCall && S.currentCall.peer && S.currentCall.peer.name) || '';
        var hangupId = (S.currentCall && S.currentCall.id) || payload.call_id;
        var hangupConv = (S.currentCall && S.currentCall.conversation_id) || payload.conversation_id;
        
        // CRITICAL FIX: Mark call as terminal and cleanup IMMEDIATELY
        if (hangupId != null) api.markCallTerminal(hangupId);
        S.acceptGeneration = (S.acceptGeneration || 0) + 1;
        S.acceptingCallId = null;
        api.stopCallTimer();
        api.stopRingtone();
        api.stopVibration();
        api.hideIncoming();
        
        S.currentCall = null;
        S.role = null;
        await api.cleanupMediaOnly();
        
        // CRITICAL FIX: Show "Call Ended" UI IMMEDIATELY, fetch server state in background
        // Don't await server fetch - it can take up to 4 seconds
        api.showCallEnded(reason, peerName, hangupId, payload.ended_by_role, null);
        
        // Fetch authoritative timestamps in background and update UI if different
        api.withTimeout(api.fetchCallState(hangupId), 4000).then(function(serverState) {
            if (serverState && serverState.duration_seconds != null) {
                // Update duration display if server has more accurate data
                var endedEl = document.querySelector('[data-call-ended-id="' + hangupId + '"]');
                if (endedEl && serverState.duration_seconds > 0) {
                    var durationText = formatCallDuration(serverState.duration_seconds);
                    var durationDisplay = endedEl.querySelector('.call-duration');
                    if (durationDisplay) durationDisplay.textContent = durationText;
                }
            }
        }).catch(function() { /* ignore server fetch errors */ });
        
        api.refreshCallChat(hangupConv);
        return;
    }

    if (payload.type === 'camera-state' || payload.type === 'camera') {
        if (S.currentCall && payload.call_id != null && Number(S.currentCall.id) !== Number(payload.call_id)) {
            return;
        }
        if (payload.seq != null) {
            var incomingSeq = Number(payload.seq);
            if (!isNaN(incomingSeq) && incomingSeq < S.remoteCameraSeq) {
                return;
            }
            if (!isNaN(incomingSeq)) S.remoteCameraSeq = incomingSeq;
        }
        S.remoteCameraEnabled = payload.enabled !== false;
        api.refreshRemoteFromReceivers();
        api.unlockRemotePlayback();
        api.updateCameraUi();
        return;
    }

    if (payload.type === 'mic-state' || payload.type === 'mic') {
        if (S.currentCall && payload.call_id != null && Number(S.currentCall.id) !== Number(payload.call_id)) {
            return;
        }
        S.remoteMicEnabled = payload.enabled !== false;
        api.updateCameraUi();
        return;
    }

    if (payload.type === 'answer') {
        if (payload.call_id != null && S.currentCall && Number(S.currentCall.id) !== Number(payload.call_id)) {
            return;
        }
        if (!S.currentCall) return;
        api.stopRingtone();
        api.stopVibration();

        var isRenego = !!(payload.renegotiate) || (S.callConnected && S.pc && S.pc.signalingState === 'have-local-offer');
        if (S.role === 'callee' && !isRenego) return;

        if (S.pc && payload.sdp && (S.pc.signalingState === 'have-local-offer' || S.pc.signalingState === 'stable')) {
            try {
                if (S.pc.signalingState === 'have-local-offer') {
                    await S.pc.setRemoteDescription(payload.sdp);
                }
                while (S.iceQueue.length) {
                    await S.pc.addIceCandidate(S.iceQueue.shift());
                }
            } catch (e) { /* ignore duplicate/stale SDP */ }
        }

        if (isRenego && S.callConnected) {
            api.unlockRemotePlayback();
            api.updateCameraUi();
            api.scheduleRemoteVideoUiRefresh();
            return;
        }

        if (S.role === 'callee' && !isRenego) return;
        api.applyPeerAnswered();
        if (payload.started_at || payload.answered_at) {
            S.currentCall = Object.assign({}, S.currentCall || {}, {
                started_at: payload.started_at || payload.answered_at,
                server_time: payload.server_time || null
            });
        }
        api.refreshCallChat(S.currentCall && S.currentCall.conversation_id);
        return;
    }

    if ((payload.type === 'ice' || payload.type === 'ice-candidate') && payload.candidate) {
        if (!api.sameCall(payload)) return;
        if (!S.pc || !S.pc.remoteDescription) {
            S.iceQueue.push(payload.candidate);
        } else {
            try { await S.pc.addIceCandidate(payload.candidate); } catch (e) { /* ignore */ }
        }
    }
}

function handleCallRow(payload) {
    var row = (payload && payload.new) || null;
    if (!row) return;
    var isReceiver = api.isMeOnCallRow(row, true);
    var isCaller = api.isMeOnCallRow(row, false);
    var isGroupRow = !!(row.is_group_call)
        || (Number(row.caller_id) === Number(row.receiver_id)
            && String(row.caller_type || '') === String(row.receiver_type || ''));

    // Group invitees are neither caller nor receiver on the DB row (placeholder self-receiver).
    if (!isReceiver && !isCaller && !(isGroupRow && row.status === 'ringing')) return;

    if (isGroupRow && row.status === 'ringing' && !isCaller
        && typeof window.CommsWebRTC.__showIncomingGroup === 'function') {
        if (row.id != null && api.isCallAlreadyHandled(row.id)) return;
        window.CommsWebRTC.__showIncomingGroup({
            call_id: row.id,
            conversation_id: row.conversation_id,
            call_type: row.call_type,
            caller_id: row.caller_id,
            caller_type: row.caller_type,
            peer_name: (row.peer && row.peer.name) || 'Group call',
            invitees: row.invitees || [],
            call_max_participants: row.call_max_participants,
            is_group_call: true
        });
        return;
    }

    if (row.status === 'ringing' && S.currentCall && Number(S.currentCall.id) === Number(row.id)
        && (S.answeredCallIds[Number(row.id)] || S.startingCall || S.callConnected || S.peerAnsweredFor === Number(row.id))) {
        return;
    }

    if (row.status === 'ringing' && isReceiver && !isGroupRow) {
        if (row.id != null && (api.isCallAlreadyHandled(row.id) || api.isActivelyInCall(row.id))) return;
        S.role = 'callee';
        S.currentCall = Object.assign({}, S.currentCall || {}, {
            id: row.id,
            conversation_id: row.conversation_id,
            call_type: row.call_type,
            caller_id: row.caller_id,
            caller_type: row.caller_type,
            receiver_id: row.receiver_id,
            receiver_type: row.receiver_type,
            peer: (S.currentCall && S.currentCall.peer) || { name: 'Incoming caller' }
        });
        api.subscribeCallChannel(row.conversation_id);
        api.showIncoming(S.currentCall);
        return;
    }

    if (row.status === 'accepted') {
        if (row.id != null) api.markCallTerminal(row.id);
        api.hideIncoming();
        api.stopRingtone();
        api.stopVibration();
        var mineOutgoing = isCaller || (S.role === 'caller' && S.currentCall && Number(S.currentCall.id) === Number(row.id));
        if (mineOutgoing) {
            S.role = 'caller';
            if (!S.currentCall || Number(S.currentCall.id) !== Number(row.id)) {
                S.currentCall = Object.assign({}, S.currentCall || {}, {
                    id: row.id,
                    conversation_id: row.conversation_id,
                    call_type: row.call_type,
                    caller_id: row.caller_id,
                    caller_type: row.caller_type,
                    receiver_id: row.receiver_id,
                    receiver_type: row.receiver_type
                });
            }
            api.applyPeerAnswered();
        } else if (S.currentCall && Number(S.currentCall.id) === Number(row.id)) {
            api.keepActiveCallVisible(S.callConnected ? 'Connected' : 'Connecting...');
        }
        return;
    }

    if (['rejected', 'cancelled', 'ended', 'missed'].indexOf(row.status) !== -1) {
        if (row.id != null) api.markCallTerminal(row.id);
        api.hideIncoming();
        api.stopRingtone();
        if (row.id != null && S.summaryShownFor[String(row.id)]) {
            if (S.currentCall && Number(S.currentCall.id) === Number(row.id)) {
                S.currentCall = null;
                api.cleanupMediaOnly();
            }
            api.refreshCallChat(row.conversation_id);
            return;
        }
        if (S.currentCall && Number(S.currentCall.id) === Number(row.id)) {
            var peerName = (S.currentCall.peer && S.currentCall.peer.name) || '';
            var rowId = row.id;
            var rowConv = row.conversation_id;
            var endedBy = isCaller
                ? (row.status === 'cancelled' ? 'caller' : null)
                : (row.status === 'cancelled' ? 'caller' : (row.status === 'rejected' ? 'callee' : null));
            S.currentCall = null;
            S.lastIncomingCallId = null;
            api.cleanupMediaOnly().then(function () {
                api.showCallEnded(row.status, peerName, rowId, endedBy);
                api.refreshCallChat(rowConv);
            });
        } else if (isReceiver && S.els.incoming && !S.els.incoming.hidden
            && Number(S.lastIncomingCallId) === Number(row.id)) {
            api.hideIncoming();
            api.stopRingtone();
            S.lastIncomingCallId = null;
            api.refreshCallChat(row.conversation_id);
        } else {
            api.refreshCallChat(row.conversation_id);
        }
    }
}

/**
 * Fallback when the realtime invitation was missed (tab was closed, the
 * socket dropped, the broadcast arrived before the subscription).
 *
 * The endpoint also returns `active_call`, the authoritative answer to
 * "am I in a call right now?" — stale local state is reconciled with it.
 */
function syncIncomingFromServer(conversationId) {
    api.resetCallerRoleIfIdle();
    if (api.isOutboundCallerBusy()) return;
    if (api.isLiveAcceptedCall()) return;
    if (S.els.incoming && !S.els.incoming.hidden) return;
    if (api.isActivelyInCall(null) && S.callConnected) return;
    var r = api.routes();
    var url = r.ringingCalls || r.calls;
    if (!url || !window.Comms || typeof window.Comms.api !== 'function') return;

    window.clearTimeout(S.incomingSyncTimer);
    S.incomingSyncTimer = window.setTimeout(function () {
        api.resetCallerRoleIfIdle();
        if (api.isOutboundCallerBusy()) return;
        if (api.isLiveAcceptedCall()) return;
        if (api.isActivelyInCall(null) && S.callConnected) return;
        window.Comms.api(url, { method: 'GET', dedupe: true }).then(function (data) {
            api.reconcileWithServerState(data);
            api.resetCallerRoleIfIdle();
            if (api.isOutboundCallerBusy()) return;
            if (api.isLiveAcceptedCall()) return;
            if (S.els.incoming && !S.els.incoming.hidden) return;
            if (api.isActivelyInCall(null) && S.callConnected) return;
            var me = api.myIdentity();
            var list = (data && data.calls) || [];
            var ringing = null;
            for (var i = 0; i < list.length; i += 1) {
                var c = list[i];
                if (!c || String(c.status) !== 'ringing') continue;
                if (c.id != null && api.isCallAlreadyHandled(c.id)) continue;
                if (conversationId && Number(c.conversation_id) !== Number(conversationId)) continue;
                var groupRing = !!(c.is_group_call)
                    || (Number(c.caller_id) === Number(c.receiver_id)
                        && String(c.caller_type || '') === String(c.receiver_type || ''));
                if (groupRing) {
                    var iAmHost = Number(c.caller_id) === me.id
                        && (!c.caller_type || !me.type || api.portalTypesMatch(c.caller_type, me.type));
                    if (iAmHost) continue;
                    if (typeof window.CommsWebRTC.__showIncomingGroup === 'function') {
                        window.CommsWebRTC.__showIncomingGroup({
                            call_id: c.id,
                            conversation_id: c.conversation_id,
                            call_type: c.call_type,
                            caller_id: c.caller_id,
                            caller_type: c.caller_type,
                            peer_name: (c.peer && c.peer.name) || 'Group call',
                            invitees: c.invitees || [],
                            call_max_participants: c.call_max_participants,
                            is_group_call: true
                        });
                        return;
                    }
                    continue;
                }
                if (Number(c.receiver_id) !== me.id) continue;
                if (c.receiver_type && me.type && !api.portalTypesMatch(c.receiver_type, me.type)) continue;
                ringing = c;
                break;
            }
            if (!ringing) {
                for (var j = 0; j < list.length; j += 1) {
                    var row = list[j];
                    if (!row || String(row.status) !== 'ringing') continue;
                    if (row.id != null && api.isCallAlreadyHandled(row.id)) continue;
                    if (Number(row.receiver_id) !== me.id) continue;
                    if (conversationId && Number(row.conversation_id) !== Number(conversationId)) continue;
                    if (Number(row.caller_id) === Number(row.receiver_id)) continue;
                    ringing = row;
                    break;
                }
            }
            if (ringing) {
                S.role = 'callee';
                api.showIncoming(ringing);
                api.subscribeCallChannel(ringing.conversation_id);
            }
        }).catch(function () { /* ignore */ });
    }, 50);
}

/**
 * Reconcile the local call state with the server's authoritative answer.
 *
 * The server never keeps a terminal call active, so a call that the server
 * does not know about any more must be released locally. This is what
 * removes the false "You are currently on another call" warning.
 */
function startRingingPoll() {
    if (ringingPollTimer) return;
    api.syncIncomingFromServer(null);
    ringingPollTimer = window.setInterval(function () {
        if (document.visibilityState === 'hidden') return;
        api.resetCallerRoleIfIdle();
        if (api.isOutboundCallerBusy()) return;
        if (api.isLiveAcceptedCall()) return;
        if (S.els.incoming && !S.els.incoming.hidden) return;
        if (api.isActivelyInCall(null) && S.callConnected) return;
        api.syncIncomingFromServer(null);
    }, api.ringingPollIntervalMs());
}


api.applyPeerAnswered = applyPeerAnswered;
api.handleSignal = handleSignal;
api.handleCallRow = handleCallRow;
api.syncIncomingFromServer = syncIncomingFromServer;
api.startRingingPoll = startRingingPoll;
