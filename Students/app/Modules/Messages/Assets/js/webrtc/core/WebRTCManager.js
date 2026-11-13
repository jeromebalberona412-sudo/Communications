import { S, api, refreshEls } from './CallStateManager.js';
import { CALL_BUILD } from '../utils/WebRTCConfig.js';
import { callInfo } from '../utils/CallLogger.js';
import { bindCallControls } from '../controls/CallControls.js';

function reconcileWithServerState(data) {
    if (!data) return;
    var active = data.active_call || null;
    var activeId = active && active.id != null ? Number(active.id) : null;

    if (!activeId) {
        if (api.isLiveAcceptedCall()) {
            api.keepActiveCallVisible(S.callConnected ? 'Connected' : '');
            return;
        }
        if (S.currentCall && S.currentCall.id) {
            var staleId = Number(S.currentCall.id);
            if (staleId !== S.lastEndedCallId && !api.isCallAlreadyHandled(staleId)) {
                if (!S.callConnected && !S.startingCall && !S.pc && !S.ringingPreview
                    && !(S.els.incoming && !S.els.incoming.hidden)) {
                    api.markCallTerminal(staleId);
                    S.currentCall = null;
                    S.role = null;
                }
            }
        }
        return;
    }

    if (!S.currentCall && !S.callConnected && activeId !== S.lastEndedCallId
        && !api.isCallAlreadyHandled(activeId)) {
        S.currentCall = Object.assign({}, active);
        S.role = (active.direction === 'outgoing') ? 'caller' : 'callee';
    }
}

function ringingPollIntervalMs() {
    var ms = Number(window.__COMMS_CALL_POLL_MS__) || 2000;
    return Math.max(1500, Math.min(ms, 4000));
}

function presenceOnlineKey(userId, portalType) {
    var id = Number(userId || 0);
    if (!id) return '';
    var portal = String(portalType || '').trim().toLowerCase();
    return portal ? (portal + ':' + id) : String(id);
}

function isPresenceOnline(userId, portalType) {
    var map = window.__COMMS_PRESENCE_ONLINE_IDS__ || {};
    var typed = presenceOnlineKey(userId, portalType);
    if (typed && map[typed]) return true;
    var id = Number(userId || 0);
    return !!(id && map[id] && !portalType);
}

api.reconcileWithServerState = reconcileWithServerState;
api.ringingPollIntervalMs = ringingPollIntervalMs;
api.presenceOnlineKey = presenceOnlineKey;
api.isPresenceOnline = isPresenceOnline;

export function exposePublicApi() {
    window.CommsWebRTC = {
        startCall: function () { return api.startCall.apply(null, arguments); },
        handleSignal: function () { return api.handleSignal.apply(null, arguments); },
        handleCallRow: function () { return api.handleCallRow.apply(null, arguments); },
        syncIncomingFromServer: function () { return api.syncIncomingFromServer.apply(null, arguments); },
        endCall: function () { return api.endCall.apply(null, arguments); },
        canUseMedia: function () {
            try { return !!api.resolveMediaDevices(); } catch (e) { return false; }
        },
        suggestedHttpsUrl: function () { return api.suggestedHttpsUrl(); },
        __paintIncoming: function () { return api.showIncoming.apply(null, arguments); },
        __showEnded: function () { return api.showCallEnded.apply(null, arguments); },
        __rememberCall: function () { return api.rememberCallContext.apply(null, arguments); },
        __startTimer: function () { return api.startTimer.apply(null, arguments); },
        __syncTimer: function (startedAt, serverTime) {
            if (typeof api.publishDuration === 'function') api.publishDuration(startedAt, serverTime);
        },
        __forceStopCall: function () {
            S.callConnected = false;
            S.callAnswered = false;
            S.startingCall = false;
            S.acceptingCallId = null;
            if (typeof api.stopCallTimer === 'function') api.stopCallTimer();
            if (typeof api.stopRingtone === 'function') api.stopRingtone();
            if (typeof api.hideIncoming === 'function') api.hideIncoming();
        },
        __markAnswered: function (callId) {
            S.callAnswered = true;
            var id = callId != null ? Number(callId) : (S.incomingCallId || (S.currentCall && S.currentCall.id) || 0);
            if (id && typeof api.rememberCallId === 'function') api.rememberCallId(S.answeredCallIds, id);
            if (typeof api.stopRingtone === 'function') api.stopRingtone();
            if (typeof api.hideIncoming === 'function') api.hideIncoming();
        },
        __stopCallTimer: function () { return api.stopCallTimer.apply(null, arguments); },
        primeOutgoingRingtone: function () { return api.primeOutgoingRingtone(); },
        __startRingtone: function () { return api.startRingtone.apply(null, arguments); },
        __stopRingtone: function () { return api.stopRingtone.apply(null, arguments); }
    };
}

export function bootOneToOne() {
    if (window.CommsWebRTC && window.CommsWebRTC.__bootedOneToOne) {
        return window.CommsWebRTC;
    }
    window.CALL_DEBUG = true;
    callInfo('build ' + CALL_BUILD + ' | modular WebRTCManager loaded');
    refreshEls();
    if (typeof api.mountCallUiToBody === 'function') api.mountCallUiToBody();
    bindCallControls();
    if (typeof api.showSecureContextBanner === 'function') api.showSecureContextBanner();
    if (typeof api.bindRingtoneUnlock === 'function') api.bindRingtoneUnlock();
    exposePublicApi();
    window.CommsWebRTC.__bootedOneToOne = true;
    if (typeof api.startRingingPoll === 'function') api.startRingingPoll();
    if (window.CommsRealtime && typeof window.CommsRealtime.flushPendingSignals === 'function') {
        window.CommsRealtime.flushPendingSignals();
    }
    return window.CommsWebRTC;
}
