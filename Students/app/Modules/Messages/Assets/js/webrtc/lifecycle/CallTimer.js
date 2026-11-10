import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function startCallHeartbeat() {
    api.stopCallHeartbeat();
    var intervalMs = Math.max(10000, (Number(window.__COMMS_CALL_HEARTBEAT__) || 30) * 1000);
    S.callHeartbeatTimer = setInterval(function () {
        if (!S.currentCall || !S.currentCall.id) return;
        var cid = Number(S.currentCall.id);
        if (!S.callConnected && !S.startingCall && !S.answeredCallIds[cid]) return;
        var r = api.routes();
        if (!r.callHeartbeat || !window.Comms || typeof window.Comms.api !== 'function') return;
        window.Comms.api(window.Comms.route(r.callHeartbeat, S.currentCall.id), {
            method: 'POST',
            body: '{}',
            dedupe: true
        }).catch(function () { /* ignore */ });
    }, intervalMs);
}

function stopCallHeartbeat() {
    if (S.callHeartbeatTimer) {
        clearInterval(S.callHeartbeatTimer);
        S.callHeartbeatTimer = null;
    }
}

/**
 * FIX BUG #3: Force stop call timer and reset state
 * Called before starting any new call to ensure clean state
 * 
 * VERIFIED: api.stopCallTimer() properly clears S.callTimer, S.callStartedAt, and 
 * S.lastCallDurationMs before new call. This prevents timer continuation from 
 * previous calls.
 */
function stopCallTimer() {
    if (S.callTimer) {
        clearInterval(S.callTimer);
        S.callTimer = null;
    }
    S.timerCallId = null;
    S.callStartedAt = null;
    S.timerAnchored = false;
    S.lastCallDurationMs = 0;
    if (S.els.timer) {
        S.els.timer.textContent = '00:00';
        S.els.timer.classList.remove('is-live');
        if (!S.callConnected) {
            S.els.timer.hidden = true;
            S.els.timer.setAttribute('hidden', '');
        }
    }
}

function syncCallTimerVisibility() {
    if (!S.els.timer) S.els.timer = document.getElementById('commsCallTimer');
    if (!S.els.timer) return;
    if ((S.callAnswered || S.callConnected) && S.callStartedAt) {
        S.els.timer.hidden = false;
        S.els.timer.removeAttribute('hidden');
        S.els.timer.classList.add('is-live');
        if (S.els.inCall) S.els.inCall.classList.add('is-connected');
        api.renderTimer();
        return;
    }
    if (!S.callConnected) {
        S.els.timer.classList.remove('is-live');
        S.els.timer.hidden = true;
        S.els.timer.setAttribute('hidden', '');
    }
}

function formatClockTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

/**
 * Authoritative duration in milliseconds.
 *
 * Prefers the server timestamps (started_at / ended_at / duration_seconds)
 * and only falls back to the local timer when the server has not answered.
 */
function authoritativeDurationMs(callPayload) {
    if (!callPayload) return null;
    var seconds = callPayload.duration_seconds;
    if (seconds !== null && seconds !== undefined && !isNaN(Number(seconds))) {
        return Math.max(0, Number(seconds)) * 1000;
    }
    var started = callPayload.started_at ? Date.parse(callPayload.started_at) : NaN;
    var ended = callPayload.ended_at ? Date.parse(callPayload.ended_at) : NaN;
    if (!isNaN(started) && !isNaN(ended)) {
        return Math.max(0, ended - started);
    }
    return null;
}

function formatTimer(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var mmss = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return h > 0 ? String(h) + ':' + mmss : mmss;
}

function formatDuration(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = String(total % 60).padStart(2, '0');
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
}

/**
 * Start (or realign) the call timer.
 *
 * The duration is always derived from a timestamp, never from counting
 * interval ticks, so a throttled background tab cannot drift. The server
 * timestamp is the shared source of truth for both participants and the
 * server clock offset removes any difference between the two devices.
 * 
 * CRITICAL: Always clears existing timer before creating new one to prevent
 * multiple intervals running simultaneously.
 */
function startTimer(serverStartedAt, serverTime) {
    api.applyServerClock(serverTime);

    var groupActive = !!(window.CommsWebRTC
        && typeof window.CommsWebRTC.__meshActive === 'function'
        && window.CommsWebRTC.__meshActive());
    if (!S.callAnswered && !S.callConnected && !groupActive) {
        return;
    }

    var parsed = serverStartedAt ? Date.parse(serverStartedAt) : NaN;
    var hasServer = !isNaN(parsed);
    if (!hasServer) {
        if (S.callTimer && S.timerAnchored) api.renderTimer();
        return;
    }
    var cid = S.currentCall && S.currentCall.id != null ? Number(S.currentCall.id) : null;
    if (S.callTimer && S.timerAnchored && S.callStartedAt === parsed) {
        api.renderTimer();
        api.syncCallTimerVisibility();
        return;
    }
    var nextStarted = parsed;

    if (S.callTimer) {
        clearInterval(S.callTimer);
        S.callTimer = null;
    }
    S.timerCallId = cid;
    S.callStartedAt = nextStarted;
    S.timerAnchored = true;
    if (S.els.timer) {
        S.els.timer.hidden = false;
        S.els.timer.removeAttribute('hidden');
        S.els.timer.classList.add('is-live');
    }
    if (S.els.inCall && !S.els.inCall.classList.contains('is-group-call')) {
        S.els.inCall.classList.add('is-connected');
        S.els.inCall.classList.remove('is-ringing-preview');
    }
    api.renderTimer();
    S.callTimer = setInterval(function () {
        api.renderTimer();
    }, 250);
}

function maybeStartConnectedTimer() {
    if (window.CALL_DEBUG) {
        console.log('[CALL] maybeStartConnectedTimer called', {
            callConnected: S.callConnected,
            currentCallId: S.currentCall && S.currentCall.id,
            started_at: S.currentCall && S.currentCall.started_at,
            answered_at: S.currentCall && S.currentCall.answered_at,
            role: S.role
        });
    }
    if (!S.callAnswered && !S.callConnected) {
        if (window.CALL_DEBUG) console.warn('[CALL] maybeStartConnectedTimer ABORTED: call not answered');
        return;
    }
    var ts = S.currentCall && (S.currentCall.started_at || S.currentCall.answered_at);
    if (!ts) return;
    api.publishDuration(ts, S.currentCall && S.currentCall.server_time);
}

function publishDuration(startedAt, serverTime) {
    if (!startedAt) return;
    S.callAnswered = true;
    if (S.currentCall) {
        S.currentCall.started_at = startedAt;
        if (serverTime) S.currentCall.server_time = serverTime;
    }
    api.startTimer(startedAt, serverTime || (S.currentCall && S.currentCall.server_time));
    api.syncCallTimerVisibility();
    api.startCallHeartbeat();
    if (S.els.inCall && !S.els.inCall.classList.contains('is-group-call') && S.els.callStatus) {
        S.els.callStatus.textContent = '';
    }
}

function pullSharedDuration() {
    var id = S.currentCall && S.currentCall.id;
    if (!id || typeof api.fetchCallState !== 'function') return;
    api.fetchCallState(id).then(function (row) {
        if (!row || !S.currentCall || Number(S.currentCall.id) !== Number(id)) return;
        var ts = row.started_at || row.answered_at;
        if (!ts) return;
        api.publishDuration(ts, row.server_time);
    });
}

/**
 * Estimate the difference between the server clock and this device.
 */
function applyServerClock(serverTime) {
    if (!serverTime) return;
    var parsed = Date.parse(serverTime);
    if (isNaN(parsed)) return;
    var offset = parsed - Date.now();
    // Ignore absurd offsets (the value is usually wrong, not the clock).
    if (Math.abs(offset) > 24 * 60 * 60 * 1000) return;
    S.clockOffsetMs = offset;
}

/**
 * Elapsed call time in milliseconds, based on timestamps.
 */
function callElapsedMs() {
    if (!S.callStartedAt) return 0;
    return Math.max(0, Date.now() - S.callStartedAt);
}

function renderTimer() {
    if (!S.els.timer || !S.callStartedAt) return;
    S.els.timer.textContent = api.formatTimer(api.callElapsedMs());
}


api.startCallHeartbeat = startCallHeartbeat;
api.stopCallHeartbeat = stopCallHeartbeat;
api.stopCallTimer = stopCallTimer;
api.formatClockTime = formatClockTime;
api.authoritativeDurationMs = authoritativeDurationMs;
api.formatTimer = formatTimer;
api.formatDuration = formatDuration;
api.startTimer = startTimer;
api.syncCallTimerVisibility = syncCallTimerVisibility;
api.maybeStartConnectedTimer = maybeStartConnectedTimer;
api.publishDuration = publishDuration;
api.pullSharedDuration = pullSharedDuration;
api.applyServerClock = applyServerClock;
api.callElapsedMs = callElapsedMs;
api.renderTimer = renderTimer;
