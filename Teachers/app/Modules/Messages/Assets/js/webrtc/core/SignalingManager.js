import { S, api, refreshEls } from './CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function refreshCallChat(conversationId) {
    if (!window.CommsChat) return;
    if (conversationId && Number(window.CommsChat.getActiveId()) === Number(conversationId)) {
        if (typeof window.CommsChat.reloadActiveMessages === 'function') {
            window.CommsChat.reloadActiveMessages();
            return;
        }
    }
    if (typeof window.CommsChat.reloadConversations === 'function') {
        window.CommsChat.reloadConversations();
    }
}

function routes() {
    if (window.CommsChat && window.CommsChat.routes) {
        return window.CommsChat.routes;
    }
    var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
    if (!boot) {
        return {};
    }
    try {
        return JSON.parse(boot.dataset.routes || '{}');
    } catch (e) {
        return {};
    }
}

function getCallRoot() {
    return document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
}

function myIdentity() {
    var root = api.getCallRoot();
    return {
        id: root ? Number(root.dataset.currentUserId || 0) : 0,
        type: root ? String(root.dataset.portalUserType || '') : '',
        name: root ? String(root.dataset.currentUserName || '') : ''
    };
}

function subscribeCallChannel(conversationId) {
    if (!conversationId || !window.CommsRealtime || typeof window.CommsRealtime.ensureCallChannel !== 'function') {
        return Promise.resolve();
    }
    return window.CommsRealtime.ensureCallChannel(conversationId);
}

function signalTargets() {
    var me = api.myIdentity();
    var peerId = null;
    var peerType = null;
    var peers = [];
    if (!S.currentCall) return { peerId: peerId, peerType: peerType, peers: peers };
    var isGroup = !!(S.currentCall.is_group_call)
        || (Number(S.currentCall.caller_id) === Number(S.currentCall.receiver_id)
            && api.portalTypesMatch(S.currentCall.caller_type, S.currentCall.receiver_type));
    if (!isGroup && S.currentCall.receiver_id != null && S.currentCall.caller_id != null) {
        var idIsCaller = Number(S.currentCall.caller_id) === me.id;
        var idIsReceiver = Number(S.currentCall.receiver_id) === me.id;
        var typeIsCaller = !me.type || api.portalTypesMatch(S.currentCall.caller_type, me.type);
        var typeIsReceiver = !me.type || api.portalTypesMatch(S.currentCall.receiver_type, me.type);
        // Prefer S.role/direction, then ID+type, then ID alone (cross-portal robustness).
        var iAmCaller = S.role === 'caller'
            || S.currentCall.direction === 'outgoing'
            || (idIsCaller && typeIsCaller && !(idIsReceiver && typeIsReceiver))
            || (idIsCaller && !idIsReceiver);
        if (iAmCaller) {
            peerId = S.currentCall.receiver_id;
            peerType = S.currentCall.receiver_type;
        } else {
            peerId = S.currentCall.caller_id;
            peerType = S.currentCall.caller_type;
        }
    }
    if (Array.isArray(S.currentCall.invitees)) {
        peers = S.currentCall.invitees;
    }
    return { peerId: peerId, peerType: peerType, peers: peers };
}

function portalTypesMatch(a, b) {
    a = String(a || '').toLowerCase().trim();
    b = String(b || '').toLowerCase().trim();
    if (!a || !b) return false;
    if (a === b) return true;
    var students = { students: 1, student: 1, kabataan: 1, user: 1 };
    var teachers = { teachers: 1, teacher: 1, sk_official: 1 };
    return !!((students[a] && students[b]) || (teachers[a] && teachers[b]));
}

function isMeOnCallRow(row, asReceiver) {
    var me = api.myIdentity();
    if (!me.id || !row) return false;
    var id = asReceiver ? Number(row.receiver_id) : Number(row.caller_id);
    var type = asReceiver ? row.receiver_type : row.caller_type;
    if (id !== me.id) return false;
    if (!type || !me.type) return true;
    return api.portalTypesMatch(type, me.type);
}

function toast(message, type) {
    if (window.Comms && typeof window.Comms.showToast === 'function') {
        window.Comms.showToast(message, type || 'error');
        return;
    }
    window.alert(message);
}

function signalPeer(payload) {
    if (!window.CommsRealtime) return Promise.resolve();
    
    // Allow signaling even when S.currentCall is null (hangup / busy).
    var conversationId = (S.currentCall && S.currentCall.conversation_id) || payload.conversation_id;
    var callId = (S.currentCall && S.currentCall.id) || payload.call_id;
    
    if (!conversationId) {
        console.warn('Cannot signal: no conversation_id available');
        return Promise.resolve();
    }
    
    var me = api.myIdentity();
    payload.from_user_id = me.id;
    payload.from_user_type = me.type;
    payload.from_name = me.name || payload.from_name;
    payload.call_id = payload.call_id || callId;
    payload.conversation_id = payload.conversation_id || conversationId;
    
    var targets = api.signalTargets();
    var peerId = targets.peerId || payload.to_user_id || payload.peerId;
    var peerType = targets.peerType || payload.to_user_type || payload.peerType;
    if (!peerId && payload.caller_id != null && payload.receiver_id != null) {
        var iAmCaller = Number(payload.caller_id) === me.id
            && (!me.type || !payload.caller_type || api.portalTypesMatch(payload.caller_type, me.type));
        peerId = iAmCaller ? payload.receiver_id : payload.caller_id;
        peerType = iAmCaller ? payload.receiver_type : payload.caller_type;
    }
    api.subscribeCallChannel(conversationId);
    return window.CommsRealtime.broadcastSignal(conversationId, payload, {
        peerId: peerId,
        peerType: peerType,
        peers: targets.peers
    });
}

function signalMediaState() {
    if (!S.currentCall) return;
    var micOn = true;
    if (S.localStream && typeof S.localStream.getAudioTracks === 'function') {
        var audioTracks = S.localStream.getAudioTracks();
        micOn = !audioTracks.length || audioTracks.some(function (t) { return t.enabled; });
    }
    api.signalPeer({
        type: 'camera-state',
        call_id: S.currentCall.id,
        conversation_id: S.currentCall.conversation_id,
        enabled: !!S.cameraEnabled
    });
    api.signalPeer({
        type: 'mic-state',
        call_id: S.currentCall.id,
        conversation_id: S.currentCall.conversation_id,
        enabled: !!micOn
    });
}

function publishCallNotice(data) {
    var notice = data && data.message;
    if (!notice || !window.CommsChat || typeof window.CommsChat.publishSentMessage !== 'function') return;
    var peers = (data.call && data.call.invitees) || [];
    window.CommsChat.publishSentMessage(notice, peers);
    if (typeof window.CommsChat.appendMessage === 'function'
        && typeof window.CommsChat.publishSentMessage !== 'function') {
        window.CommsChat.appendMessage(notice);
    }
}

async function updateCallStatus(callId, status) {
    var r = api.routes();
    if (!r.callStatus || !window.Comms) return null;
    return window.Comms.api(window.Comms.route(r.callStatus, callId), {
        method: 'POST',
        body: JSON.stringify({ status: status }),
        dedupe: false
    }).then(function (data) {
        api.publishCallNotice(data);
        return data.call;
    });
}

function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
        var settled = false;
        var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            resolve(null);
        }, ms);
        Promise.resolve(promise).then(function (value) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        }).catch(function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(null);
        });
    });
}

/**
 * Authoritative call state (status, started_at, ended_at, duration).
 */
function fetchCallState(callId) {
    var r = api.routes();
    if (!r.callShow || !callId || !window.Comms || typeof window.Comms.api !== 'function') {
        return Promise.resolve(null);
    }
    return window.Comms.api(window.Comms.route(r.callShow, callId), {
        method: 'GET',
        dedupe: false
    }).then(function (data) {
        return (data && data.call) || null;
    }).catch(function () { return null; });
}

function sameCall(payload) {
    if (!payload || payload.call_id == null) return false;
    if (!S.currentCall) return false;
    return Number(S.currentCall.id) === Number(payload.call_id);
}

function signalType(payload) {
    var t = String((payload && payload.type) || '');
    if (t === 'call-invite') return 'incoming-call';
    if (t === 'call-accept') return 'call-accepted';
    if (t === 'call-end' || t === 'call-reject') return 'hangup';
    if (t === 'camera-state') return 'camera';
    if (t === 'mic-state' || t === 'mic') return 'mic';
    if (t === 'ice-candidate') return 'ice';
    if (t === 'busy') return 'call-busy';
    return t;
}

function replyBusy(payload) {
    if (!payload || !payload.conversation_id || !window.CommsRealtime) return;
    var me = api.myIdentity();
    window.CommsRealtime.broadcastSignal(payload.conversation_id, {
        type: 'call-busy',
        call_id: payload.call_id,
        conversation_id: payload.conversation_id,
        from_user_id: me.id,
        from_user_type: me.type
    }, {
        peerId: payload.from_user_id || payload.caller_id,
        peerType: payload.from_user_type || payload.caller_type
    });
}


api.refreshCallChat = refreshCallChat;
api.routes = routes;
api.getCallRoot = getCallRoot;
api.myIdentity = myIdentity;
api.subscribeCallChannel = subscribeCallChannel;
api.signalTargets = signalTargets;
api.portalTypesMatch = portalTypesMatch;
api.isMeOnCallRow = isMeOnCallRow;
api.toast = toast;
api.signalPeer = signalPeer;
api.signalMediaState = signalMediaState;
api.publishCallNotice = publishCallNotice;
api.updateCallStatus = updateCallStatus;
api.withTimeout = withTimeout;
api.fetchCallState = fetchCallState;
api.sameCall = sameCall;
api.signalType = signalType;
api.replyBusy = replyBusy;
