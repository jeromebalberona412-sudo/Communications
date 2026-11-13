import { S, api, refreshEls } from '../core/CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

function clearRingTimeout() {
    if (S.ringTimeout) {
        clearTimeout(S.ringTimeout);
        S.ringTimeout = null;
    }
}

function ringHint(show) {
    var hint = document.getElementById('commsRingtoneHint');
    if (hint) hint.hidden = !show;
}

function bindRingtoneUnlock() {
    if (S.ringUnlockBound) return;
    S.ringUnlockBound = true;
    var unlock = function () {
        api.unlockCallAudio();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible' || !S.ringtonePlaying || S.callAnswered || S.callConnected || !S.ringAudio) return;
        if (!S.ringAudio.paused) return;
        var resume = S.ringAudio.play();
        if (resume && typeof resume.catch === 'function') resume.catch(function () {});
    });
}

function unlockCallAudio() {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!S.ringCtx && window.__commsRingCtx) S.ringCtx = window.__commsRingCtx;
    if (AudioCtx && !S.ringCtx) {
        try { S.ringCtx = new AudioCtx(); } catch (e1) { /* ignore */ }
    }
    if (S.ringCtx) window.__commsRingCtx = S.ringCtx;
    if (S.ringCtx && S.ringCtx.state === 'suspended') {
        S.ringCtx.resume().catch(function () { /* ignore */ });
    }
    // A one-sample buffer started from the call-button gesture unlocks later
    // ringback on mobile browsers that ignore a bare resume().
    if (S.ringCtx && !S.ringCtx._commsUnlocked) {
        try {
            var buffer = S.ringCtx.createBuffer(1, 1, 22050);
            var src = S.ringCtx.createBufferSource();
            src.buffer = buffer;
            src.connect(S.ringCtx.destination);
            src.start(0);
            S.ringCtx._commsUnlocked = true;
        } catch (eBuf) { /* ignore */ }
    }
    if (S.ringtonePlaying && !S.callAnswered && !S.callConnected && S.ringAudio) {
        try {
            S.ringAudio.muted = false;
            S.ringAudio.volume = 1;
            if (S.ringAudio.paused) {
                var p = S.ringAudio.play();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            }
        } catch (ePlay) { /* ignore */ }
    }
}

function ensureRingAudio() {
    if (S.ringAudio) return S.ringAudio;
    S.ringAudio = document.getElementById('commsRingtoneAudio');
    if (!S.ringAudio) {
        S.ringAudio = document.createElement('audio');
        S.ringAudio.id = 'commsRingtoneAudio';
        S.ringAudio.setAttribute('playsinline', '');
        S.ringAudio.setAttribute('preload', 'auto');
        S.ringAudio.hidden = true;
        document.body.appendChild(S.ringAudio);
    }
    S.ringAudio.loop = true;
    S.ringAudio.preload = 'auto';
    S.ringAudio.playsInline = true;
    S.ringAudio.setAttribute('playsinline', '');
    S.ringAudio.muted = false;
    S.ringAudio.volume = 1;
    if (!S.ringAudio._commsStopBound) {
        S.ringAudio._commsStopBound = true;
        S.ringAudio.addEventListener('play', function () {
            if (S.ringtonePlaying && !S.callAnswered && !S.callConnected && !S.acceptingCallId) return;
            try {
                S.ringAudio.pause();
                S.ringAudio.currentTime = 0;
            } catch (eStopPlay) { /* ignore */ }
        });
    }
    if (!S.ringAudio.src) {
        try {
            S.ringAudio.src = api.makeRingtoneDataUri();
        } catch (e) { /* ignore */ }
    }
    return S.ringAudio;
}

function makeRingtoneDataUri() {
    var sampleRate = 8000;
    var seconds = 2.4;
    var n = sampleRate * seconds;
    var dataSize = n * 2;
    var buf = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buf);
    var writeStr = function (offset, str) {
        for (var i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    for (var s = 0; s < n; s += 1) {
        var t = s / sampleRate;
        var cycle = t % 2.4;
        var on = cycle < 0.42 || (cycle > 0.52 && cycle < 0.94);
        var amp = on ? 0.42 : 0;
        var sample = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.5 * amp;
        view.setInt16(44 + s * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
    }
    var bytes = new Uint8Array(buf);
    var binary = '';
    for (var b = 0; b < bytes.length; b += 1) binary += String.fromCharCode(bytes[b]);
    return 'data:audio/wav;base64,' + btoa(binary);
}

function silenceRingtoneElements() {
    var nodes = document.querySelectorAll('#commsRingtoneAudio, audio.comms-ringtone');
    nodes.forEach(function (el) {
        try {
            el.loop = false;
            el.pause();
            el.muted = true;
            el.currentTime = 0;
        } catch (e) { /* ignore */ }
    });
}

function stopRingtone(callId) {
    S.ringGeneration = (S.ringGeneration || 0) + 1;
    S.ringtonePlaying = false;
    S._ringLoopOn = false;
    S.ringMode = null;
    S.ringingCallId = null;
    api.ringHint(false);
    if (S.ringTimer) {
        clearInterval(S.ringTimer);
        S.ringTimer = null;
    }
    S.ringOscillators.forEach(function (osc) {
        try { osc.stop(); } catch (e) { /* ignore */ }
    });
    S.ringOscillators = [];
    if (S.ringGain && S.ringCtx) {
        try {
            S.ringGain.gain.cancelScheduledValues(S.ringCtx.currentTime);
            S.ringGain.gain.setValueAtTime(0, S.ringCtx.currentTime);
        } catch (eGain) { /* ignore */ }
    }
    silenceRingtoneElements();
    if (S.ringAudio) {
        try {
            S.ringAudio.loop = false;
            S.ringAudio.pause();
            S.ringAudio.muted = true;
            S.ringAudio.currentTime = 0;
            S.ringAudio.removeAttribute('src');
            S.ringAudio.load();
        } catch (eAudio) { /* ignore */ }
    }
    var generation = S.ringGeneration;
    [0, 80, 250, 700].forEach(function (delay) {
        window.setTimeout(function () {
            if (generation !== S.ringGeneration || S.ringtonePlaying) return;
            silenceRingtoneElements();
        }, delay);
    });
    if (S.ringNotify) {
        try { S.ringNotify.close(); } catch (e3) { /* ignore */ }
        S.ringNotify = null;
    }
    api.stopVibration();
}

var vibeTimer = null;

function stopVibration() {
    if (vibeTimer) {
        clearInterval(vibeTimer);
        vibeTimer = null;
    }
    try {
        if (navigator.vibrate) navigator.vibrate(0);
    } catch (e4) { /* ignore */ }
}

function startIncomingVibration() {
    api.stopVibration();
}

function playToneBurst(ctx, freqs, when, duration, volume) {
    var level = Math.max(0.01, Math.min(Number(volume) || 0.18, 0.28));
    freqs.forEach(function (freq) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(level, when + 0.03);
        gain.gain.setValueAtTime(level, when + Math.max(0.06, duration - 0.08));
        gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        osc.connect(gain);
        if (!S.ringGain) {
            S.ringGain = ctx.createGain();
            S.ringGain.connect(ctx.destination);
        }
        S.ringGain.gain.setValueAtTime(S.ringtonePlaying ? 1 : 0, ctx.currentTime);
        gain.connect(S.ringGain);
        osc.start(when);
        osc.stop(when + duration + 0.02);
        S.ringOscillators.push(osc);
    });
}

function startOscillatorRing(incoming) {
    if (S._ringLoopOn && S.ringTimer) return;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!S.ringCtx && window.__commsRingCtx) S.ringCtx = window.__commsRingCtx;
    if (!S.ringCtx) {
        if (!AudioCtx) return;
        try { S.ringCtx = new AudioCtx(); } catch (e) { return; }
    }
    window.__commsRingCtx = S.ringCtx;
    if (S.ringCtx.state === 'suspended') {
        S.ringCtx.resume().catch(function () { /* ignore */ });
    }
    if (S.ringTimer) {
        clearInterval(S.ringTimer);
        S.ringTimer = null;
    }
    S.ringOscillators.forEach(function (osc) {
        try { osc.stop(); } catch (eStop) { /* ignore */ }
    });
    S.ringOscillators = [];
    S._ringLoopOn = true;
    function scheduleCycle() {
        if (!S._ringLoopOn || !S.ringtonePlaying || S.callAnswered || S.callConnected || S.acceptingCallId || !S.ringCtx) {
            api.stopRingtone();
            return;
        }
        var now = S.ringCtx.currentTime;
        if (S.ringGain) {
            try { S.ringGain.gain.setValueAtTime(1, now); } catch (eGain) { /* ignore */ }
        }
        if (incoming) {
            api.playToneBurst(S.ringCtx, [440, 480], now, 0.42, 0.22);
            api.playToneBurst(S.ringCtx, [440, 480], now + 0.52, 0.42, 0.22);
        } else {
            api.playToneBurst(S.ringCtx, [440, 480], now, 1.15, 0.18);
        }
    }
    scheduleCycle();
    S.ringTimer = setInterval(scheduleCycle, incoming ? 2800 : 4000);
}

function startRingtone(mode, callId) {
    api.bindRingtoneUnlock();
    var incoming = mode === 'incoming';
    var id = callId != null ? Number(callId) : (S.incomingCallId || (S.currentCall && S.currentCall.id) || 0);
    if (S.callAnswered || S.callConnected || S.acceptingCallId) return;
    if (S.ringGain && S.ringCtx) {
        try { S.ringGain.gain.setValueAtTime(1, S.ringCtx.currentTime); } catch (eGain) { /* ignore */ }
    }
    if (S.ringCtx && S.ringCtx.state === 'suspended') {
        S.ringCtx.resume().catch(function () { /* autoplay resumes on the next gesture */ });
    }
    if (id && (S.answeredCallIds[id] || S.dismissedRingIds[id])) return;
    if (incoming && S.currentCall && Number(S.currentCall.id) === id && (S.callAnswered || S.callConnected)) {
        return;
    }
    if (S.ringtonePlaying && S.ringMode === mode) {
        if (id) S.ringingCallId = id;
        return;
    }
    if (S.ringtonePlaying) {
        api.stopRingtone();
    }
    S.ringGeneration = (S.ringGeneration || 0) + 1;
    var generation = S.ringGeneration;
    S.ringtonePlaying = true;
    S.ringMode = mode;
    S.ringingCallId = id || null;
    api.startOscillatorRing(incoming);
    if (generation !== S.ringGeneration || !S.ringtonePlaying) return;

    if (incoming) {
        api.startIncomingVibration();
    } else {
        api.stopVibration();
    }

    if (incoming && document.hidden && window.Notification && Notification.permission === 'granted') {
        try {
            if (S.ringNotify) S.ringNotify.close();
            S.ringNotify = new Notification('Incoming call', {
                body: (S.els.incomingPeer && S.els.incomingPeer.textContent) || 'Incoming call',
                silent: true,
                tag: 'comms-incoming-call'
            });
        } catch (eN) { /* ignore */ }
    }
}

/**
 * Ring timeout.
 *
 * The caller gives up after 30 seconds. The receiver keeps the
 * invitation on screen for as long as the server considers it valid, so
 * the modal never disappears while the call could still be answered.
 */
function armRingTimeout(incoming) {
    api.clearRingTimeout();
    var ttl = incoming
        ? Math.max(RING_TIMEOUT_MS, (Number(window.__COMMS_CALL_RING_TTL__) || 60) * 1000)
        : RING_TIMEOUT_MS;
    S.ringTimeout = setTimeout(function () {
        if (!S.currentCall || S.callConnected || S.startingCall) return;
        if (S.currentCall.id != null && S.answeredCallIds[Number(S.currentCall.id)]) return;
        api.finishUnanswered('missed');
    }, ttl);
}

function rememberCallId(map, id) {
    var key = String(id);
    map[key] = true;
    var keys = Object.keys(map);
    if (keys.length > 200) {
        delete map[keys[0]];
    }
}

function markCallTerminal(callId) {
    var id = callId != null ? Number(callId) : 0;
    if (!id) return;
    api.rememberCallId(S.dismissedRingIds, id);
    api.rememberCallId(S.answeredCallIds, id);
    api.rememberCallId(S.shownIncomingIds, id);
}

function isCallAlreadyHandled(callId) {
    var id = callId != null ? Number(callId) : 0;
    if (!id) return false;
    if (S.dismissedRingIds[id] || S.answeredCallIds[id]) return true;
    if (S.startingCall && S.currentCall && Number(S.currentCall.id) === id) return true;
    if (S.shownIncomingIds[id] && S.incomingCallId !== id) return true;
    if (S.lastEndedCallId != null && Number(S.lastEndedCallId) === id) return true;
    return false;
}

/**
 * A broadcast invitation can arrive long after the ring expired.
 * Terminal invitations must never open the modal again.
 */
function isInvitationExpired(call) {
    if (!call) return true;
    if (call.status && String(call.status) !== 'ringing') return true;
    var expiresAt = call.expires_at ? Date.parse(call.expires_at) : NaN;
    if (!isNaN(expiresAt) && expiresAt <= Date.now()) return true;
    var createdAt = call.created_at ? Date.parse(call.created_at) : NaN;
    if (isNaN(expiresAt) && !isNaN(createdAt)) {
        var ttl = (Number(window.__COMMS_CALL_RING_TTL__) || 90) * 1000;
        if (createdAt + ttl <= Date.now()) return true;
    }
    return false;
}

function isActivelyInCall(callId) {
    if (!S.currentCall && !(S.els.incoming && !S.els.incoming.hidden)) return false;
    if (callId != null && S.currentCall && Number(S.currentCall.id) !== Number(callId)) return false;
    if (S.callConnected) return true;
    if (S.startingCall) return true;
    if (S.els.inCall && !S.els.inCall.hidden) return true;
    if (S.els.incoming && !S.els.incoming.hidden) return true;
    return false;
}

/** True only while this tab is placing/holding an outbound ring (not after hangup). */
function isOutboundCallerBusy() {
    if (S.role !== 'caller') return false;
    if (S.startingCall || S.pendingStart) return true;
    if (S.callConnected) return true;
    if (S.els.inCall && !S.els.inCall.hidden) return true;
    // Stale S.currentCall with hidden UI must not block ringing poll forever.
    if (S.currentCall && S.currentCall.id && !api.isCallAlreadyHandled(S.currentCall.id)) {
        if (S.els.inCall && S.els.inCall.hidden && (!S.els.incoming || S.els.incoming.hidden) && !S.callConnected) {
            api.markCallTerminal(S.currentCall.id);
            S.currentCall = null;
            S.role = null;
            return false;
        }
        return true;
    }
    return false;
}

function resetCallerRoleIfIdle() {
    if (S.role === 'caller' && !api.isOutboundCallerBusy()) {
        S.role = null;
    }
    if (!S.callConnected && !S.startingCall && !S.pendingStart
        && (!S.els.inCall || S.els.inCall.hidden)
        && (!S.els.incoming || S.els.incoming.hidden)
        && S.currentCall && S.currentCall.id) {
        api.markCallTerminal(S.currentCall.id);
        S.currentCall = null;
        S.role = null;
    }
}

function showIncoming(call) {
    if (!call) return;
    var callId = call.id != null ? Number(call.id) : null;
    if (!callId) return;
    if (window.CommsWebRTC && typeof window.CommsWebRTC.__meshActive === 'function' && window.CommsWebRTC.__meshActive()) {
        if (S.ringMode === 'incoming' && (!S.ringingCallId || Number(S.ringingCallId) === callId)) api.stopRingtone();
        return;
    }

    // Expired / already-terminal invitations are dropped silently.
    if (api.isInvitationExpired(call)) {
        api.markCallTerminal(callId);
        api.stopRingtone();
        api.hideIncoming();
        return;
    }

    if (api.isCallAlreadyHandled(callId)) {
        if (!S.ringingCallId || Number(S.ringingCallId) === callId) api.stopRingtone();
        return;
    }
    if (S.acceptingCallId === callId || S.answeredCallIds[callId] || (S.callAnswered && S.currentCall && Number(S.currentCall.id) === callId)) {
        if (!S.ringingCallId || Number(S.ringingCallId) === callId) api.stopRingtone();
        if (!S.incomingCallId || S.incomingCallId === callId) api.hideIncoming();
        return;
    }
    if (S.callConnected || S.acceptingCallId) {
        return;
    }
    if (S.incomingCallId === callId && S.els.incoming && !S.els.incoming.hidden) return;

    // One modal at a time. A different call never replaces the one on screen.
    if (S.incomingCallId !== null && S.incomingCallId !== callId) {
        if (S.els.incoming && !S.els.incoming.hidden) {
            return;
        }
        S.incomingCallId = null;
        S.incomingCall = null;
    }

    if (api.isActivelyInCall(callId)) {
        if (call._remoteOffer && S.currentCall && Number(S.currentCall.id) === callId) {
            S.currentCall._remoteOffer = call._remoteOffer;
        }
        return;
    }
    // Never interrupt a connected call with a stale ring.
    if (api.isActivelyInCall(null) && S.callConnected) {
        var endedVisible = S.els.ended && !S.els.ended.hidden;
        var sameRoom = S.currentCall && Number(S.currentCall.conversation_id) === Number(call.conversation_id);
        var iceNow = S.pc && (S.pc.iceConnectionState || S.pc.connectionState);
        var liveNow = iceNow === 'connected' || iceNow === 'completed';
        if (!endedVisible && !sameRoom && liveNow) return;
        S.callConnected = false;
    }

    if (!S.els.incoming) {
        S.els.incoming = document.getElementById('commsIncomingCall');
        S.els.incomingPeer = document.getElementById('commsIncomingPeer');
        S.els.incomingType = document.getElementById('commsIncomingType');
        S.els.accept = document.getElementById('commsAcceptCall');
        S.els.reject = document.getElementById('commsRejectCall');
    }
    if (!S.els.incoming) return;

    S.els.incoming = document.getElementById('commsIncomingCall') || S.els.incoming;
    S.els.incomingPeer = document.getElementById('commsIncomingPeer') || S.els.incomingPeer;
    S.els.incomingType = document.getElementById('commsIncomingType') || S.els.incomingType;
    S.els.accept = document.getElementById('commsAcceptCall') || S.els.accept;
    S.els.reject = document.getElementById('commsRejectCall') || S.els.reject;

    // The same invitation may arrive twice (server broadcast + peer
    // signal + recovery poll). Keep exactly one modal.
    if (S.incomingCallId === callId && S.els.incoming && !S.els.incoming.hidden) {
        if (call._remoteOffer && S.currentCall && Number(S.currentCall.id) === callId) {
            S.currentCall._remoteOffer = call._remoteOffer;
        }
        return;
    }

    S.lastIncomingCallId = callId;
    api.rememberCallId(S.shownIncomingIds, callId);
    if (S.pc && (!S.currentCall || Number(S.currentCall.id) !== callId)) {
        try { S.pc.ontrack = null; S.pc.close(); } catch (eClose) { /* ignore */ }
        S.pc = null;
    }
    S.callAnswered = false;
    S.acceptingCallId = null;

    S.role = 'callee';
    S.lifecycle = 'ringing';
    // Do not clear S.callConnected if we somehow got here during an active call.
    if (!api.isActivelyInCall(callId)) {
        S.callConnected = false;
        S.lastCallDurationMs = 0;
    }
    api.hideEnded();
    // Never let a stale in-call shell block the Decline/Answer modal.
    if (S.els.inCall && !S.els.inCall.hidden && !S.callConnected && !S.startingCall
        && !(S.currentCall && S.currentCall.id && S.answeredCallIds[Number(S.currentCall.id)])
        && !S.pc) {
        S.els.inCall.hidden = true;
    }
    // Extract caller_profile from signaling payload
    if (call.caller_profile) {
        call.peer = Object.assign({}, call.peer || {}, call.caller_profile);
    }
    var incomingName = (call.peer && call.peer.name)
        || call.peer_name
        || call.from_name
        || 'Incoming caller';
    if (S.els.incomingPeer) {
        S.els.incomingPeer.textContent = incomingName;
    }
    var incomingAvatarEl = document.getElementById('commsIncomingAvatar');
    if (incomingAvatarEl) {
        var avatarSrc = (call.peer && (call.peer.profile_image_url || call.peer.avatar_url))
            || call.caller_avatar
            || '';
        if (!avatarSrc && window.Comms && typeof window.Comms.defaultAvatar === 'function') {
            avatarSrc = window.Comms.defaultAvatar(incomingName);
        }
        api.paintAvatar(incomingAvatarEl, incomingName, avatarSrc);
    }
    var titleEl = document.getElementById('commsIncomingTitle');
    var isVideo = String(call.call_type || '') === 'video';
    var groupLabel = !!(call.is_group_call || call._groupInvite);
    if (titleEl) {
        titleEl.textContent = groupLabel
            ? (isVideo ? 'Incoming Group Video Call' : 'Incoming Group Audio Call')
            : (isVideo ? 'Incoming Video Call' : 'Incoming Audio Call');
    }
    if (S.els.incomingType) {
        S.els.incomingType.textContent = groupLabel
            ? (isVideo ? 'Group video call' : 'Group audio call')
            : (isVideo ? 'Video call' : 'Audio call');
    }
    api.setIncomingActionState('idle');

    S.incomingCall = call;
    S.incomingCallId = callId;

    if (call.is_group_call || call._groupInvite) {
        window.__commsPendingGroupInvite = call._groupInvite || {
            call_id: call.id,
            conversation_id: call.conversation_id,
            call_type: call.call_type || 'video',
            caller_id: call.caller_id,
            caller_type: call.caller_type,
            peer_name: (call.peer && call.peer.name) || call.peer_name || 'Group call',
            invitees: call.invitees || [],
            call_max_participants: call.call_max_participants
        };
        // Keep S.currentCall null so 1:1 cleanup does not steal the group room.
        S.currentCall = null;
        S.els.incoming.hidden = false;
        S.els.incoming.removeAttribute('hidden');
        api.startRingtone('incoming', callId);
        api.clearRingTimeout();
        S.ringTimeout = setTimeout(function () {
            if (call.id != null) S.dismissedRingIds[Number(call.id)] = true;
            api.hideIncoming();
            api.stopRingtone();
            window.__commsPendingGroupInvite = null;
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__releaseGroupRingPreview === 'function') {
                window.CommsWebRTC.__releaseGroupRingPreview();
            }
        }, RING_TIMEOUT_MS);
        return;
    }
    // An outgoing call that is still ringing owns S.currentCall. A new
    // invitation is kept aside instead of hijacking that session.
    var outgoingPending = !!(S.role === 'caller'
        && S.currentCall
        && S.currentCall.id != null
        && !S.callConnected
        && !api.isCallAlreadyHandled(Number(S.currentCall.id)));

    if (!outgoingPending) {
        S.currentCall = Object.assign({}, S.currentCall || {}, call);
        api.rememberCallContext(S.currentCall);
    }
    S.els.incoming.hidden = false;
    S.els.incoming.removeAttribute('hidden');
    api.startRingtone('incoming', callId);
    api.beginIncomingPreview(call);
    api.armRingTimeout(true);
}

function beginIncomingPreview(call) {
    if (!call || call.is_group_call || call._groupInvite) return;
    if (S.callAnswered || S.callConnected || S.acceptingCallId) return;
    var video = String(call.call_type || '') === 'video';
    S.ringingPreview = false;
    S.wantsVideo = video;
    S.cameraEnabled = false;
    S.lifecycle = 'ringing';
    S.callConnected = false;
    if (S.els.inCall && !S.callConnected && !S.callAnswered) {
        S.els.inCall.hidden = true;
        S.els.inCall.classList.remove('is-ringing-preview', 'is-video-call');
    }
}

function setIncomingActionState(mode) {
    var accept = document.getElementById('commsAcceptCall');
    var reject = document.getElementById('commsRejectCall');
    if (!accept || !reject) return;
    if (mode === 'answering') {
        accept.disabled = true;
        reject.disabled = true;
        accept.textContent = 'Answer';
        accept.setAttribute('aria-busy', 'true');
        return;
    }
    if (mode === 'declining') {
        accept.disabled = true;
        reject.disabled = true;
        reject.textContent = 'Declining...';
        reject.setAttribute('aria-busy', 'true');
        return;
    }
    accept.disabled = false;
    reject.disabled = false;
    accept.textContent = 'Answer';
    reject.textContent = 'Decline';
    accept.removeAttribute('aria-busy');
    reject.removeAttribute('aria-busy');
}

function hideIncoming() {
    if (S.els.incoming) S.els.incoming.hidden = true;
    if (S.callAnswered || S.callConnected || S.ringMode === 'incoming') api.stopRingtone();
}


api.clearRingTimeout = clearRingTimeout;
api.ringHint = ringHint;
api.bindRingtoneUnlock = bindRingtoneUnlock;
api.unlockCallAudio = unlockCallAudio;
api.ensureRingAudio = ensureRingAudio;
api.makeRingtoneDataUri = makeRingtoneDataUri;
function primeOutgoingRingtone() {
    if (S.callConnected || S.currentCall || S.startingCall || S.pendingStart) return;
    api.bindRingtoneUnlock();
    api.unlockCallAudio();
    api.ensureRingAudio();
    api.startRingtone('outgoing');
}

api.stopRingtone = stopRingtone;
api.primeOutgoingRingtone = primeOutgoingRingtone;
api.stopVibration = stopVibration;
api.startIncomingVibration = startIncomingVibration;
api.playToneBurst = playToneBurst;
api.startOscillatorRing = startOscillatorRing;
api.startRingtone = startRingtone;
api.armRingTimeout = armRingTimeout;
api.rememberCallId = rememberCallId;
api.markCallTerminal = markCallTerminal;
api.isCallAlreadyHandled = isCallAlreadyHandled;
api.isInvitationExpired = isInvitationExpired;
api.isActivelyInCall = isActivelyInCall;
api.isOutboundCallerBusy = isOutboundCallerBusy;
api.resetCallerRoleIfIdle = resetCallerRoleIfIdle;
api.beginIncomingPreview = beginIncomingPreview;
api.showIncoming = showIncoming;
api.setIncomingActionState = setIncomingActionState;
api.hideIncoming = hideIncoming;
