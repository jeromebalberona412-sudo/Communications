import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';
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
    S.lastCallDurationMs = 0;
    if (S.els.timer) S.els.timer.textContent = '00:00';
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
    if (!S.callConnected && !groupActive) {
        return;
    }

    var nextStarted = Date.now() + S.clockOffsetMs;
    if (serverStartedAt) {
        var parsed = Date.parse(serverStartedAt);
        if (!isNaN(parsed)) nextStarted = parsed;
    }
    var cid = S.currentCall && S.currentCall.id != null ? Number(S.currentCall.id) : null;
    if (S.callTimer && S.timerCallId != null && cid != null && S.timerCallId === cid
        && S.callStartedAt && Math.abs(S.callStartedAt - nextStarted) < 1500) {
        api.renderTimer();
        return;
    }

    if (S.callTimer) {
        clearInterval(S.callTimer);
        S.callTimer = null;
    }
    S.timerCallId = cid;
    S.callStartedAt = nextStarted;
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
    if (!S.callConnected) {
        if (window.CALL_DEBUG) console.warn('[CALL] maybeStartConnectedTimer ABORTED: S.callConnected=false');
        return;
    }
    var ts = S.currentCall && (S.currentCall.started_at || S.currentCall.answered_at);
    // FIX: If server didn't provide timestamp, use current time to start timer
    if (!ts) {
        if (window.CALL_DEBUG) console.log('[CALL] maybeStartConnectedTimer: no server timestamp, using now');
        ts = new Date().toISOString();
    }
    api.startTimer(ts, S.currentCall && S.currentCall.server_time);
    if (S.els.timer) S.els.timer.hidden = false;
    api.startCallHeartbeat();
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
    return Math.max(0, (Date.now() + S.clockOffsetMs) - S.callStartedAt);
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
api.maybeStartConnectedTimer = maybeStartConnectedTimer;
api.applyServerClock = applyServerClock;
api.callElapsedMs = callElapsedMs;
api.renderTimer = renderTimer;
