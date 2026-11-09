/**
 * WebRTC voice/video with Supabase broadcast signaling + Laravel call records.
 * Voice: mic on, camera off (can turn on). Video: camera on (can turn off).
 * Shows visible ringing UI on both sides and a Call ended screen when not picked up.
 */
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from './media-constraints.js';

(function () {
    'use strict';

    if (window.CommsWebRTC) {
        return;
    }

    var RING_TIMEOUT_MS = 30000;
    var CALL_START_DELAY_MS = 400;
    var CONNECTION_TIMEOUT_MS = 30000;

    var pc = null;
    var localStream = null;
    var currentCall = null;
    var incomingCall = null;
    var incomingCallId = null;
    var lastCallContext = null;
    var callTimer = null;
    var callStartedAt = null;
    var lastCallDurationMs = 0;
    var iceQueue = [];
    var startingCall = false;
    var cameraEnabled = false;
    var wantsVideo = false;
    var callConnected = false;
    var ringTimeout = null;
    var connectionTimeout = null;
    var endedAutoClose = null;
    var role = null; // 'caller' | 'callee'
    var lastEndedCallId = null;
    var lastIncomingCallId = null;
    var incomingSyncTimer = null;
    var pendingStartTimer = null;
    var pendingStartTick = null;
    var pendingStart = null;
    var remoteStream = null;
    var audioUnlockCtx = null;
    var negotiating = false;
    var callHeartbeatTimer = null;
    var summaryShownFor = Object.create(null);
    var answeredCall = null;
    var cameraBusy = false;
    var cameraPending = null;
    var cameraChain = Promise.resolve();
    var remoteCameraEnabled = true;
    var remoteMicEnabled = true;
    var videoSender = null;
    var iceDisconnectTimer = null;
    var cleaningCall = false;
    var clockOffsetMs = 0;

    var ringCtx = null;
    var ringTimer = null;
    var ringOscillators = [];
    var ringAudio = null;
    var ringtonePlaying = false;
    var ringMode = null;
    var ringingCallId = null;
    var peerAnsweredFor = null;
    var ringUnlockBound = false;
    var ringNotify = null;
    var timerCallId = null;

    var HTTPS_PORT_BY_HTTP = {
        '8000': '8440',
        '8005': '8440',
        '8006': '8441',
        '8080': '8441',
        '8002': '8443'
    };

    var els = {
        incoming: document.getElementById('commsIncomingCall'),
        incomingPeer: document.getElementById('commsIncomingPeer'),
        incomingType: document.getElementById('commsIncomingType'),
        accept: document.getElementById('commsAcceptCall'),
        reject: document.getElementById('commsRejectCall'),
        inCall: document.getElementById('commsInCall'),
        remoteVideo: document.getElementById('commsRemoteVideo'),
        localVideo: document.getElementById('commsLocalVideo'),
        remoteAudio: document.getElementById('commsRemoteAudio'),
        peerName: document.getElementById('commsCallPeerName'),
        callStatus: document.getElementById('commsCallStatus'),
        timer: document.getElementById('commsCallTimer'),
        muteBtn: document.getElementById('commsMuteBtn'),
        cameraBtn: document.getElementById('commsCameraBtn'),
        endBtn: document.getElementById('commsEndCall'),
        ended: document.getElementById('commsCallEnded'),
        endedPeer: document.getElementById('commsCallEndedPeer'),
        endedReason: document.getElementById('commsCallEndedReason'),
        endedTitle: document.getElementById('commsCallEndedTitle'),
        endedAvatar: document.getElementById('commsCallEndedAvatar'),
        endedDuration: document.getElementById('commsCallEndedDuration'),
        endedClose: document.getElementById('commsCallEndedClose'),
        endedRedial: document.getElementById('commsCallEndedRedial'),
        callAvatar: document.getElementById('commsCallPeerAvatar'),
        callCenter: document.getElementById('commsCallCenter'),
        localVideoOff: document.getElementById('commsLocalVideoOff'),
        remoteVideoOff: document.getElementById('commsRemoteVideoOff')
    };

    function mountCallUiToBody() {
        ['incoming', 'inCall', 'ended'].forEach(function (key) {
            var node = els[key];
            if (node && node.parentNode !== document.body) {
                document.body.appendChild(node);
            }
        });
        // Re-bind element refs after move (keeps Accept/Decline clicks reliable).
        els.accept = document.getElementById('commsAcceptCall');
        els.reject = document.getElementById('commsRejectCall');
        els.endBtn = document.getElementById('commsEndCall');
        els.endedClose = document.getElementById('commsCallEndedClose');
        els.endedRedial = document.getElementById('commsCallEndedRedial');
        els.muteBtn = document.getElementById('commsMuteBtn');
        els.cameraBtn = document.getElementById('commsCameraBtn');
        els.localVideo = document.getElementById('commsLocalVideo');
        els.remoteVideo = document.getElementById('commsRemoteVideo');
        els.remoteAudio = document.getElementById('commsRemoteAudio');
        els.localVideoOff = document.getElementById('commsLocalVideoOff');
        els.remoteVideoOff = document.getElementById('commsRemoteVideoOff');
        els.incoming = document.getElementById('commsIncomingCall');
        els.inCall = document.getElementById('commsInCall');
        els.ended = document.getElementById('commsCallEnded');
        els.endedPeer = document.getElementById('commsCallEndedPeer');
        els.endedReason = document.getElementById('commsCallEndedReason');
        els.endedTitle = document.getElementById('commsCallEndedTitle');
        els.endedAvatar = document.getElementById('commsCallEndedAvatar');
        els.endedDuration = document.getElementById('commsCallEndedDuration');
        els.callAvatar = document.getElementById('commsCallPeerAvatar');
        els.callCenter = document.getElementById('commsCallCenter');
        els.peerName = document.getElementById('commsCallPeerName');
        els.callStatus = document.getElementById('commsCallStatus');
        els.timer = document.getElementById('commsCallTimer');
    }

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
        var root = getCallRoot();
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
        var me = myIdentity();
        var peerId = null;
        var peerType = null;
        var peers = [];
        if (!currentCall) return { peerId: peerId, peerType: peerType, peers: peers };
        var isGroup = !!(currentCall.is_group_call)
            || (Number(currentCall.caller_id) === Number(currentCall.receiver_id)
                && portalTypesMatch(currentCall.caller_type, currentCall.receiver_type));
        if (!isGroup && currentCall.receiver_id != null && currentCall.caller_id != null) {
            var idIsCaller = Number(currentCall.caller_id) === me.id;
            var idIsReceiver = Number(currentCall.receiver_id) === me.id;
            var typeIsCaller = !me.type || portalTypesMatch(currentCall.caller_type, me.type);
            var typeIsReceiver = !me.type || portalTypesMatch(currentCall.receiver_type, me.type);
            // Prefer role/direction, then ID+type, then ID alone (cross-portal robustness).
            var iAmCaller = role === 'caller'
                || currentCall.direction === 'outgoing'
                || (idIsCaller && typeIsCaller && !(idIsReceiver && typeIsReceiver))
                || (idIsCaller && !idIsReceiver);
            if (iAmCaller) {
                peerId = currentCall.receiver_id;
                peerType = currentCall.receiver_type;
            } else {
                peerId = currentCall.caller_id;
                peerType = currentCall.caller_type;
            }
        }
        if (Array.isArray(currentCall.invitees)) {
            peers = currentCall.invitees;
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
        var me = myIdentity();
        if (!me.id || !row) return false;
        var id = asReceiver ? Number(row.receiver_id) : Number(row.caller_id);
        var type = asReceiver ? row.receiver_type : row.caller_type;
        if (id !== me.id) return false;
        if (!type || !me.type) return true;
        return portalTypesMatch(type, me.type);
    }

    function toast(message, type) {
        if (window.Comms && typeof window.Comms.showToast === 'function') {
            window.Comms.showToast(message, type || 'error');
            return;
        }
        window.alert(message);
    }

    function isSecureMediaContext() {
        if (window.isSecureContext) return true;
        var host = (window.location && window.location.hostname) || '';
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    }

    function suggestedHttpsUrl() {
        var host = (window.location && window.location.hostname) || 'localhost';
        var httpPort = String((window.location && window.location.port) || '');
        var httpsPort = HTTPS_PORT_BY_HTTP[httpPort] || '8440';
        return 'https://' + host + ':' + httpsPort;
    }

    function resolveMediaDevices() {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            return navigator.mediaDevices;
        }

        var legacy = navigator.getUserMedia
            || navigator.webkitGetUserMedia
            || navigator.mozGetUserMedia
            || navigator.msGetUserMedia;

        if (!legacy) {
            return null;
        }

        return {
            getUserMedia: function (constraints) {
                return new Promise(function (resolve, reject) {
                    try {
                        legacy.call(navigator, constraints, resolve, reject);
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        };
    }

    function mediaUnavailableMessage() {
        if (!isSecureMediaContext()) {
            return 'Voice/video needs HTTPS. Open ' + suggestedHttpsUrl()
                + ' (run npm run serve:lan), accept the certificate warning, then try again.';
        }
        return 'Camera/microphone is not available in this browser. Check site permissions and try again.';
    }

    function assertMediaReady() {
        if (!isSecureMediaContext()) {
            var insecure = new Error(mediaUnavailableMessage());
            insecure.code = 'MEDIA_INSECURE';
            throw insecure;
        }
        var devices = resolveMediaDevices();
        if (!devices) {
            var err = new Error(mediaUnavailableMessage());
            err.code = 'MEDIA_UNAVAILABLE';
            throw err;
        }
        return devices;
    }

    function clearRingTimeout() {
        if (ringTimeout) {
            clearTimeout(ringTimeout);
            ringTimeout = null;
        }
    }

    function ringHint(show) {
        var hint = document.getElementById('commsRingtoneHint');
        if (hint) hint.hidden = !show;
    }

    function bindRingtoneUnlock() {
        if (ringUnlockBound) return;
        ringUnlockBound = true;
        var unlock = function () {
            unlockCallAudio();
        };
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
        document.addEventListener('touchstart', unlock, { capture: true, passive: true });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible' || !ringtonePlaying || !ringAudio) return;
            if (!ringAudio.paused) return;
            var resume = ringAudio.play();
            if (resume && typeof resume.catch === 'function') resume.catch(function () {});
        });
    }

    function unlockCallAudio() {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx && !ringCtx) {
            try { ringCtx = new AudioCtx(); } catch (e1) { /* ignore */ }
        }
        if (ringCtx && ringCtx.state === 'suspended') {
            ringCtx.resume().catch(function () { /* ignore */ });
        }
        if (ringtonePlaying && ringAudio) {
            try {
                ringAudio.muted = false;
                ringAudio.volume = 1;
                if (ringAudio.paused) {
                    var p = ringAudio.play();
                    if (p && typeof p.catch === 'function') p.catch(function () {});
                }
            } catch (ePlay) { /* ignore */ }
        }
    }

    function ensureRingAudio() {
        if (ringAudio) return ringAudio;
        ringAudio = document.getElementById('commsRingtoneAudio');
        if (!ringAudio) {
            ringAudio = document.createElement('audio');
            ringAudio.id = 'commsRingtoneAudio';
            ringAudio.setAttribute('playsinline', '');
            ringAudio.setAttribute('preload', 'auto');
            ringAudio.hidden = true;
            document.body.appendChild(ringAudio);
        }
        ringAudio.loop = true;
        ringAudio.preload = 'auto';
        ringAudio.playsInline = true;
        ringAudio.setAttribute('playsinline', '');
        ringAudio.muted = false;
        ringAudio.volume = 1;
        if (!ringAudio.src) {
            try {
                ringAudio.src = makeRingtoneDataUri();
            } catch (e) { /* ignore */ }
        }
        return ringAudio;
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

    function stopRingtone(callId) {
        if (callId != null && ringingCallId != null && Number(callId) !== Number(ringingCallId)) {
            return;
        }
        ringtonePlaying = false;
        ringMode = null;
        ringingCallId = null;
        ringHint(false);
        if (ringTimer) {
            clearInterval(ringTimer);
            ringTimer = null;
        }
        ringOscillators.forEach(function (osc) {
            try { osc.stop(); } catch (e) { /* ignore */ }
        });
        ringOscillators = [];
        if (ringAudio) {
            try {
                ringAudio.pause();
                ringAudio.muted = true;
                ringAudio.currentTime = 0;
            } catch (e2) { /* ignore */ }
        }
        // Keep AudioContext open so the next ring is not blocked by autoplay.
        if (ringNotify) {
            try { ringNotify.close(); } catch (e3) { /* ignore */ }
            ringNotify = null;
        }
        stopVibration();
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
        stopVibration();
        if (!navigator.vibrate) return;
        try { navigator.vibrate([220, 120, 220, 400, 220, 120, 220]); } catch (eV) { /* ignore */ }
        vibeTimer = setInterval(function () {
            if (!ringtonePlaying || ringMode !== 'incoming') {
                stopVibration();
                return;
            }
            try { navigator.vibrate([220, 120, 220, 400]); } catch (e2) { /* ignore */ }
        }, 1800);
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
            gain.connect(ctx.destination);
            osc.start(when);
            osc.stop(when + duration + 0.02);
            ringOscillators.push(osc);
        });
    }

    function startOscillatorRing(incoming) {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!ringCtx) {
            try { ringCtx = new AudioCtx(); } catch (e) { return; }
        }
        if (ringCtx.state === 'suspended') {
            ringCtx.resume().catch(function () { /* ignore */ });
        }
        function scheduleCycle() {
            if (!ringtonePlaying || !ringCtx) return;
            var now = ringCtx.currentTime;
            if (incoming) {
                playToneBurst(ringCtx, [440, 480], now, 0.42, 0.24);
                playToneBurst(ringCtx, [440, 480], now + 0.52, 0.42, 0.24);
            } else {
                playToneBurst(ringCtx, [440, 480], now, 1.15, 0.18);
            }
        }
        if (ringTimer) {
            clearInterval(ringTimer);
            ringTimer = null;
        }
        scheduleCycle();
        ringTimer = setInterval(scheduleCycle, incoming ? 2800 : 3600);
    }

    function startRingtone(mode, callId) {
        bindRingtoneUnlock();
        var incoming = mode === 'incoming';
        var id = callId != null ? Number(callId) : (incomingCallId || (currentCall && currentCall.id) || 0);
        if (incoming && id && (answeredCallIds[id] || dismissedRingIds[id])) {
            return;
        }
        if (incoming && (startingCall || callConnected) && currentCall && Number(currentCall.id) === id) {
            return;
        }
        if (ringtonePlaying && ringingCallId != null && id && Number(ringingCallId) === id) {
            return;
        }
        if (ringtonePlaying && ringMode === mode) {
            if (id) ringingCallId = id;
            return;
        }
        if (ringtonePlaying) {
            stopRingtone();
        }
        ringtonePlaying = true;
        ringMode = mode;
        ringingCallId = id || null;
        ensureRingAudio();

        if (ringAudio) {
            try {
                ringAudio.loop = true;
                ringAudio.muted = false;
                ringAudio.volume = 1;
                var playPromise = ringAudio.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise.then(function () {
                        ringHint(false);
                    }).catch(function () {
                        if (!ringtonePlaying) return;
                        startOscillatorRing(incoming);
                        ringHint(true);
                    });
                }
            } catch (ePlay) {
                startOscillatorRing(incoming);
                ringHint(true);
            }
        } else {
            startOscillatorRing(incoming);
            ringHint(true);
        }

        if (incoming) {
            startIncomingVibration();
        } else {
            stopVibration();
        }

        if (incoming && document.hidden && window.Notification && Notification.permission === 'granted') {
            try {
                if (ringNotify) ringNotify.close();
                ringNotify = new Notification('Incoming call', {
                    body: (els.incomingPeer && els.incomingPeer.textContent) || 'Incoming call',
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
        clearRingTimeout();
        var ttl = incoming
            ? Math.max(RING_TIMEOUT_MS, (Number(window.__COMMS_CALL_RING_TTL__) || 60) * 1000)
            : RING_TIMEOUT_MS;
        ringTimeout = setTimeout(function () {
            if (!currentCall || callConnected || startingCall) return;
            if (currentCall.id != null && answeredCallIds[Number(currentCall.id)]) return;
            finishUnanswered('missed');
        }, ttl);
    }

    function clearConnectionTimeout() {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
    }

    function armConnectionTimeout() {
        clearConnectionTimeout();
        connectionTimeout = setTimeout(function () {
            if (!currentCall) return;
            var state = pc && (pc.connectionState || pc.iceConnectionState);
            if (state === 'connected' || state === 'completed' || callConnected) return;
            toast('Call could not connect in time.', 'error');
            endCall();
        }, CONNECTION_TIMEOUT_MS);
    }

    /**
     * Report a live call to the server so a dead tab can be told apart from a
     * real call. Without this the server has to guess and long calls get
     * force-ended (or keep blocking new calls).
     */
    function startCallHeartbeat() {
        stopCallHeartbeat();
        var intervalMs = Math.max(10000, (Number(window.__COMMS_CALL_HEARTBEAT__) || 30) * 1000);
        callHeartbeatTimer = setInterval(function () {
            if (!currentCall || !currentCall.id) return;
            var cid = Number(currentCall.id);
            if (!callConnected && !startingCall && !answeredCallIds[cid]) return;
            var r = routes();
            if (!r.callHeartbeat || !window.Comms || typeof window.Comms.api !== 'function') return;
            window.Comms.api(window.Comms.route(r.callHeartbeat, currentCall.id), {
                method: 'POST',
                body: '{}',
                dedupe: true
            }).catch(function () { /* ignore */ });
        }, intervalMs);
    }

    function stopCallHeartbeat() {
        if (callHeartbeatTimer) {
            clearInterval(callHeartbeatTimer);
            callHeartbeatTimer = null;
        }
    }

    /**
     * FIX BUG #3: Force stop call timer and reset state
     * Called before starting any new call to ensure clean state
     * 
     * VERIFIED: stopCallTimer() properly clears callTimer, callStartedAt, and 
     * lastCallDurationMs before new call. This prevents timer continuation from 
     * previous calls.
     */
    function stopCallTimer() {
        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }
        timerCallId = null;
        callStartedAt = null;
        lastCallDurationMs = 0;
        if (els.timer) els.timer.textContent = '00:00';
    }

    function endedCopy(reason, endedByRole) {
        var actor = endedByRole || role;
        switch (reason) {
            case 'missed':
                return {
                    title: 'Call ended',
                    reason: 'Call ended. No pickup.'
                };
            case 'rejected':
                return {
                    title: 'Call declined',
                    reason: role === 'caller' ? 'The other person declined the call.' : 'You declined the call.'
                };
            case 'cancelled':
                return {
                    title: 'Call cancelled',
                    reason: actor === 'caller'
                        ? (role === 'caller' ? 'You cancelled the call.' : 'The caller cancelled the call.')
                        : (role === 'callee' ? 'You cancelled the call.' : 'The other person cancelled the call.')
                };
            case 'offline':
                return {
                    title: 'Call ended',
                    reason: 'The person you are calling is offline.'
                };
            default:
                return {
                    title: 'Call ended',
                    reason: 'The call has ended.'
                };
        }
    }

    function rememberCallContext(call) {
        if (!call) return;
        lastCallContext = {
            conversationId: call.conversation_id,
            callType: call.call_type || 'voice',
            conversation: {
                id: call.conversation_id,
                other_user: call.peer || null
            },
            peerName: (call.peer && call.peer.name) || '',
            peerAvatar: (call.peer && (call.peer.profile_image_url || call.peer.avatar_url)) || ''
        };
    }

    function setMuteUi(muted) {
        if (!els.muteBtn) return;
        setCtrlLabel(els.muteBtn, muted ? 'Unmute' : 'Mute');
        els.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        els.muteBtn.classList.toggle('is-off', !!muted);
        var iconWrap = els.muteBtn.querySelector('[data-mute-icon]');
        if (!iconWrap) return;
        if (muted) {
            iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
                '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
                '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
                '<line x1="12" y1="19" x2="12" y2="23"/>' +
                '<line x1="8" y1="23" x2="16" y2="23"/>' +
                '<line x1="4" y1="4" x2="20" y2="20"/>' +
                '</svg>';
        } else {
            iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
                '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
                '<line x1="12" y1="19" x2="12" y2="23"/>' +
                '<line x1="8" y1="23" x2="16" y2="23"/>' +
                '</svg>';
        }
    }

    function setCtrlLabel(btn, label) {
        if (!btn) return;
        var labelEl = btn.querySelector('.comms-call-ctrl-label');
        if (labelEl) labelEl.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.removeAttribute('title');
    }

    function paintAvatar(target, name, src) {
        if (!target) return;
        target.textContent = '';
        if (src) {
            var img = document.createElement('img');
            img.src = String(src);
            img.alt = '';
            target.appendChild(img);
            return;
        }
        target.textContent = String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
    }

    function setCallPeerAvatar(call) {
        var peer = (call && call.peer) || {};
        var name = peer.name || 'Participant';
        var src = peer.profile_image_url || peer.avatar_url || '';
        paintAvatar(els.callAvatar, name, src);
        var remoteOffAvatar = document.getElementById('commsRemoteVideoOffAvatar');
        if (remoteOffAvatar) {
            paintAvatar(remoteOffAvatar, name, src);
        }
        var remoteOffName = document.getElementById('commsRemoteVideoOffName');
        if (remoteOffName) {
            remoteOffName.textContent = name;
        }
    }

    function hideEnded() {
        if (endedAutoClose) {
            clearTimeout(endedAutoClose);
            endedAutoClose = null;
        }
        if (els.ended) els.ended.hidden = true;
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

    function showCallEnded(reason, peerName, callId, endedByRole, callPayload) {
        var callKey = callId != null ? String(callId) : '';
        if (callKey && summaryShownFor[callKey]) {
            return;
        }
        if (els.ended && !els.ended.hidden && callKey && Number(lastEndedCallId) === Number(callId)) {
            return;
        }
        if (callId != null) lastEndedCallId = callId;
        if (callKey) summaryShownFor[callKey] = true;

        // Group calls end without cleanupMediaOnly(), so the timer may still be running here.
        if (callStartedAt) {
            lastCallDurationMs = callElapsedMs();
            clearInterval(callTimer);
            callTimer = null;
            callStartedAt = null;
        }

        hideIncoming();
        if (els.inCall) els.inCall.hidden = true;
        clearRingTimeout();
        stopRingtone();
        stopCallHeartbeat();

        var statusKey = String(reason || 'ended');
        var serverStatus = callPayload && callPayload.status
            ? String(callPayload.status).toLowerCase()
            : '';
        if (serverStatus) {
            statusKey = serverStatus;
        }
        var copy = endedCopy(statusKey, endedByRole);
        var displayName = peerName
            || (lastCallContext && lastCallContext.peerName)
            || (currentCall && currentCall.peer && currentCall.peer.name)
            || ((callPayload && callPayload.peer && callPayload.peer.name) || '');
        var avatarSrc = (lastCallContext && (!peerName || peerName === lastCallContext.peerName))
            ? (lastCallContext.peerAvatar || '')
            : '';
        if (!avatarSrc && callPayload && callPayload.peer) {
            avatarSrc = callPayload.peer.profile_image_url || callPayload.peer.avatar_url || '';
        }
        var callType = (lastCallContext && lastCallContext.callType)
            || (currentCall && currentCall.call_type)
            || (callPayload && callPayload.call_type)
            || 'voice';
        var typeLabel = String(callType) === 'video' ? 'Video call' : 'Voice call';

        var serverDuration = authoritativeDurationMs(callPayload);
        var connected = serverDuration !== null
            ? serverDuration >= 500
            : (lastCallDurationMs >= 1000);

        var statusLabel = ({
            ended: connected ? 'Completed' : 'Failed',
            completed: 'Completed',
            missed: 'Missed',
            rejected: 'Declined',
            cancelled: 'Cancelled',
            canceled: 'Cancelled',
            offline: 'Failed',
            failed: 'Failed'
        })[statusKey] || copy.title || 'Ended';

        if (els.endedTitle) els.endedTitle.textContent = copy.title;
        if (els.endedReason) els.endedReason.textContent = copy.reason;
        if (els.endedPeer) {
            els.endedPeer.textContent = displayName;
            els.endedPeer.hidden = !displayName;
        }
        paintAvatar(els.endedAvatar, displayName, avatarSrc);
        var endedType = document.getElementById('commsCallEndedType');
        if (endedType) {
            endedType.textContent = typeLabel;
            endedType.hidden = false;
        }
        var endedStatus = document.getElementById('commsCallEndedStatus');
        if (endedStatus) {
            endedStatus.textContent = statusLabel;
            endedStatus.hidden = false;
        }
        var durationMs = serverDuration !== null ? serverDuration : lastCallDurationMs;
        if (els.endedDuration) {
            // A completed-call summary only makes sense for a call that connected.
            var showDuration = connected && (statusKey === 'ended' || statusKey === 'completed');
            els.endedDuration.textContent = showDuration ? ('Duration: ' + formatDuration(durationMs)) : '';
            els.endedDuration.hidden = !showDuration;
        }
        var endedStarted = document.getElementById('commsCallEndedStarted');
        if (endedStarted) {
            var startedAt = (callPayload && callPayload.started_at)
                || (callPayload && callPayload.answered_at)
                || '';
            var startedText = formatClockTime(startedAt);
            endedStarted.textContent = startedText ? ('Started: ' + startedText) : '';
            endedStarted.hidden = !startedText;
        }
        var endedAt = document.getElementById('commsCallEndedAt');
        if (endedAt) {
            var endText = formatClockTime((callPayload && callPayload.ended_at) || '');
            endedAt.textContent = endText ? ('Ended: ' + endText) : '';
            endedAt.hidden = !endText;
        }
        lastCallDurationMs = 0;
        role = null;
        currentCall = null;
        incomingCall = null;
        incomingCallId = null;
        answeredCall = null;

        if (els.ended) els.ended.hidden = false;
        if (els.endedClose) {
            try { els.endedClose.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }

        if (endedAutoClose) clearTimeout(endedAutoClose);
        endedAutoClose = setTimeout(function () {
            hideEnded();
        }, 12000);
    }

    function redialLastCall() {
        if (!lastCallContext || !lastCallContext.conversationId) return;
        if (startingCall || currentCall) return; // Prevent double-redial
        
        var ctx = lastCallContext;
        
        hideEnded();
        
        // Perform complete cleanup before starting new call
        cleanupMediaOnly().then(function() {
            // Start fresh call with completely clean state
            startCall(ctx.conversationId, ctx.callType || 'voice', ctx.conversation || null);
        }).catch(function(err) {
            console.error('Cleanup failed before redial:', err);
            // Reset state in catch block to prevent stuck state (REVIEW FIX #4)
            currentCall = null;
            startingCall = false;
            toast('Unable to redial. Please try again.', 'error');
        });
    }

    function signalPeer(payload) {
        if (!window.CommsRealtime) return Promise.resolve();
        
        // Allow signaling even when currentCall is null (hangup / busy).
        var conversationId = (currentCall && currentCall.conversation_id) || payload.conversation_id;
        var callId = (currentCall && currentCall.id) || payload.call_id;
        
        if (!conversationId) {
            console.warn('Cannot signal: no conversation_id available');
            return Promise.resolve();
        }
        
        var me = myIdentity();
        payload.from_user_id = me.id;
        payload.from_user_type = me.type;
        payload.from_name = me.name || payload.from_name;
        payload.call_id = payload.call_id || callId;
        payload.conversation_id = payload.conversation_id || conversationId;
        
        var targets = signalTargets();
        subscribeCallChannel(conversationId);
        return window.CommsRealtime.broadcastSignal(conversationId, payload, {
            peerId: targets.peerId || payload.to_user_id || payload.peerId,
            peerType: targets.peerType || payload.to_user_type || payload.peerType,
            peers: targets.peers
        });
    }

    function signalMediaState() {
        if (!currentCall) return;
        var micOn = true;
        if (localStream && typeof localStream.getAudioTracks === 'function') {
            var audioTracks = localStream.getAudioTracks();
            micOn = !audioTracks.length || audioTracks.some(function (t) { return t.enabled; });
        }
        signalPeer({
            type: 'camera-state',
            call_id: currentCall.id,
            conversation_id: currentCall.conversation_id,
            enabled: !!cameraEnabled
        });
        signalPeer({
            type: 'mic-state',
            call_id: currentCall.id,
            conversation_id: currentCall.conversation_id,
            enabled: !!micOn
        });
    }

    function findVideoSender() {
        if (!pc) return null;
        if (videoSender && pc.getSenders().indexOf(videoSender) !== -1) {
            return videoSender;
        }
        var senders = pc.getSenders();
        var i;
        for (i = 0; i < senders.length; i += 1) {
            if (senders[i] && senders[i].track && senders[i].track.kind === 'video') {
                videoSender = senders[i];
                return videoSender;
            }
        }
        var txs = pc.getTransceivers();
        for (i = 0; i < txs.length; i += 1) {
            var t = txs[i];
            var recvKind = t.receiver && t.receiver.track && t.receiver.track.kind;
            var sendKind = t.sender && t.sender.track && t.sender.track.kind;
            if (recvKind === 'video' || sendKind === 'video') {
                videoSender = t.sender || null;
                return videoSender;
            }
        }
        return videoSender;
    }

    function setCameraUi(enabled) {
        if (!els.cameraBtn) return;
        setCtrlLabel(els.cameraBtn, enabled ? 'Camera on' : 'Camera off');
        els.cameraBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        els.cameraBtn.classList.toggle('is-off', !enabled);
        var iconWrap = els.cameraBtn.querySelector('[data-camera-icon]');
        if (!iconWrap) return;
        if (enabled) {
            iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                '<polygon points="23 7 16 12 23 17 23 7"/>' +
                '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>' +
                '</svg>';
        } else {
            iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
                '<polygon points="23 7 16 12 23 17 23 7"/>' +
                '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>' +
                '<line x1="4" y1="4" x2="20" y2="20"/>' +
                '</svg>';
        }
    }

    function hasLiveRemoteVideo() {
        if (!remoteCameraEnabled) return false;
        var stream = (els.remoteVideo && els.remoteVideo.srcObject) || remoteStream;
        if (!stream || typeof stream.getVideoTracks !== 'function') return false;
        return stream.getVideoTracks().some(function (track) {
            return !!(track && track.readyState === 'live' && track.enabled !== false);
        });
    }

    function scheduleRemoteVideoUiRefresh() {
        [200, 600, 1200, 2000].forEach(function (ms) {
            setTimeout(function () {
                if (!currentCall || !pc) return;
                if (remoteStream) bindRemoteMedia(remoteStream);
                unlockRemotePlayback();
                updateCameraUi();
            }, ms);
        });
    }

    function updateCameraUi() {
        if (els.cameraBtn) {
            els.cameraBtn.hidden = false;
        }
        // The self-view element is never hidden: the camera-off placeholder is
        // layered on top of it so the video element and its stream stay intact.
        syncCameraUi();
        var remoteVideoLive = remoteCameraEnabled && hasLiveRemoteVideo();
        var isVideoCall = isVideoCallType();
        if (els.inCall) {
            els.inCall.classList.toggle('is-connected', !!callConnected);
            els.inCall.classList.toggle('has-remote-video', remoteVideoLive);
            els.inCall.classList.toggle('is-video-call', isVideoCall);
            els.inCall.classList.toggle('is-remote-camera-off', !remoteCameraEnabled);
            els.inCall.classList.toggle('is-remote-mic-off', !remoteMicEnabled);
        }
        if (els.callCenter) {
            els.callCenter.hidden = false;
            els.callCenter.removeAttribute('hidden');
            els.callCenter.classList.toggle('is-compact', !!callConnected && remoteVideoLive);
        }
        syncLocalPipLayout();
    }

    /**
     * A call is a video call when it was started as one or when the peer is
     * sending video. The local camera state never controls this: switching the
     * camera off must not collapse the remote video layout.
     */
    function isVideoCallType() {
        if (currentCall && currentCall.call_type) {
            return String(currentCall.call_type) === 'video';
        }
        if (lastCallContext && lastCallContext.callType) {
            return String(lastCallContext.callType) === 'video';
        }
        return !!wantsVideo;
    }

    function syncLocalPipLayout() {
        if (!els.inCall || !els.localVideo) return;
        var landscape = false;
        try {
            landscape = window.matchMedia('(orientation: landscape)').matches;
        } catch (e) {
            landscape = window.innerWidth > window.innerHeight;
        }
        var desktop = window.innerWidth >= 1024;
        els.inCall.classList.toggle('is-landscape', landscape);
        els.inCall.classList.toggle('is-desktop-call', desktop);

        var camLandscape = landscape;
        try {
            var track = localStream && localStream.getVideoTracks && localStream.getVideoTracks()[0];
            var settings = track && typeof track.getSettings === 'function' ? track.getSettings() : null;
            if (settings && settings.width && settings.height) {
                camLandscape = (Number(settings.width) / Number(settings.height)) >= 1.15;
            }
        } catch (e2) { /* ignore */ }
        els.localVideo.classList.toggle('is-cam-landscape', camLandscape);
        els.localVideo.classList.toggle('is-cam-portrait', !camLandscape);
    }

    function showTapToPlay(show) {
        var btn = document.getElementById('commsTapToPlay');
        if (!btn) return;
        btn.hidden = !show;
    }

    function unlockRemotePlayback() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx && !audioUnlockCtx) audioUnlockCtx = new Ctx();
            if (audioUnlockCtx && audioUnlockCtx.state === 'suspended') {
                audioUnlockCtx.resume().catch(function () {});
            }
        } catch (e) { /* ignore */ }
        ensureRemoteAudioPlaying();
        if (els.remoteVideo) {
            try {
                els.remoteVideo.muted = false;
                els.remoteVideo.removeAttribute('muted');
                els.remoteVideo.playsInline = true;
                var vp = els.remoteVideo.play();
                if (vp && typeof vp.then === 'function') {
                    vp.then(function () { showTapToPlay(false); }).catch(function () { showTapToPlay(true); });
                }
            } catch (e2) {
                showTapToPlay(true);
            }
        }
    }

    function ensureRemoteAudioPlaying() {
        if (!els.remoteAudio) return;
        try {
            els.remoteAudio.muted = false;
            els.remoteAudio.removeAttribute('muted');
            els.remoteAudio.volume = 1;
            els.remoteAudio.autoplay = true;
            var playPromise = els.remoteAudio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function () {});
            }
        } catch (e) { /* ignore */ }
    }

    function dropRemoteTracksOfKind(kind, exceptId) {
        if (!remoteStream || typeof remoteStream.getTracks !== 'function') return;
        remoteStream.getTracks().forEach(function (existing) {
            if (!existing || existing.kind !== kind) return;
            if (exceptId && existing.id === exceptId) return;
            if (existing._commsUnmuteHandler) {
                existing.removeEventListener('unmute', existing._commsUnmuteHandler);
                delete existing._commsUnmuteHandler;
            }
            if (existing._commsEndedHandler) {
                existing.removeEventListener('ended', existing._commsEndedHandler);
                delete existing._commsEndedHandler;
            }
            try { remoteStream.removeTrack(existing); } catch (eRm) { /* ignore */ }
        });
    }

    function mergeRemoteTrack(track, inboundStream) {
        if (!remoteStream) remoteStream = new MediaStream();
        if (track && !remoteStream.getTracks().some(function (t) { return t.id === track.id; })) {
            dropRemoteTracksOfKind(track.kind, track.id);
            remoteStream.addTrack(track);

            var unmuteHandler = function () {
                if (track.kind === 'video') remoteCameraEnabled = true;
                bindRemoteMedia(remoteStream);
            };
            var endedHandler = function () {
                try { remoteStream.removeTrack(track); } catch (err) { /* ignore */ }
                refreshRemoteFromReceivers();
            };

            track.addEventListener('unmute', unmuteHandler);
            track.addEventListener('ended', endedHandler);
            track._commsUnmuteHandler = unmuteHandler;
            track._commsEndedHandler = endedHandler;
        }
        if (inboundStream && typeof inboundStream.getTracks === 'function') {
            inboundStream.getTracks().forEach(function (t) {
                if (!t) return;
                if (remoteStream.getTracks().some(function (x) { return x.id === t.id; })) return;
                dropRemoteTracksOfKind(t.kind, t.id);
                remoteStream.addTrack(t);
            });
        }
        return remoteStream;
    }

    function applyRemoteVideoMetrics() {
        if (!els.remoteVideo || !els.inCall) return;
        var w = Number(els.remoteVideo.videoWidth || 0);
        var h = Number(els.remoteVideo.videoHeight || 0);
        if (!w || !h) return;
        var portrait = (w / h) < 0.92;
        els.remoteVideo.classList.toggle('is-remote-portrait', portrait);
        els.remoteVideo.classList.toggle('is-remote-landscape', !portrait);
        els.inCall.classList.toggle('is-remote-portrait', portrait);
        els.inCall.classList.toggle('is-remote-landscape', !portrait);
    }

    function refreshRemoteFromReceivers() {
        if (!pc) {
            if (remoteStream) bindRemoteMedia(remoteStream);
            return;
        }
        pc.getReceivers().forEach(function (recv) {
            if (recv && recv.track && recv.track.readyState !== 'ended') {
                mergeRemoteTrack(recv.track, null);
            }
        });
        if (remoteStream) bindRemoteMedia(remoteStream);
    }

    function bindRemoteMedia(stream) {
        if (!stream) return;
        if (els.remoteVideo) {
            els.remoteVideo.muted = false;
            els.remoteVideo.removeAttribute('muted');
            els.remoteVideo.playsInline = true;
            els.remoteVideo.autoplay = true;
            els.remoteVideo.style.visibility = '';
            els.remoteVideo.srcObject = null;
            els.remoteVideo.srcObject = stream;
            try {
                var vp = els.remoteVideo.play();
                if (vp && typeof vp.catch === 'function') {
                    vp.catch(function () { showTapToPlay(true); });
                }
            } catch (e) {
                showTapToPlay(true);
            }
            if (!els.remoteVideo._commsMetricsBound) {
                els.remoteVideo._commsMetricsBound = true;
                els.remoteVideo.addEventListener('loadedmetadata', applyRemoteVideoMetrics);
                els.remoteVideo.addEventListener('resize', applyRemoteVideoMetrics);
            }
            applyRemoteVideoMetrics();
        }
        if (els.remoteAudio) {
            var audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
            audioTracks.forEach(function (t) {
                try { t.enabled = true; } catch (err) { /* ignore */ }
            });
            els.remoteAudio.muted = false;
            els.remoteAudio.removeAttribute('muted');
            els.remoteAudio.volume = 1;
            els.remoteAudio.autoplay = true;
            els.remoteAudio.setAttribute('playsinline', '');
            // Reuse the inbound stream when possible so track timing stays natural.
            var nextAudio = audioTracks.length === (stream.getTracks ? stream.getTracks().length : -1)
                ? stream
                : new MediaStream(audioTracks);
            if (els.remoteAudio.srcObject !== nextAudio) {
                els.remoteAudio.srcObject = nextAudio;
            }
            ensureRemoteAudioPlaying();
        }
        updateCameraUi();
    }

    function setCallStatus(text) {
        if (els.callStatus) els.callStatus.textContent = text || '';
        if (els.timer) {
            els.timer.hidden = false;
            if (!callStartedAt) els.timer.textContent = '00:00';
        }
    }

    async function getLocalStream(videoEnabled) {
        var devices = assertMediaReady();
        try {
            var stream = await devices.getUserMedia(mediaConstraints(!!videoEnabled));
            if (videoEnabled) {
                await prepareLocalStream(stream);
            }
            return stream;
        } catch (err) {
            // Fallback: simpler constraints if the device rejects aspect/ideal combo.
            if (videoEnabled) {
                try {
                    var fallback = await devices.getUserMedia({
                        audio: mediaConstraints(false).audio,
                        video: { facingMode: 'user' }
                    });
                    await prepareLocalStream(fallback);
                    return fallback;
                } catch (e2) {
                    try {
                        var audioOnly = await devices.getUserMedia({
                            audio: mediaConstraints(false).audio,
                            video: false
                        });
                        toast('Camera unavailable — continuing with microphone only.', 'error');
                        cameraEnabled = false;
                        wantsVideo = false;
                        return audioOnly;
                    } catch (e3) {
                        err = e3;
                    }
                }
            } else {
                try {
                    return await devices.getUserMedia({ audio: true, video: false });
                } catch (eAudio) {
                    err = eAudio;
                }
            }
            var name = (err && err.name) || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                throw new Error('Microphone/camera permission was denied. Allow access and try again.');
            }
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                throw new Error(videoEnabled
                    ? 'No camera or microphone was found on this device.'
                    : 'No microphone was found on this device.');
            }
            if (name === 'NotReadableError' || name === 'TrackStartError') {
                throw new Error('Camera/microphone is already in use by another app.');
            }
            throw new Error((err && err.message) || mediaUnavailableMessage());
        }
    }

    function stunConfig() {
        return {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' }
            ],
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceCandidatePoolSize: 4
        };
    }

    var dismissedRingIds = Object.create(null);
    var answeredCallIds = Object.create(null);
    var shownIncomingIds = Object.create(null);

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
        rememberCallId(dismissedRingIds, id);
        rememberCallId(answeredCallIds, id);
        rememberCallId(shownIncomingIds, id);
    }

    function isCallAlreadyHandled(callId) {
        var id = callId != null ? Number(callId) : 0;
        if (!id) return false;
        if (dismissedRingIds[id] || answeredCallIds[id]) return true;
        if (startingCall && currentCall && Number(currentCall.id) === id) return true;
        if (shownIncomingIds[id] && incomingCallId !== id) return true;
        if (lastEndedCallId != null && Number(lastEndedCallId) === id) return true;
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
        if (!currentCall && !(els.incoming && !els.incoming.hidden)) return false;
        if (callId != null && currentCall && Number(currentCall.id) !== Number(callId)) return false;
        if (callConnected) return true;
        if (startingCall) return true;
        if (els.inCall && !els.inCall.hidden) return true;
        if (els.incoming && !els.incoming.hidden) return true;
        return false;
    }

    /** True only while this tab is placing/holding an outbound ring (not after hangup). */
    function isOutboundCallerBusy() {
        if (role !== 'caller') return false;
        if (startingCall || pendingStart) return true;
        if (callConnected) return true;
        if (els.inCall && !els.inCall.hidden) return true;
        // Stale currentCall with hidden UI must not block ringing poll forever.
        if (currentCall && currentCall.id && !isCallAlreadyHandled(currentCall.id)) {
            if (els.inCall && els.inCall.hidden && (!els.incoming || els.incoming.hidden) && !callConnected) {
                markCallTerminal(currentCall.id);
                currentCall = null;
                role = null;
                return false;
            }
            return true;
        }
        return false;
    }

    function resetCallerRoleIfIdle() {
        if (role === 'caller' && !isOutboundCallerBusy()) {
            role = null;
        }
        if (!callConnected && !startingCall && !pendingStart
            && (!els.inCall || els.inCall.hidden)
            && (!els.incoming || els.incoming.hidden)
            && currentCall && currentCall.id) {
            markCallTerminal(currentCall.id);
            currentCall = null;
            role = null;
        }
    }

    function showIncoming(call) {
        if (!call) return;
        var callId = call.id != null ? Number(call.id) : null;
        if (!callId) return;

        // Expired / already-terminal invitations are dropped silently.
        if (isInvitationExpired(call)) {
            markCallTerminal(callId);
            stopRingtone();
            hideIncoming();
            return;
        }

        if (isCallAlreadyHandled(callId)) return;

        // One modal at a time. A different call never replaces the one on screen.
        if (incomingCallId !== null && incomingCallId !== callId) {
            if (els.incoming && !els.incoming.hidden) {
                return;
            }
            incomingCallId = null;
            incomingCall = null;
        }

        if (isActivelyInCall(callId)) {
            if (call._remoteOffer && currentCall && Number(currentCall.id) === callId) {
                currentCall._remoteOffer = call._remoteOffer;
            }
            return;
        }
        // Never interrupt a connected call with a stale ring.
        if (isActivelyInCall(null) && callConnected) return;

        if (!els.incoming) {
            els.incoming = document.getElementById('commsIncomingCall');
            els.incomingPeer = document.getElementById('commsIncomingPeer');
            els.incomingType = document.getElementById('commsIncomingType');
            els.accept = document.getElementById('commsAcceptCall');
            els.reject = document.getElementById('commsRejectCall');
        }
        if (!els.incoming) return;

        els.incoming = document.getElementById('commsIncomingCall') || els.incoming;
        els.incomingPeer = document.getElementById('commsIncomingPeer') || els.incomingPeer;
        els.incomingType = document.getElementById('commsIncomingType') || els.incomingType;
        els.accept = document.getElementById('commsAcceptCall') || els.accept;
        els.reject = document.getElementById('commsRejectCall') || els.reject;

        // The same invitation may arrive twice (server broadcast + peer
        // signal + recovery poll). Keep exactly one modal.
        if (incomingCallId === callId && els.incoming && !els.incoming.hidden) {
            if (call._remoteOffer && currentCall && Number(currentCall.id) === callId) {
                currentCall._remoteOffer = call._remoteOffer;
            }
            return;
        }

        lastIncomingCallId = callId;
        rememberCallId(shownIncomingIds, callId);

        role = 'callee';
        // Do not clear callConnected if we somehow got here during an active call.
        if (!isActivelyInCall(callId)) {
            callConnected = false;
            lastCallDurationMs = 0;
        }
        hideEnded();
        // Never let a stale in-call shell block the Decline/Answer modal.
        if (els.inCall && !els.inCall.hidden && !callConnected && !startingCall
            && !(currentCall && currentCall.id && answeredCallIds[Number(currentCall.id)])
            && !pc) {
            els.inCall.hidden = true;
        }
        // Extract caller_profile from signaling payload
        if (call.caller_profile) {
            call.peer = Object.assign({}, call.peer || {}, call.caller_profile);
        }
        var incomingName = (call.peer && call.peer.name)
            || call.peer_name
            || call.from_name
            || 'Incoming caller';
        if (els.incomingPeer) {
            els.incomingPeer.textContent = incomingName;
        }
        var incomingAvatarEl = document.getElementById('commsIncomingAvatar');
        if (incomingAvatarEl) {
            var avatarSrc = (call.peer && (call.peer.profile_image_url || call.peer.avatar_url))
                || call.caller_avatar
                || '';
            if (!avatarSrc && window.Comms && typeof window.Comms.defaultAvatar === 'function') {
                avatarSrc = window.Comms.defaultAvatar(incomingName);
            }
            paintAvatar(incomingAvatarEl, incomingName, avatarSrc);
        }
        var titleEl = document.getElementById('commsIncomingTitle');
        var isVideo = String(call.call_type || '') === 'video';
        var groupLabel = !!(call.is_group_call || call._groupInvite);
        if (titleEl) {
            titleEl.textContent = groupLabel
                ? (isVideo ? 'Incoming Group Video Call' : 'Incoming Group Voice Call')
                : (isVideo ? 'Incoming Video Call' : 'Incoming Voice Call');
        }
        if (els.incomingType) {
            els.incomingType.textContent = groupLabel
                ? (isVideo ? 'Group video call' : 'Group voice call')
                : (isVideo ? 'Video call' : 'Voice call');
        }
        if (els.accept) els.accept.textContent = 'Answer';
        if (els.reject) els.reject.textContent = 'Decline';

        incomingCall = call;
        incomingCallId = callId;

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
            // Keep currentCall null so 1:1 cleanup does not steal the group room.
            currentCall = null;
            els.incoming.hidden = false;
            els.incoming.removeAttribute('hidden');
            startRingtone('incoming', callId);
            clearRingTimeout();
            ringTimeout = setTimeout(function () {
                if (call.id != null) dismissedRingIds[Number(call.id)] = true;
                hideIncoming();
                stopRingtone();
                window.__commsPendingGroupInvite = null;
            }, RING_TIMEOUT_MS);
            return;
        }
        // An outgoing call that is still ringing owns currentCall. A new
        // invitation is kept aside instead of hijacking that session.
        var outgoingPending = !!(role === 'caller'
            && currentCall
            && currentCall.id != null
            && !callConnected
            && !isCallAlreadyHandled(Number(currentCall.id)));

        if (!outgoingPending) {
            currentCall = Object.assign({}, currentCall || {}, call);
            rememberCallContext(currentCall);
        }
        els.incoming.hidden = false;
        els.incoming.removeAttribute('hidden');
        startRingtone('incoming', callId);
        armRingTimeout(true);
    }

    function hideIncoming() {
        if (els.incoming) els.incoming.hidden = true;
        if (ringMode === 'incoming') stopRingtone();
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
        applyServerClock(serverTime);

        if (!callConnected) {
            return;
        }

        var nextStarted = Date.now() + clockOffsetMs;
        if (serverStartedAt) {
            var parsed = Date.parse(serverStartedAt);
            if (!isNaN(parsed)) nextStarted = parsed;
        }
        var cid = currentCall && currentCall.id != null ? Number(currentCall.id) : null;
        if (callTimer && timerCallId != null && cid != null && timerCallId === cid
            && callStartedAt && Math.abs(callStartedAt - nextStarted) < 1500) {
            renderTimer();
            return;
        }

        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }
        timerCallId = cid;
        callStartedAt = nextStarted;
        renderTimer();
        callTimer = setInterval(function () {
            renderTimer();
        }, 250);
    }

    function maybeStartConnectedTimer() {
        if (!callConnected) return;
        var ts = currentCall && (currentCall.started_at || currentCall.answered_at);
        startTimer(ts || null, currentCall && currentCall.server_time);
        if (els.timer) els.timer.hidden = false;
        startCallHeartbeat();
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
        clockOffsetMs = offset;
    }

    /**
     * Elapsed call time in milliseconds, based on timestamps.
     */
    function callElapsedMs() {
        if (!callStartedAt) return 0;
        return Math.max(0, (Date.now() + clockOffsetMs) - callStartedAt);
    }

    function renderTimer() {
        if (!els.timer || !callStartedAt) return;
        els.timer.textContent = formatTimer(callElapsedMs());
    }

    async function ensurePeerConnection(videoEnabled) {
        if (pc) {
            attachLocalVideo();
            if (videoEnabled && localStream && !findLiveVideoTrack()) {
                try { await applyCameraState(true); } catch (eCam) { /* keep audio call */ }
            }
            return pc;
        }

        if (typeof RTCPeerConnection === 'undefined') {
            throw new Error('WebRTC is not supported in this browser.');
        }

        wantsVideo = !!videoEnabled;
        cameraEnabled = !!videoEnabled;
        localStream = await getLocalStream(!!videoEnabled);
        
        // FIX BUG #1: Immediately attach local video after acquiring stream
        attachLocalVideo();

        pc = new RTCPeerConnection(stunConfig());
        pc.onicecandidate = function (ev) {
            if (!ev.candidate || !currentCall) return;
            signalPeer({
                type: 'ice-candidate',
                call_id: currentCall.id,
                conversation_id: currentCall.conversation_id,
                candidate: ev.candidate
            });
        };
        pc.ontrack = function (ev) {
            var merged = mergeRemoteTrack(
                ev.track,
                ev.streams && ev.streams[0] ? ev.streams[0] : null
            );
            // Immediately bind remote media to display video on first frame arrival (REVIEW FIX #1)
            bindRemoteMedia(merged);
            unlockRemotePlayback();
            ensureRemoteAudioPlaying();
            if (ev.track && ev.track.kind === 'video') {
                updateCameraUi();
                scheduleRemoteVideoUiRefresh();
            }
            unlockRemotePlayback();
            // FIX BUG #1: Ensure local video stays visible when peer joins
            attachLocalVideo();
        };
        pc.oniceconnectionstatechange = function () {
            var st = pc && pc.iceConnectionState;
            if (st === 'connected' || st === 'completed') {
                if (iceDisconnectTimer) {
                    clearTimeout(iceDisconnectTimer);
                    iceDisconnectTimer = null;
                }
                callConnected = true;
                clearConnectionTimeout();
                keepActiveCallVisible('Connected');
                maybeStartConnectedTimer();
                refreshRemoteFromReceivers();
                attachLocalVideo();
                unlockRemotePlayback();
                updateCameraUi();
                signalMediaState();
            }
            if (st === 'disconnected' || st === 'failed') {
                if (iceDisconnectTimer) clearTimeout(iceDisconnectTimer);
                iceDisconnectTimer = setTimeout(function () {
                    iceDisconnectTimer = null;
                    if (!pc || !currentCall) return;
                    var now = pc.iceConnectionState;
                    if (now === 'failed') {
                        toast('Call connection failed.', 'error');
                        endCall();
                    }
                }, 8000);
            }
        };
        pc.onconnectionstatechange = function () {
            if (pc && pc.connectionState === 'connected') {
                callConnected = true;
                clearConnectionTimeout();
                keepActiveCallVisible('Connected');
                maybeStartConnectedTimer();
                refreshRemoteFromReceivers();
                attachLocalVideo();
                unlockRemotePlayback();
                updateCameraUi();
                signalMediaState();
            }
            if (pc && pc.connectionState === 'failed') {
                if (iceDisconnectTimer) clearTimeout(iceDisconnectTimer);
                iceDisconnectTimer = setTimeout(function () {
                    iceDisconnectTimer = null;
                    if (!pc || !currentCall) return;
                    if (pc.connectionState === 'failed') {
                        toast('Call connection failed.', 'error');
                        endCall();
                    }
                }, 8000);
            }
        };

        videoSender = null;
        localStream.getTracks().forEach(function (track) {
            var sender = pc.addTrack(track, localStream);
            if (track.kind === 'video') videoSender = sender;
        });
        if (videoEnabled && !videoSender) {
            try {
                var videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
                videoSender = videoTx.sender;
            } catch (eVid) { /* ignore */ }
        }
        var kinds = {};
        pc.getTransceivers().forEach(function (t) {
            var kind = (t.receiver && t.receiver.track && t.receiver.track.kind)
                || (t.sender && t.sender.track && t.sender.track.kind);
            if (kind) kinds[kind] = true;
        });
        if (!kinds.audio) {
            try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e2) { /* ignore */ }
        }
        // FIX BUG #1: Attach local video with all required attributes for immediate preview
        if (els.localVideo) {
            els.localVideo.srcObject = localStream;
            els.localVideo.muted = true;
            els.localVideo.setAttribute('muted', '');
            els.localVideo.playsInline = true;
            els.localVideo.autoplay = true;
            els.localVideo.hidden = false;
            try {
                var playPromise = els.localVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(function() {});
                }
            } catch (e) { /* ignore */ }
            syncLocalPipLayout();
        }
        if (els.muteBtn) setMuteUi(false);
        updateCameraUi();
        return pc;
    }

    /**
     * Toggle the camera without destroying the call.
     *
     * - Turning the camera off only disables the video track. The track, the
     *   MediaStream, the RTCRtpSender and the peer connection stay alive, so
     *   the microphone and the call are never interrupted.
     * - Turning the camera on re-enables the existing track. When the track
     *   was ended (device removed, permission revoked) a fresh track is
     *   acquired and installed with replaceTrack() instead of reusing the
     *   dead one.
     * - Rapid clicks are serialised: the last requested state always wins and
     *   only one camera stream exists at a time.
     */
    function setCameraEnabled(enabled) {
        var target = !!enabled;
        cameraPending = target;

        cameraChain = cameraChain.then(function () {
            var wanted = cameraPending;
            return applyCameraState(wanted);
        }).catch(function (err) {
            toast((err && err.message) || 'Unable to toggle camera.', 'error');
            syncCameraUi();
        }).then(function () {
            if (currentCall) {
                signalPeer({
                    type: 'camera-state',
                    call_id: currentCall.id,
                    conversation_id: currentCall.conversation_id,
                    enabled: !!cameraEnabled
                });
            }
            if (cameraPending !== null && cameraPending !== cameraEnabled) {
                return applyCameraState(cameraPending);
            }
            return null;
        });

        return cameraChain;
    }

    async function applyCameraState(enabled) {
        if (!pc || !localStream) {
            return;
        }

        cameraBusy = true;
        cameraEnabled = !!enabled;
        syncCameraUi();

        try {
            var liveTrack = findLiveVideoTrack();
            var needsRenegotiate = false;
            var sender = findVideoSender();

            if (!enabled) {
                localStream.getVideoTracks().forEach(function (track) {
                    try { track.enabled = false; } catch (eOff) {}
                });
                if (sender && sender.track) {
                    try { sender.track.enabled = false; } catch (eRep) {}
                    videoSender = sender;
                }
                cameraEnabled = false;
                attachLocalVideo();
                syncCameraUi();
                return;
            }

            if (liveTrack) {
                liveTrack.enabled = true;
                await attachVideoTrackToSender(liveTrack);
                cameraEnabled = true;
                attachLocalVideo();
                syncCameraUi();
                try {
                    if (els.localVideo) {
                        var lp = els.localVideo.play();
                        if (lp && typeof lp.catch === 'function') lp.catch(function () {});
                    }
                } catch (ePlay) { /* ignore */ }
                return;
            }

            var devices = assertMediaReady();
            var camStream;
            try {
                camStream = await devices.getUserMedia(videoOnlyConstraints());
            } catch (gumErr) {
                var name = (gumErr && gumErr.name) || '';
                cameraEnabled = false;
                if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                    throw new Error('Camera permission was denied.');
                }
                if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                    throw new Error('No camera was found on this device.');
                }
                if (name === 'NotReadableError' || name === 'TrackStartError') {
                    throw new Error('Camera is already in use by another app.');
                }
                throw new Error((gumErr && gumErr.message) || 'Unable to start the camera.');
            }
            await prepareLocalStream(camStream);
            var newTrack = camStream.getVideoTracks()[0];
            if (!newTrack) {
                throw new Error('No camera was found on this device.');
            }

            localStream.getVideoTracks().forEach(function (track) {
                if (track !== newTrack) {
                    try { localStream.removeTrack(track); } catch (e) {}
                    try { track.stop(); } catch (e2) {}
                }
            });
            if (!localStream.getVideoTracks().some(function (t) { return t.id === newTrack.id; })) {
                localStream.addTrack(newTrack);
            }
            camStream.getVideoTracks().forEach(function (track) {
                if (track !== newTrack) {
                    try { track.stop(); } catch (e3) {}
                }
            });

            newTrack.enabled = true;
            needsRenegotiate = await attachVideoTrackToSender(newTrack);
            cameraEnabled = true;
            attachLocalVideo();
            syncCameraUi();
        } finally {
            cameraBusy = false;
            syncCameraUi();
        }

        if (needsRenegotiate) {
            await renegotiateForCamera();
        }
    }

    function findLiveVideoTrack() {
        if (!localStream || typeof localStream.getVideoTracks !== 'function') return null;
        var tracks = localStream.getVideoTracks();
        for (var i = 0; i < tracks.length; i += 1) {
            if (tracks[i] && tracks[i].readyState === 'live') {
                return tracks[i];
            }
        }
        return null;
    }

    /**
     * Make sure the peer connection sends exactly this video track.
     *
     * @return {Promise<boolean>} true when the peer connection must renegotiate.
     */
    async function attachVideoTrackToSender(track) {
        if (!pc || !track) return false;

        var sender = findVideoSender();

        if (sender) {
            if (sender.track !== track) {
                await sender.replaceTrack(track);
            }
            videoSender = sender;
            return false;
        }

        var videoTx = pc.getTransceivers().find(function (t) {
            return (t.receiver && t.receiver.track && t.receiver.track.kind === 'video')
                || (t.sender && (!t.sender.track || t.sender.track.kind === 'video'));
        });

        if (videoTx && videoTx.sender) {
            await videoTx.sender.replaceTrack(track);
            try { videoTx.direction = 'sendrecv'; } catch (eDir) { /* ignore */ }
            videoSender = videoTx.sender;
            return videoTx.currentDirection === 'inactive' || videoTx.currentDirection === 'recvonly';
        }

        videoSender = pc.addTrack(track, localStream);
        return true;
    }

    /**
     * Attach the local stream to the self-view element.
     *
     * The element is never removed or hidden: when the camera is off the
     * track simply produces no frames and the camera-off placeholder is
     * shown on top of it.
     */
    function attachLocalVideo() {
        if (!els.localVideo || !localStream) return;
        if (els.localVideo.srcObject !== localStream || cameraEnabled) {
            els.localVideo.srcObject = null;
            els.localVideo.srcObject = localStream;
        }
        // FIX BUG #1: Ensure all required video attributes are set
        // VERIFIED: attachLocalVideo() sets muted, playsInline, autoplay, and hidden 
        // attributes (lines 1687-1693). Local preview displays correctly.
        els.localVideo.muted = true;
        els.localVideo.setAttribute('muted', '');
        els.localVideo.playsInline = true;
        els.localVideo.autoplay = true;
        els.localVideo.hidden = false;
        els.localVideo.classList.toggle('is-camera-off', !cameraEnabled);
        try {
            var lp = els.localVideo.play();
            if (lp && typeof lp.catch === 'function') {
                lp.catch(function () {});
            }
        } catch (ePlay) { /* ignore */ }
        syncLocalPipLayout();
    }

    /**
     * Keep the camera button, the self-view and the placeholder in sync with
     * the real media state.
     */
    function syncCameraUi() {
        var on = !!cameraEnabled;
        setCameraUi(on);
        if (els.cameraBtn) {
            els.cameraBtn.classList.remove('is-busy');
            els.cameraBtn.removeAttribute('aria-busy');
        }
        if (els.localVideo) {
            // The self-view stays mounted; only its state class changes.
            els.localVideo.classList.toggle('is-camera-off', !on);
            els.localVideo.classList.toggle('is-camera-on', on);
        }
        if (els.localVideoOff) {
            els.localVideoOff.hidden = on;
            var localOffAvatar = document.getElementById('commsLocalVideoOffAvatar');
            if (localOffAvatar) {
                var me = myIdentity();
                var root = getCallRoot();
                var meSrc = root ? (root.dataset.currentUserAvatar || '') : '';
                paintAvatar(localOffAvatar, me.name || 'You', meSrc);
            }
        }
        if (els.remoteVideoOff) {
            els.remoteVideoOff.hidden = remoteCameraEnabled;
            els.remoteVideoOff.setAttribute('aria-hidden', remoteCameraEnabled ? 'true' : 'false');
        }
        if (els.inCall) {
            els.inCall.classList.toggle('is-remote-camera-off', !remoteCameraEnabled);
            els.inCall.classList.toggle('is-local-camera-off', !on);
            els.inCall.classList.toggle('is-remote-mic-off', !remoteMicEnabled);
        }
        var remoteMicOff = document.getElementById('commsRemoteMicOff');
        if (remoteMicOff) {
            remoteMicOff.hidden = remoteMicEnabled;
        }
    }

    async function renegotiateForCamera() {
        if (!pc || !currentCall || negotiating) return;
        if (pc.signalingState !== 'stable') return;
        negotiating = true;
        try {
            var offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);
            await signalPeer({
                type: 'offer',
                call_id: currentCall.id,
                conversation_id: currentCall.conversation_id,
                sdp: offer,
                call_type: (currentCall && currentCall.call_type) || 'voice',
                renegotiate: true
            });
        } catch (e) {
            /* ignore */
        } finally {
            negotiating = false;
        }
    }

    function remountCallEls() {
        els.inCall = document.getElementById('commsInCall') || els.inCall;
        els.incoming = document.getElementById('commsIncomingCall') || els.incoming;
        els.remoteVideo = document.getElementById('commsRemoteVideo') || els.remoteVideo;
        els.localVideo = document.getElementById('commsLocalVideo') || els.localVideo;
        els.remoteAudio = document.getElementById('commsRemoteAudio') || els.remoteAudio;
        els.timer = document.getElementById('commsCallTimer') || els.timer;
        els.callStatus = document.getElementById('commsCallStatus') || els.callStatus;
        els.peerName = document.getElementById('commsCallPeerName') || els.peerName;
        els.localVideoOff = document.getElementById('commsLocalVideoOff') || els.localVideoOff;
        els.remoteVideoOff = document.getElementById('commsRemoteVideoOff') || els.remoteVideoOff;
        if (els.inCall && els.inCall.parentNode !== document.body) {
            document.body.appendChild(els.inCall);
        }
    }

    function keepActiveCallVisible(statusText) {
        remountCallEls();
        if (!els.inCall) return;
        hideEnded();
        if (els.incoming) els.incoming.hidden = true;
        els.inCall.hidden = false;
        els.inCall.removeAttribute('hidden');
        document.documentElement.classList.add('comms-in-call');
        document.body.classList.add('comms-in-call');
        if (statusText) setCallStatus(statusText);
        if (els.timer) {
            els.timer.hidden = false;
            if (!callStartedAt) els.timer.textContent = '00:00';
            else renderTimer();
        }
        attachLocalVideo();
        if (remoteStream) bindRemoteMedia(remoteStream);
    }

    function isLiveAcceptedCall() {
        if (startingCall || callConnected || pc || pendingStart) return true;
        if (els.inCall && !els.inCall.hidden && currentCall) return true;
        if (currentCall && currentCall.id != null && answeredCallIds[Number(currentCall.id)]) return true;
        return false;
    }

    function showInCall(call, statusText) {
        remountCallEls();
        if (!els.inCall) return;
        hideEnded();
        if (els.incoming) els.incoming.hidden = true;
        els.inCall.hidden = false;
        els.inCall.removeAttribute('hidden');
        document.documentElement.classList.add('comms-in-call');
        document.body.classList.add('comms-in-call');
        if (els.peerName) {
            els.peerName.textContent = (call.peer && call.peer.name) || 'Call';
        }
        setCallPeerAvatar(call);
        setCallStatus(statusText || (callConnected ? 'Connected' : 'Calling...'));
        // The timer is never reset by a UI update: it is only initialised when
        // the call actually connects.
        if (els.timer) {
            if (callStartedAt) {
                renderTimer();
            } else {
                els.timer.textContent = '00:00';
            }
        }
        setMuteUi(false);
        updateCameraUi();
        syncLocalPipLayout();
        unlockRemotePlayback();
    }

    async function cleanupMediaOnly() {
        if (cleaningCall && !pc && !localStream) {
            return;
        }
        cleaningCall = true;
        clearPendingStart();
        clearRingTimeout();
        clearConnectionTimeout();
        stopCallHeartbeat();
        if (iceDisconnectTimer) {
            clearTimeout(iceDisconnectTimer);
            iceDisconnectTimer = null;
        }
        stopRingtone();
        
        clearInterval(callTimer);
        callTimer = null;
        lastCallDurationMs = callElapsedMs();
        callStartedAt = null;
        
        cameraEnabled = false;
        wantsVideo = false;
        callConnected = false;
        peerAnsweredFor = null;
        remoteCameraEnabled = true;
        remoteMicEnabled = true;
        videoSender = null;
        cameraPending = null;
        cameraBusy = false;
        role = null;
        startingCall = false;
        
        if (els.endBtn) setCtrlLabel(els.endBtn, 'End');
        if (els.muteBtn) {
            els.muteBtn.hidden = false;
            setMuteUi(false);
        }
        if (els.cameraBtn) els.cameraBtn.hidden = false;
        if (localStream) {
            localStream.getTracks().forEach(function (t) { t.stop(); });
            localStream = null;
        }
        // Clean up remote track event listeners before nulling remoteStream
        if (remoteStream && typeof remoteStream.getTracks === 'function') {
            remoteStream.getTracks().forEach(function (track) {
                if (track._commsUnmuteHandler) {
                    track.removeEventListener('unmute', track._commsUnmuteHandler);
                    delete track._commsUnmuteHandler;
                }
                if (track._commsEndedHandler) {
                    track.removeEventListener('ended', track._commsEndedHandler);
                    delete track._commsEndedHandler;
                }
                try { track.stop(); } catch (e) { /* ignore */ }
            });
        }
        if (pc) {
            // Explicitly null out event handlers before closing
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.oniceconnectionstatechange = null;
            pc.onconnectionstatechange = null;
            pc.onnegotiationneeded = null;
            pc.ondatachannel = null;
            pc.onicecandidateerror = null;
            
            try { pc.close(); } catch (e) { /* ignore */ }
            pc = null;
        }
        // Close audio unlock context
        if (audioUnlockCtx) {
            try {
                audioUnlockCtx.close();
            } catch (e) { /* ignore */ }
            audioUnlockCtx = null;
        }
        // FIX BUG #4 & #5: Clear ICE queue to prevent stale candidates
        // VERIFIED: cleanupMediaOnly() clears iceQueue (line 1859) and calls 
        // teardownCallChannel() (line 1883) to prevent stale state.
        iceQueue = [];
        
        remoteStream = null;
        negotiating = false;
        if (els.remoteVideo) {
            els.remoteVideo.srcObject = null;
            // Remove event listeners bound to remote video
            if (els.remoteVideo._commsMetricsBound) {
                els.remoteVideo.removeEventListener('loadedmetadata', applyRemoteVideoMetrics);
                els.remoteVideo.removeEventListener('resize', applyRemoteVideoMetrics);
                els.remoteVideo._commsMetricsBound = false;
            }
        }
        if (els.localVideo) els.localVideo.srcObject = null;
        if (els.remoteAudio) els.remoteAudio.srcObject = null;
        if (els.inCall) {
            els.inCall.hidden = true;
            els.inCall.classList.remove('is-connected', 'has-remote-video', 'is-video-call', 'is-remote-portrait', 'is-remote-landscape');
        }
        if (els.remoteVideo) {
            els.remoteVideo.classList.remove('is-remote-portrait', 'is-remote-landscape');
        }
        // FIX BUG #5: Always teardown call channel to prevent stale signals
        if (window.CommsRealtime && typeof window.CommsRealtime.teardownCallChannel === 'function') {
            window.CommsRealtime.teardownCallChannel();
        }
        if (els.callCenter) {
            els.callCenter.classList.remove('is-compact');
            els.callCenter.hidden = false;
        }
        if (els.incoming) els.incoming.hidden = true;
        if (els.remoteVideoOff) els.remoteVideoOff.hidden = true;
        if (els.localVideoOff) els.localVideoOff.hidden = true;
        var remoteMicOffEl = document.getElementById('commsRemoteMicOff');
        if (remoteMicOffEl) remoteMicOffEl.hidden = true;
        document.documentElement.classList.remove('comms-in-call');
        document.body.classList.remove('comms-in-call');
        cleaningCall = false;
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
        var r = routes();
        if (!r.callStatus || !window.Comms) return null;
        return window.Comms.api(window.Comms.route(r.callStatus, callId), {
            method: 'POST',
            body: JSON.stringify({ status: status }),
            dedupe: false
        }).then(function (data) {
            publishCallNotice(data);
            return data.call;
        });
    }

    async function finishUnanswered(reason) {
        if (!currentCall || callConnected) return;
        var callSnapshot = currentCall;
        if (callSnapshot.id != null) markCallTerminal(callSnapshot.id);
        rememberCallContext(callSnapshot);
        var peerName = (callSnapshot.peer && callSnapshot.peer.name) || '';
        var status = reason === 'rejected' ? 'rejected'
            : (reason === 'cancelled' ? 'cancelled' : 'missed');

        clearRingTimeout();
        stopRingtone();

        try {
            await signalPeer({
                type: 'call-end',
                reason: status,
                ended_by_role: role || (status === 'cancelled' ? 'caller' : 'callee'),
                call_id: callSnapshot.id,
                conversation_id: callSnapshot.conversation_id,
                caller_id: callSnapshot.caller_id,
                caller_type: callSnapshot.caller_type,
                receiver_id: callSnapshot.receiver_id,
                receiver_type: callSnapshot.receiver_type
            });
        } catch (hangupErr) { /* still clean up locally */ }
        currentCall = null;
        await cleanupMediaOnly();
        var serverCall = callSnapshot.id
            ? await withTimeout(updateCallStatus(callSnapshot.id, status), 4000)
            : null;
        showCallEnded(status, peerName, callSnapshot.id, null, serverCall);
        refreshCallChat(callSnapshot.conversation_id);
    }

    function clearPendingStart() {
        if (pendingStartTimer) {
            clearTimeout(pendingStartTimer);
            pendingStartTimer = null;
        }
        if (pendingStartTick) {
            clearInterval(pendingStartTick);
            pendingStartTick = null;
        }
        pendingStart = null;
    }

    async function cancelPendingStart() {
        if (!pendingStart) return false;
        clearPendingStart();
        role = null;
        currentCall = null;
        await cleanupMediaOnly();
        hideEnded();
        toast('Call cancelled.', 'info');
        return true;
    }

    function beginCallCountdown(conversationId, callType, conversation, receiverId) {
        if (startingCall || pendingStart) return;
        // Stale FE state after a failed/ended call must not block a new start.
        if (currentCall) {
            var inCallVisible = els.inCall && !els.inCall.hidden;
            var incomingVisible = els.incoming && !els.incoming.hidden;
            if (inCallVisible || incomingVisible || callConnected) return;
            currentCall = null;
        }

        var peer = (conversation && conversation.other_user) || {};
        if (!isPeerCallableOnline(peer)) {
            toast((peer.name || 'This contact') + ' is currently offline.', 'error');
            showCallEnded('offline', peer.name || 'Contact', null);
            setCallStatus('Offline — call ended');
            return;
        }

        try {
            assertMediaReady();
        } catch (err) {
            toast(err.message || 'Unable to start call.', 'error');
            return;
        }
        if (!window.CommsRealtime || !window.CommsRealtime.enabled) {
            toast('Realtime is not configured. Rebuild after setting VITE_SUPABASE keys.', 'error');
            return;
        }

        role = 'caller';
        callConnected = false;
        lastEndedCallId = null;
        pendingStart = {
            conversationId: conversationId,
            callType: callType,
            conversation: conversation,
            receiverId: receiverId || null
        };

        peer = peer.name ? peer : { name: 'Contact' };
        var remaining = Math.ceil(CALL_START_DELAY_MS / 1000);
        showInCall({ peer: peer, call_type: callType }, 'Starting in ' + remaining + 's...');
        if (els.muteBtn) els.muteBtn.hidden = true;
        if (els.cameraBtn) els.cameraBtn.hidden = true;
        setCtrlLabel(els.endBtn, 'Cancel');

        setCallStatus('Starting in ' + remaining + 's — tap Cancel to stop');
        pendingStartTick = setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) return;
            setCallStatus('Starting in ' + remaining + 's — tap Cancel to stop');
        }, 1000);

        pendingStartTimer = setTimeout(function () {
            var queuedReceiverId = pendingStart ? pendingStart.receiverId : null;
            var queuedConversation = pendingStart ? pendingStart.conversation : conversation;
            var queuedType = pendingStart ? pendingStart.callType : callType;
            clearPendingStart();
            if (els.muteBtn) els.muteBtn.hidden = false;
            if (els.cameraBtn) els.cameraBtn.hidden = false;
            setCtrlLabel(els.endBtn, 'End');
            // Caller UI: show ringing immediately when countdown ends (before API finishes).
            var callerPeer = (queuedConversation && queuedConversation.other_user) || peer || { name: 'Contact' };
            role = 'caller';
            callConnected = false;
            showInCall({
                peer: callerPeer,
                call_type: queuedType || callType
            }, 'Calling...');
            startRingtone('outgoing');
            placeCall(conversationId, queuedType || callType, queuedConversation, queuedReceiverId);
        }, CALL_START_DELAY_MS);
    }

    function isPeerCallableOnline(peer) {
        peer = peer || {};
        var peerId = Number(peer.id || 0);
        var portal = peer.user_type || peer.type || peer.portal || '';
        if (peerId && isPresenceOnline(peerId, portal)) {
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
        if (!window.Comms || startingCall) return;
        startingCall = true;
        
        // FIX BUG #3: Force stop any existing timer before starting new call
        stopCallTimer();
        
        var r = routes();
        try {
            assertMediaReady();
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
            role = 'caller';
            callConnected = false;
            lastEndedCallId = null;
            lastCallDurationMs = 0;
            currentCall = data.call;
            publishCallNotice(data);
            wantsVideo = callType === 'video';
            if (conversation && conversation.other_user && !conversation.other_user.is_group) {
                currentCall.peer = conversation.other_user;
            }
            rememberCallContext(currentCall);
            if (els.muteBtn) els.muteBtn.hidden = false;
            if (els.cameraBtn) els.cameraBtn.hidden = false;
            setCtrlLabel(els.endBtn, 'End');
            showInCall(Object.assign({}, currentCall, {
                peer: currentCall.peer || (conversation && conversation.other_user) || { name: 'Contact' }
            }), 'Ringing...');
            startRingtone('outgoing');
            armRingTimeout();
            var callerDisplayName = (myIdentity().name)
                || document.getElementById('commsPeerName')?.textContent
                || 'Caller';
            // Construct caller_profile from current user's dataset attributes
            var root = getCallRoot();
            var caller_profile = {
                name: myIdentity().name,
                sk_position: root ? root.dataset.currentUserPosition : '',
                barangay_name: root ? root.dataset.currentUserBarangay : '',
                profile_image_url: root ? root.dataset.currentUserAvatar : ''
            };
            // Subscribe + ring peer immediately (do not wait for getUserMedia / SDP).
            var channelReady = subscribeCallChannel(conversationId);
            var ringSignal = signalPeer({
                type: 'call-invite',
                call_id: currentCall.id,
                conversation_id: conversationId,
                call_type: callType,
                peer_name: callerDisplayName,
                from_name: callerDisplayName,
                caller_id: currentCall.caller_id,
                caller_type: currentCall.caller_type,
                receiver_id: currentCall.receiver_id,
                receiver_type: currentCall.receiver_type,
                caller_profile: caller_profile
            });
            await Promise.all([channelReady, ringSignal]);
            setCallStatus('Ringing...');
            await ensurePeerConnection(wantsVideo);
            if (wantsVideo) {
                cameraEnabled = true;
                var outTrack = findLiveVideoTrack();
                if (outTrack) outTrack.enabled = true;
                attachLocalVideo();
                syncCameraUi();
            }
            var offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: !!wantsVideo
            });
            await pc.setLocalDescription(offer);
            await signalPeer({
                type: 'offer',
                call_id: currentCall.id,
                conversation_id: conversationId,
                sdp: offer,
                call_type: callType,
                peer_name: callerDisplayName,
                from_name: callerDisplayName,
                caller_id: currentCall.caller_id,
                caller_type: currentCall.caller_type,
                receiver_id: currentCall.receiver_id,
                receiver_type: currentCall.receiver_type,
                caller_profile: caller_profile
            });
            setCallStatus('Ringing...');
            refreshCallChat(conversationId);
        } catch (err) {
            toast(callErrorMessage(err), 'error');
            if (currentCall && currentCall.id) {
                try { await updateCallStatus(currentCall.id, 'cancelled'); } catch (e) { /* ignore */ }
            }
            currentCall = null;
            await cleanupMediaOnly();
            hideEnded();
        } finally {
            startingCall = false;
        }
    }

    async function startCall(conversationId, callType, conversation, receiverId) {
        // Groups skip offline peer check — recipient is chosen explicitly.
        if (conversation && (conversation.conversation_type === 'group' || conversation.is_default_group || (conversation.other_user && conversation.other_user.is_group))) {
            if (startingCall || pendingStart || currentCall) return;
            try {
                assertMediaReady();
            } catch (err) {
                toast(callErrorMessage(err), 'error');
                return;
            }
            if (!window.CommsRealtime || !window.CommsRealtime.enabled) {
                toast('Realtime is not configured. Rebuild after setting VITE_SUPABASE keys.', 'error');
                return;
            }
            placeCall(conversationId, callType, conversation, receiverId);
            return;
        }
        beginCallCountdown(conversationId, callType, conversation, receiverId);
    }

    function waitForRemoteOffer(ms) {
        return new Promise(function (resolve) {
            if (currentCall && currentCall._remoteOffer) {
                resolve(true);
                return;
            }
            var started = Date.now();
            var timer = setInterval(function () {
                if (currentCall && currentCall._remoteOffer) {
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
        stopRingtone();
        clearRingTimeout();
        if (typeof window.CommsWebRTC !== 'undefined'
            && typeof window.CommsWebRTC.__acceptGroupIfPending === 'function') {
            try {
                var groupHandled = await window.CommsWebRTC.__acceptGroupIfPending();
                if (groupHandled) {
                    hideIncoming();
                    stopRingtone();
                    return;
                }
            } catch (err) {
                toast((err && err.message) || 'Unable to join group call.', 'error');
                return;
            }
        }

        // Answer must apply to the exact call id shown in the modal.
        var modalCallId = incomingCallId != null ? Number(incomingCallId) : null;
        var source = (modalCallId != null && incomingCall && Number(incomingCall.id) === modalCallId)
            ? incomingCall
            : currentCall;
        if (!source || startingCall) return;
        if (modalCallId != null && Number(source.id) !== modalCallId) {
            // The modal belongs to a different call — never answer the wrong one.
            return;
        }
        if (modalCallId != null && answeredCallIds[modalCallId]) return;

        // From here on the call object is the one the user accepted.
        var call = Object.assign({}, currentCall || {}, source);
        currentCall = call;

        startingCall = true;
        var acceptedCallId = call.id != null ? Number(call.id) : null;
        if (acceptedCallId) markCallTerminal(acceptedCallId);
        if (acceptedCallId) rememberCallId(answeredCallIds, acceptedCallId);
        answeredCall = call;

        // FIX BUG #3: Force stop any existing timer before accepting new call
        stopCallTimer();

        clearRingTimeout();
        stopRingtone();
        hideIncoming();
        try {
            assertMediaReady();
            showInCall(call, 'Connecting...');
            unlockRemotePlayback();
            armConnectionTimeout();
            wantsVideo = call.call_type === 'video';
            var acceptJobs = [
                subscribeCallChannel(call.conversation_id),
                signalPeer({
                    type: 'call-accept',
                    call_id: call.id,
                    conversation_id: call.conversation_id,
                    caller_id: call.caller_id,
                    caller_type: call.caller_type,
                    receiver_id: call.receiver_id,
                    receiver_type: call.receiver_type
                }),
                ensurePeerConnection(wantsVideo)
            ];
            updateCallStatus(call.id, 'accepted').then(function (accepted) {
                if (accepted && currentCall && Number(currentCall.id) === Number(accepted.id)) {
                    currentCall = Object.assign({}, currentCall, accepted);
                    answeredCall = currentCall;
                }
            }).catch(function () {});
            await Promise.all(acceptJobs);
            if (wantsVideo) {
                cameraEnabled = true;
                var pickupTrack = findLiveVideoTrack();
                if (pickupTrack) pickupTrack.enabled = true;
                attachLocalVideo();
                syncCameraUi();
            }
            if (!call._remoteOffer && currentCall && currentCall._remoteOffer) {
                call._remoteOffer = currentCall._remoteOffer;
            }
            if (!call._remoteOffer) {
                await waitForRemoteOffer(8000);
            }
            if (!call._remoteOffer && currentCall && currentCall._remoteOffer) {
                call._remoteOffer = currentCall._remoteOffer;
            }
            keepActiveCallVisible('Connecting...');
            startCallHeartbeat();
            if (call._remoteOffer && pc) {
                await pc.setRemoteDescription(call._remoteOffer);
                var answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await signalPeer({
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
                while (iceQueue.length) {
                    await pc.addIceCandidate(iceQueue.shift());
                }
                setCallStatus('Connecting...');
                attachLocalVideo();
                signalMediaState();
            } else {
                setCallStatus('Connecting...');
                keepActiveCallVisible('Connecting...');
            }
        } catch (err) {
            toast(err.message || 'Unable to accept call.', 'error');
            keepActiveCallVisible('Connecting...');
            if (!pc && !localStream) {
                if (call && call.id) {
                    try { await updateCallStatus(call.id, 'rejected'); } catch (e) { /* ignore */ }
                }
                var peer = (call && call.peer && call.peer.name) || '';
                var failId = call && call.id;
                var failConv = call && call.conversation_id;
                currentCall = null;
                await cleanupMediaOnly();
                showCallEnded('rejected', peer, failId);
                refreshCallChat(failConv);
            }
        }
    }

    async function rejectIncoming() {
        if (typeof window.CommsWebRTC !== 'undefined'
            && typeof window.CommsWebRTC.__rejectGroupIfPending === 'function') {
            try {
                var groupRejected = await window.CommsWebRTC.__rejectGroupIfPending();
                if (groupRejected) {
                    hideIncoming();
                    stopRingtone();
                    clearRingTimeout();
                    return;
                }
            } catch (e) { /* fall through */ }
        }
        // Decline must update the exact call session shown in the modal.
        var modalCallId = incomingCallId != null ? Number(incomingCallId) : null;
        var source = (modalCallId != null && incomingCall && Number(incomingCall.id) === modalCallId)
            ? incomingCall
            : currentCall;
        if (!source) return;
        if (modalCallId != null && Number(source.id) !== modalCallId) {
            return;
        }
        currentCall = Object.assign({}, currentCall || {}, source);
        if (currentCall.id != null) markCallTerminal(currentCall.id);
        await finishUnanswered('rejected');
    }

    /**
     * Ask the server for the terminal state of a call, but never block the UI
     * for long. The server owns the authoritative duration.
     */
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
        var r = routes();
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

    async function endCall() {
        if (typeof window.CommsWebRTC !== 'undefined'
            && typeof window.CommsWebRTC.__meshActive === 'function'
            && window.CommsWebRTC.__meshActive()
            && typeof window.CommsWebRTC.__meshLeave === 'function') {
            return window.CommsWebRTC.__meshLeave('ended');
        }

        if (pendingStart) {
            await cancelPendingStart();
            setCtrlLabel(els.endBtn, 'End');
            return;
        }

        if (!currentCall) {
            await cleanupMediaOnly();
            return;
        }

        if (!callConnected) {
            await finishUnanswered(role === 'caller' ? 'cancelled' : 'rejected');
            return;
        }

        var peerName = (currentCall.peer && currentCall.peer.name) || '';
        var callSnapshot = currentCall;
        if (callSnapshot.id != null) markCallTerminal(callSnapshot.id);
        rememberCallContext(callSnapshot);
        stopRingtone();
        hideIncoming();
        
        // FIX BUG #1: Send hangup signal BEFORE nulling currentCall
        // and WAIT for it to ensure the other participant receives it
        // VERIFIED: hangup signal sent with await before nulling currentCall (line 2465).
        // This ensures the other participant receives disconnect notification.
        try {
            await signalPeer({
                type: 'call-end',
                reason: 'ended',
                ended_by_role: role || 'caller',
                call_id: callSnapshot.id,
                conversation_id: callSnapshot.conversation_id,
                caller_id: callSnapshot.caller_id,
                caller_type: callSnapshot.caller_type,
                receiver_id: callSnapshot.receiver_id,
                receiver_type: callSnapshot.receiver_type
            });
        } catch (err) {
            console.error('Failed to send hangup signal:', err);
        }
        
        // Now safe to clean up local state
        currentCall = null;
        await cleanupMediaOnly();
        // The server owns the end timestamp and the duration.
        var serverCall = await withTimeout(updateCallStatus(callSnapshot.id, 'ended'), 4000);
        showCallEnded('ended', peerName, callSnapshot.id, role, serverCall);
        refreshCallChat(callSnapshot.conversation_id);
    }

    function sameCall(payload) {
        if (!payload || payload.call_id == null) return false;
        if (!currentCall) return false;
        return Number(currentCall.id) === Number(payload.call_id);
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
        var me = myIdentity();
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

    function applyPeerAnswered() {
        stopRingtone();
        stopVibration();
        clearRingTimeout();
        var cid = currentCall && currentCall.id != null ? Number(currentCall.id) : null;
        if (cid != null) rememberCallId(answeredCallIds, cid);
        if (peerAnsweredFor != null && cid != null && peerAnsweredFor === cid) {
            keepActiveCallVisible(callConnected ? 'Connected' : 'Connecting...');
            attachLocalVideo();
            return;
        }
        peerAnsweredFor = cid;
        startingCall = true;
        role = 'caller';
        keepActiveCallVisible('Connecting...');
        armConnectionTimeout();
        attachLocalVideo();
        updateCameraUi();
        unlockRemotePlayback();
        var ice = pc && (pc.iceConnectionState || pc.connectionState);
        if (ice === 'connected' || ice === 'completed') {
            callConnected = true;
            setCallStatus('Connected');
            maybeStartConnectedTimer();
        }
        startCallHeartbeat();
        signalMediaState();
    }

    async function handleSignal(payload) {
        if (!payload || !payload.type) return;
        payload = Object.assign({}, payload, { type: signalType(payload) });

        if (payload.type === 'incoming-call' || payload.type === 'offer') {
            var meOffer = myIdentity();
            var iAmOfferCaller = Number(payload.caller_id) === meOffer.id
                && (!meOffer.type || portalTypesMatch(payload.caller_type, meOffer.type));
            if (iAmOfferCaller) return;

            var signalCallId = payload.call_id != null ? Number(payload.call_id) : null;
            // Terminal calls: ignore BOTH stale incoming-call AND late offers (except renegotiation
            // while actively in that same call). Late offers after Decline used to re-open the modal.
            if (signalCallId && isCallAlreadyHandled(signalCallId)) {
                var sameActiveCall = currentCall && Number(currentCall.id) === signalCallId;
                if (payload.type === 'offer' && payload.sdp && sameActiveCall) {
                    currentCall._remoteOffer = payload.sdp;
                    if (pc && startingCall && pc.signalingState === 'stable') {
                        try {
                            await pc.setRemoteDescription(payload.sdp);
                            var lateAnswer = await pc.createAnswer();
                            await pc.setLocalDescription(lateAnswer);
                            await signalPeer({
                                type: 'answer',
                                call_id: currentCall.id,
                                conversation_id: currentCall.conversation_id,
                                sdp: lateAnswer,
                                caller_id: currentCall.caller_id,
                                caller_type: currentCall.caller_type,
                                receiver_id: currentCall.receiver_id,
                                receiver_type: currentCall.receiver_type
                            });
                            attachLocalVideo();
                            signalMediaState();
                        } catch (lateOfferErr) { /* waitForRemoteOffer may still apply */ }
                    }
                    if (!(callConnected && pc)) return;
                } else if (!(payload.type === 'offer' && payload.sdp && isActivelyInCall(signalCallId) && callConnected)) {
                    return;
                }
            }
            if (signalCallId && isActivelyInCall(signalCallId) && payload.type === 'incoming-call') {
                return;
            }
            if (callConnected && currentCall && payload.type === 'incoming-call'
                && Number(currentCall.id) !== Number(payload.call_id)) {
                replyBusy(payload);
                return;
            }
            if (callConnected && currentCall && payload.type === 'incoming-call') {
                return;
            }

            if (payload.type === 'offer' && payload.sdp && currentCall && pc && callConnected
                && Number(currentCall.id) === Number(payload.call_id)) {
                try {
                    if (pc.signalingState === 'have-local-offer') {
                        try { await pc.setLocalDescription({ type: 'rollback' }); } catch (rbErr) { /* ignore */ }
                    }
                    if (pc.signalingState === 'stable') {
                        await pc.setRemoteDescription(payload.sdp);
                        var renegoAnswer = await pc.createAnswer();
                        await pc.setLocalDescription(renegoAnswer);
                        await signalPeer({
                            type: 'answer',
                            call_id: currentCall.id,
                            conversation_id: currentCall.conversation_id,
                            sdp: renegoAnswer,
                            renegotiate: true
                        });
                        unlockRemotePlayback();
                        updateCameraUi();
                        scheduleRemoteVideoUiRefresh();
                    } else {
                        currentCall._remoteOffer = payload.sdp;
                    }
                } catch (renegoErr) {
                    currentCall._remoteOffer = payload.sdp;
                }
                return;
            }

            if (role === 'caller' && sameCall(payload)) return;
            if (payload.type === 'offer' && currentCall && currentCall._remoteOffer
                && Number(currentCall.id) === Number(payload.call_id)) {
                currentCall._remoteOffer = payload.sdp;
                return;
            }
            lastEndedCallId = null;
            role = 'callee';
            currentCall = Object.assign({}, currentCall || {}, {
                id: payload.call_id,
                conversation_id: payload.conversation_id || (window.CommsChat && window.CommsChat.getActiveId()),
                call_type: payload.call_type || 'voice',
                peer: {
                    name: payload.peer_name || payload.from_name
                        || (currentCall && currentCall.peer && currentCall.peer.name)
                        || 'Incoming caller'
                },
                caller_id: payload.caller_id,
                caller_type: payload.caller_type,
                receiver_id: payload.receiver_id,
                receiver_type: payload.receiver_type,
                caller_profile: payload.caller_profile || (currentCall && currentCall.caller_profile) || null,
                _remoteOffer: payload.type === 'offer' ? payload.sdp : (currentCall && currentCall._remoteOffer)
            });
            subscribeCallChannel(currentCall.conversation_id);
            showIncoming(currentCall);
            return;
        }

        if (payload.type === 'call-busy') {
            if (payload.call_id != null && currentCall && Number(currentCall.id) !== Number(payload.call_id)) return;
            if (!currentCall || callConnected) return;
            toast('The other person is on another call.', 'error');
            await finishUnanswered('rejected');
            return;
        }

        if (payload.type === 'call-accepted' || payload.type === 'accepted') {
            if (payload.call_id != null && currentCall && Number(currentCall.id) !== Number(payload.call_id)) {
                return;
            }
            var meAccept = myIdentity();
            var iAmCallerAccept = currentCall
                && Number(currentCall.caller_id) === meAccept.id
                && (!meAccept.type || portalTypesMatch(currentCall.caller_type, meAccept.type)
                    || Number(currentCall.caller_id) === meAccept.id);
            if (role === 'callee' && !iAmCallerAccept) return;
            if (!currentCall && payload.call_id == null) return;
            role = 'caller';
            applyPeerAnswered();
            return;
        }

        if (payload.type === 'hangup') {
            var hangupMatchesIncoming = incomingCallId != null
                && payload.call_id != null
                && Number(incomingCallId) === Number(payload.call_id);
            if (currentCall && payload.call_id != null && Number(currentCall.id) !== Number(payload.call_id)
                && !hangupMatchesIncoming) {
                return;
            }
            if (!currentCall && !hangupMatchesIncoming && !(els.inCall && !els.inCall.hidden)
                && !(els.incoming && !els.incoming.hidden)) {
                if (payload.call_id != null) markCallTerminal(payload.call_id);
                return;
            }
            var reason = payload.reason || 'ended';
            var peerName = (currentCall && currentCall.peer && currentCall.peer.name) || '';
            var hangupId = (currentCall && currentCall.id) || payload.call_id;
            var hangupConv = (currentCall && currentCall.conversation_id) || payload.conversation_id;
            
            // FIX BUG #1 & #3: Mark call as terminal and cleanup immediately
            // VERIFIED: hangup handler marks terminal, stops timer, and cleans up 
            // immediately upon receiving hangup signal (lines 2594-2602).
            if (hangupId != null) markCallTerminal(hangupId);
            
            // FIX BUG #2: Stop the timer immediately when call ends
            stopCallTimer();
            
            currentCall = null;
            role = null;
            await cleanupMediaOnly();
            
            // The peer already ended the call server-side: read the
            // authoritative timestamps and duration from the server.
            var serverState = await withTimeout(fetchCallState(hangupId), 4000);
            showCallEnded(reason, peerName, hangupId, payload.ended_by_role, serverState);
            refreshCallChat(hangupConv);
            return;
        }

        if (payload.type === 'camera') {
            if (currentCall && payload.call_id != null && Number(currentCall.id) !== Number(payload.call_id)) {
                return;
            }
            remoteCameraEnabled = payload.enabled !== false;
            refreshRemoteFromReceivers();
            unlockRemotePlayback();
            updateCameraUi();
            return;
        }

        if (payload.type === 'mic') {
            if (currentCall && payload.call_id != null && Number(currentCall.id) !== Number(payload.call_id)) {
                return;
            }
            remoteMicEnabled = payload.enabled !== false;
            updateCameraUi();
            return;
        }

        if (payload.type === 'answer') {
            if (payload.call_id != null && currentCall && Number(currentCall.id) !== Number(payload.call_id)) {
                return;
            }
            if (!currentCall) return;
            stopRingtone();
            stopVibration();

            var isRenego = !!(payload.renegotiate) || (callConnected && pc && pc.signalingState === 'have-local-offer');
            if (role === 'callee' && !isRenego) return;

            if (pc && payload.sdp && (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable')) {
                try {
                    if (pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription(payload.sdp);
                    }
                    while (iceQueue.length) {
                        await pc.addIceCandidate(iceQueue.shift());
                    }
                } catch (e) { /* ignore duplicate/stale SDP */ }
            }

            if (isRenego && callConnected) {
                unlockRemotePlayback();
                updateCameraUi();
                scheduleRemoteVideoUiRefresh();
                return;
            }

            if (role === 'callee' && !isRenego) return;
            applyPeerAnswered();
            if (payload.started_at || payload.answered_at) {
                currentCall = Object.assign({}, currentCall || {}, {
                    started_at: payload.started_at || payload.answered_at,
                    server_time: payload.server_time || null
                });
            }
            refreshCallChat(currentCall && currentCall.conversation_id);
            return;
        }

        if ((payload.type === 'ice' || payload.type === 'ice-candidate') && payload.candidate) {
            if (!sameCall(payload)) return;
            if (!pc || !pc.remoteDescription) {
                iceQueue.push(payload.candidate);
            } else {
                try { await pc.addIceCandidate(payload.candidate); } catch (e) { /* ignore */ }
            }
        }
    }

    function handleCallRow(payload) {
        var row = (payload && payload.new) || null;
        if (!row) return;
        var isReceiver = isMeOnCallRow(row, true);
        var isCaller = isMeOnCallRow(row, false);
        var isGroupRow = !!(row.is_group_call)
            || (Number(row.caller_id) === Number(row.receiver_id)
                && String(row.caller_type || '') === String(row.receiver_type || ''));

        // Group invitees are neither caller nor receiver on the DB row (placeholder self-receiver).
        if (!isReceiver && !isCaller && !(isGroupRow && row.status === 'ringing')) return;

        if (isGroupRow && row.status === 'ringing' && !isCaller
            && typeof window.CommsWebRTC.__showIncomingGroup === 'function') {
            if (row.id != null && isCallAlreadyHandled(row.id)) return;
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

        if (row.status === 'ringing' && currentCall && Number(currentCall.id) === Number(row.id)
            && (answeredCallIds[Number(row.id)] || startingCall || callConnected || peerAnsweredFor === Number(row.id))) {
            return;
        }

        if (row.status === 'ringing' && isReceiver && !isGroupRow) {
            if (row.id != null && (isCallAlreadyHandled(row.id) || isActivelyInCall(row.id))) return;
            role = 'callee';
            currentCall = Object.assign({}, currentCall || {}, {
                id: row.id,
                conversation_id: row.conversation_id,
                call_type: row.call_type,
                caller_id: row.caller_id,
                caller_type: row.caller_type,
                receiver_id: row.receiver_id,
                receiver_type: row.receiver_type,
                peer: (currentCall && currentCall.peer) || { name: 'Incoming caller' }
            });
            subscribeCallChannel(row.conversation_id);
            showIncoming(currentCall);
            return;
        }

        if (row.status === 'accepted') {
            if (row.id != null) markCallTerminal(row.id);
            hideIncoming();
            stopRingtone();
            stopVibration();
            var mineOutgoing = isCaller || (role === 'caller' && currentCall && Number(currentCall.id) === Number(row.id));
            if (mineOutgoing) {
                role = 'caller';
                if (!currentCall || Number(currentCall.id) !== Number(row.id)) {
                    currentCall = Object.assign({}, currentCall || {}, {
                        id: row.id,
                        conversation_id: row.conversation_id,
                        call_type: row.call_type,
                        caller_id: row.caller_id,
                        caller_type: row.caller_type,
                        receiver_id: row.receiver_id,
                        receiver_type: row.receiver_type
                    });
                }
                applyPeerAnswered();
            } else if (currentCall && Number(currentCall.id) === Number(row.id)) {
                keepActiveCallVisible(callConnected ? 'Connected' : 'Connecting...');
            }
            return;
        }

        if (['rejected', 'cancelled', 'ended', 'missed'].indexOf(row.status) !== -1) {
            if (row.id != null) markCallTerminal(row.id);
            hideIncoming();
            stopRingtone();
            if (row.id != null && summaryShownFor[String(row.id)]) {
                if (currentCall && Number(currentCall.id) === Number(row.id)) {
                    currentCall = null;
                    cleanupMediaOnly();
                }
                refreshCallChat(row.conversation_id);
                return;
            }
            if (currentCall && Number(currentCall.id) === Number(row.id)) {
                var peerName = (currentCall.peer && currentCall.peer.name) || '';
                var rowId = row.id;
                var rowConv = row.conversation_id;
                var endedBy = isCaller
                    ? (row.status === 'cancelled' ? 'caller' : null)
                    : (row.status === 'cancelled' ? 'caller' : (row.status === 'rejected' ? 'callee' : null));
                currentCall = null;
                lastIncomingCallId = null;
                cleanupMediaOnly().then(function () {
                    showCallEnded(row.status, peerName, rowId, endedBy);
                    refreshCallChat(rowConv);
                });
            } else if (isReceiver && els.incoming && !els.incoming.hidden
                && Number(lastIncomingCallId) === Number(row.id)) {
                hideIncoming();
                stopRingtone();
                lastIncomingCallId = null;
                refreshCallChat(row.conversation_id);
            } else {
                refreshCallChat(row.conversation_id);
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
        resetCallerRoleIfIdle();
        if (isOutboundCallerBusy()) return;
        if (isLiveAcceptedCall()) return;
        if (els.incoming && !els.incoming.hidden) return;
        if (isActivelyInCall(null) && callConnected) return;
        var r = routes();
        var url = r.ringingCalls || r.calls;
        if (!url || !window.Comms || typeof window.Comms.api !== 'function') return;

        window.clearTimeout(incomingSyncTimer);
        incomingSyncTimer = window.setTimeout(function () {
            resetCallerRoleIfIdle();
            if (isOutboundCallerBusy()) return;
            if (isLiveAcceptedCall()) return;
            if (isActivelyInCall(null) && callConnected) return;
            window.Comms.api(url, { method: 'GET', dedupe: true }).then(function (data) {
                reconcileWithServerState(data);
                resetCallerRoleIfIdle();
                if (isOutboundCallerBusy()) return;
                if (isLiveAcceptedCall()) return;
                if (els.incoming && !els.incoming.hidden) return;
                if (isActivelyInCall(null) && callConnected) return;
                var me = myIdentity();
                var list = (data && data.calls) || [];
                var ringing = null;
                for (var i = 0; i < list.length; i += 1) {
                    var c = list[i];
                    if (!c || String(c.status) !== 'ringing') continue;
                    if (c.id != null && isCallAlreadyHandled(c.id)) continue;
                    if (conversationId && Number(c.conversation_id) !== Number(conversationId)) continue;
                    var groupRing = !!(c.is_group_call)
                        || (Number(c.caller_id) === Number(c.receiver_id)
                            && String(c.caller_type || '') === String(c.receiver_type || ''));
                    if (groupRing) {
                        var iAmHost = Number(c.caller_id) === me.id
                            && (!c.caller_type || !me.type || portalTypesMatch(c.caller_type, me.type));
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
                    if (c.receiver_type && me.type && !portalTypesMatch(c.receiver_type, me.type)) continue;
                    ringing = c;
                    break;
                }
                if (!ringing) {
                    for (var j = 0; j < list.length; j += 1) {
                        var row = list[j];
                        if (!row || String(row.status) !== 'ringing') continue;
                        if (row.id != null && isCallAlreadyHandled(row.id)) continue;
                        if (Number(row.receiver_id) !== me.id) continue;
                        if (conversationId && Number(row.conversation_id) !== Number(conversationId)) continue;
                        if (Number(row.caller_id) === Number(row.receiver_id)) continue;
                        ringing = row;
                        break;
                    }
                }
                if (ringing) {
                    role = 'callee';
                    showIncoming(ringing);
                    subscribeCallChannel(ringing.conversation_id);
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
    function reconcileWithServerState(data) {
        if (!data) return;
        var active = data.active_call || null;
        var activeId = active && active.id != null ? Number(active.id) : null;

        // The server says we are not in a call: release any local call state.
        if (!activeId) {
            if (isLiveAcceptedCall()) {
                keepActiveCallVisible(callConnected ? 'Connected' : 'Connecting...');
                return;
            }
            if (currentCall && currentCall.id) {
                var staleId = Number(currentCall.id);
                if (staleId !== lastEndedCallId && !isCallAlreadyHandled(staleId)) {
                    if (!callConnected && !startingCall && !pc) {
                        markCallTerminal(staleId);
                        currentCall = null;
                        role = null;
                    }
                }
            }
            return;
        }

        // The server reports an active call we did not know about (for example
        // after a reconnect). Adopt it instead of claiming a busy state.
        if (!currentCall && !callConnected && activeId !== lastEndedCallId
            && !isCallAlreadyHandled(activeId)) {
            currentCall = Object.assign({}, active);
            role = (active.direction === 'outgoing') ? 'caller' : 'callee';
        }
    }

    var ringingPollTimer = null;

    function ringingPollIntervalMs() {
        // The realtime broadcast is the primary delivery path; this poll is only
        // a safety net and must stay well below the API rate limit.
        var ms = Number(window.__COMMS_CALL_POLL_MS__) || 8000;
        return Math.max(4000, ms);
    }

    function startRingingPoll() {
        if (ringingPollTimer) return;
        syncIncomingFromServer(null);
        ringingPollTimer = window.setInterval(function () {
            if (document.visibilityState === 'hidden') return;
            resetCallerRoleIfIdle();
            if (isOutboundCallerBusy()) return;
            if (isLiveAcceptedCall()) return;
            if (els.incoming && !els.incoming.hidden) return;
            if (isActivelyInCall(null) && callConnected) return;
            syncIncomingFromServer(null);
        }, ringingPollIntervalMs());
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
        // Legacy numeric-only keys (older clients).
        var id = Number(userId || 0);
        return !!(id && map[id] && !portalType);
    }

    function showSecureContextBanner() {
        var root = getCallRoot();
        if (!root || resolveMediaDevices()) return;
        if (document.querySelector('.comms-secure-banner')) return;

        var banner = document.createElement('div');
        banner.className = 'comms-secure-banner';
        banner.setAttribute('role', 'alert');
        banner.innerHTML = '<strong>Calls need HTTPS.</strong> '
            + 'Open <a href="' + suggestedHttpsUrl() + '">' + suggestedHttpsUrl() + '</a> '
            + '(run <code>npm run serve:lan</code>), accept the certificate once, then voice/video will work.';
        if (root.id === 'commsApp') {
            root.classList.add('has-secure-banner');
            root.insertBefore(banner, root.firstChild);
        } else {
            document.body.appendChild(banner);
        }
    }

    mountCallUiToBody();

    document.addEventListener('click', function (e) {
        if (e.target && e.target.closest('#commsTapToPlay')) {
            e.preventDefault();
            unlockRemotePlayback();
            showTapToPlay(false);
            return;
        }
        if (e.target && e.target.closest('#commsIncomingCall') && ringtonePlaying) {
            unlockCallAudio();
        }
        var acceptBtn = e.target && e.target.closest('#commsAcceptCall');
        var rejectBtn = e.target && e.target.closest('#commsRejectCall');
        var endBtn = e.target && e.target.closest('#commsEndCall');
        var endedClose = e.target && e.target.closest('#commsCallEndedClose');
        var endedRedial = e.target && e.target.closest('#commsCallEndedRedial');
        if (acceptBtn) {
            e.preventDefault();
            unlockRemotePlayback();
            acceptIncoming();
            return;
        }
        if (rejectBtn) {
            e.preventDefault();
            rejectIncoming();
            return;
        }
        if (endBtn) {
            e.preventDefault();
            endCall();
            return;
        }
        if (endedRedial) {
            e.preventDefault();
            redialLastCall();
            return;
        }
        if (endedClose) {
            e.preventDefault();
            hideEnded();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && els.ended && !els.ended.hidden) {
            hideEnded();
        }
    });

    if (els.muteBtn) {
        els.muteBtn.addEventListener('click', function () {
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__meshActive === 'function' && window.CommsWebRTC.__meshActive()) {
                var pressed = els.muteBtn.getAttribute('aria-pressed') === 'true';
                var nextMuted = !pressed;
                if (typeof window.CommsWebRTC.__meshSetMuted === 'function') {
                    window.CommsWebRTC.__meshSetMuted(nextMuted);
                }
                setMuteUi(nextMuted);
                return;
            }
            if (!localStream) {
                toast('The call is not connected yet.', 'error');
                return;
            }
            // Muting only touches the audio tracks: the camera and the peer
            // connection are never affected.
            var audioTracks = localStream.getAudioTracks();
            if (!audioTracks.length) {
                toast('No microphone is available for this call.', 'error');
                return;
            }
            var currentlyEnabled = audioTracks.some(function (t) { return t.enabled; });
            var nextEnabled = !currentlyEnabled;
            audioTracks.forEach(function (t) {
                t.enabled = nextEnabled;
            });
            setMuteUi(!nextEnabled);
            if (currentCall) {
                signalPeer({
                    type: 'mic-state',
                    call_id: currentCall.id,
                    conversation_id: currentCall.conversation_id,
                    enabled: !!nextEnabled
                });
            }
        });
    }
    if (els.cameraBtn) {
        els.cameraBtn.hidden = false;
        els.cameraBtn.addEventListener('click', function () {
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__meshActive === 'function' && window.CommsWebRTC.__meshActive()) {
                var next = !(els.cameraBtn.getAttribute('aria-pressed') === 'true');
                if (typeof window.CommsWebRTC.__meshSetCamera === 'function') {
                    window.CommsWebRTC.__meshSetCamera(next).then(function () {
                        setCameraUi(next);
                        updateCameraUi();
                    }).catch(function (err) {
                        toast((err && err.message) || 'Unable to toggle camera.', 'error');
                    });
                }
                return;
            }
            if (!localStream || !pc) {
                toast('The call is not connected yet.', 'error');
                return;
            }
            // The desired state is derived from the real media state, so the
            // button always reflects reality even after a failed toggle.
            var next = !cameraEnabled;
            cameraPending = next;
            syncCameraUi();
            setCameraEnabled(next).catch(function (err) {
                toast((err && err.message) || 'Unable to toggle camera.', 'error');
                syncCameraUi();
            });
        });
    }

    showSecureContextBanner();
    bindRingtoneUnlock();

    window.addEventListener('orientationchange', syncLocalPipLayout);
    window.addEventListener('resize', syncLocalPipLayout);
    if (window.screen && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
        screen.orientation.addEventListener('change', syncLocalPipLayout);
    }

    function releaseCallOnUnload() {
        if (pendingStart) {
            clearPendingStart();
            return;
        }
        if (!currentCall || !currentCall.id) return;
        var callId = currentCall.id;
        var convId = currentCall.conversation_id;
        var status = callConnected ? 'ended' : (role === 'caller' ? 'cancelled' : 'rejected');
        try {
            signalPeer({
                type: 'call-end',
                reason: status,
                ended_by_role: role || 'caller',
                call_id: callId,
                conversation_id: convId,
                caller_id: currentCall.caller_id,
                caller_type: currentCall.caller_type,
                receiver_id: currentCall.receiver_id,
                receiver_type: currentCall.receiver_type
            });
        } catch (eSig) { /* ignore */ }
        var r = routes();
        if (!r.callStatus) {
            currentCall = null;
            callConnected = false;
            role = null;
            return;
        }
        var url = window.Comms && typeof window.Comms.route === 'function'
            ? window.Comms.route(r.callStatus, callId)
            : null;
        if (!url) {
            currentCall = null;
            callConnected = false;
            role = null;
            return;
        }
        var token = document.querySelector('meta[name="csrf-token"]');
        var body = JSON.stringify({ status: status });
        try {
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': token ? token.getAttribute('content') : '',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body,
                keepalive: true,
                credentials: 'same-origin'
            }).catch(function () {});
        } catch (e) { /* ignore */ }
        currentCall = null;
        callConnected = false;
        role = null;
    }

    window.addEventListener('pagehide', releaseCallOnUnload);
    window.addEventListener('beforeunload', releaseCallOnUnload);

    window.CommsWebRTC = {
        startCall: startCall,
        handleSignal: handleSignal,
        handleCallRow: handleCallRow,
        syncIncomingFromServer: syncIncomingFromServer,
        endCall: endCall,
        canUseMedia: function () {
            try {
                return !!resolveMediaDevices();
            } catch (e) {
                return false;
            }
        },
        suggestedHttpsUrl: suggestedHttpsUrl,
        __paintIncoming: showIncoming,
        __showEnded: showCallEnded,
        __startTimer: startTimer,
        __stopCallTimer: stopCallTimer
    };

    startRingingPoll();

    if (window.CommsRealtime && typeof window.CommsRealtime.flushPendingSignals === 'function') {
        window.CommsRealtime.flushPendingSignals();
    }
})();
