import { loadWebrtc } from '../../webrtc/load.js';
import { state } from './state.js';
import { getRoot, unwrapBroadcast, portalTypesMatchJs } from './helpers.js';

function isOwnSignal(payload) {
    if (!payload || payload.from_user_id == null) return false;
    var root = getRoot();
    if (!root) return false;
    var myId = Number(root.dataset.currentUserId || 0);
    var myType = String(root.dataset.portalUserType || '').toLowerCase().trim();
    if (Number(payload.from_user_id) !== myId) return false;
    var fromType = String(payload.from_user_type || '').toLowerCase().trim();
    if (!fromType || !myType) return true;
    return portalTypesMatchJs(fromType, myType);
}

function deliverSignal(payload) {
    if (!payload) return;
    if (window.CommsWebRTC && typeof window.CommsWebRTC.handleSignal === 'function') {
        window.CommsWebRTC.handleSignal(payload);
        return;
    }
    state.pendingSignals.push(payload);
    if (state.pendingSignals.length > 40) state.pendingSignals = state.pendingSignals.slice(-40);
    loadWebrtc().then(function () {
        flushPendingSignals();
    });
}

function signalSignature(payload) {
    if (!payload || typeof payload !== 'object') return '';
    return [
        payload.type || '',
        payload.call_id != null ? payload.call_id : '',
        payload.conversation_id != null ? payload.conversation_id : '',
        payload.from_user_id != null ? payload.from_user_id : '',
        payload.sdp ? 'sdp' : '',
        payload.candidate ? 'ice' : '',
        payload.enabled != null ? String(payload.enabled) : '',
        payload.reason || ''
    ].join('|');
}

function isDuplicateSignal(payload) {
    var key = signalSignature(payload);
    if (!key) return false;
    var now = Date.now();
    var entry = state.seenSignalKeys[key];
    if (entry && (now - entry) < 5000) {
        return true;
    }
    state.seenSignalKeys[key] = now;
    Object.keys(state.seenSignalKeys).forEach(function (k) {
        if (now - state.seenSignalKeys[k] > 30000) {
            delete state.seenSignalKeys[k];
        }
    });
    return false;
}

export function flushPendingSignals() {
    if (!state.pendingSignals.length) return;
    if (!window.CommsWebRTC || typeof window.CommsWebRTC.handleSignal !== 'function') return;
    var queued = state.pendingSignals.slice();
    state.pendingSignals = [];
    queued.forEach(function (payload) {
        try { window.CommsWebRTC.handleSignal(payload); } catch (e) { /* ignore */ }
    });
}

export function handleIncomingSignal(raw) {
    var payload = unwrapBroadcast(raw);
    if (!payload || isOwnSignal(payload)) return;
    if (isDuplicateSignal(payload)) return;
    deliverSignal(payload);
}
