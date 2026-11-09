/**
 * Turns webrtc.js IIFE into ES modules sharing S + api.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgJs = path.resolve(here, '../packages/Communications/assets/js');
const srcPath = path.join(pkgJs, 'webrtc.js');
const outRoot = path.join(pkgJs, 'communications', 'webrtc');

const STATE = [
    'pc', 'localStream', 'currentCall', 'incomingCall', 'incomingCallId', 'lastCallContext',
    'callTimer', 'callStartedAt', 'lastCallDurationMs', 'iceQueue', 'startingCall', 'cameraEnabled',
    'wantsVideo', 'callConnected', 'ringTimeout', 'connectionTimeout', 'endedAutoClose', 'role',
    'lastEndedCallId', 'lastIncomingCallId', 'incomingSyncTimer', 'pendingStartTimer', 'pendingStartTick',
    'pendingStart', 'remoteStream', 'audioUnlockCtx', 'negotiating', 'callHeartbeatTimer',
    'summaryShownFor', 'answeredCall', 'cameraBusy', 'cameraPending', 'cameraChain',
    'remoteCameraEnabled', 'remoteMicEnabled', 'cameraSeq', 'remoteCameraSeq', 'videoSender',
    'iceDisconnectTimer', 'cleaningCall', 'clockOffsetMs', 'ringCtx', 'ringTimer', 'ringOscillators',
    'ringAudio', 'ringtonePlaying', 'ringMode', 'ringingCallId', 'peerAnsweredFor', 'ringUnlockBound',
    'ringNotify', 'timerCallId', 'dismissedRingIds', 'answeredCallIds', 'shownIncomingIds', 'els'
];

const FILE_FOR = {
    'core/MediaManager.js': [
        'isSecureMediaContext', 'suggestedHttpsUrl', 'resolveMediaDevices', 'mediaUnavailableMessage',
        'assertMediaReady', 'getLocalStream', 'showSecureContextBanner'
    ],
    'core/PeerConnection.js': [
        'ensurePeerConnection', 'findVideoSender', 'mergeRemoteTrack', 'bindRemoteMedia',
        'dropRemoteTracksOfKind', 'refreshRemoteFromReceivers', 'applyRemoteVideoMetrics',
        'hasLiveRemoteVideo', 'scheduleRemoteVideoUiRefresh', 'unlockRemotePlayback',
        'ensureRemoteAudioPlaying', 'showTapToPlay'
    ],
    'core/SignalingManager.js': [
        'routes', 'getCallRoot', 'myIdentity', 'subscribeCallChannel', 'signalTargets',
        'portalTypesMatch', 'isMeOnCallRow', 'signalPeer', 'signalMediaState', 'signalType',
        'sameCall', 'replyBusy', 'toast', 'refreshCallChat', 'publishCallNotice',
        'updateCallStatus', 'fetchCallState', 'withTimeout'
    ],
    'media/CameraController.js': [
        'setCameraEnabled', 'applyCameraState', 'findLiveVideoTrack', 'attachVideoTrackToSender',
        'attachLocalVideo', 'syncCameraUi', 'setCameraUi', 'updateCameraUi', 'renegotiateForCamera',
        'isVideoCallType', 'syncLocalPipLayout'
    ],
    'lifecycle/CallTimer.js': [
        'startTimer', 'stopCallTimer', 'maybeStartConnectedTimer', 'applyServerClock',
        'callElapsedMs', 'renderTimer', 'formatTimer', 'formatDuration', 'authoritativeDurationMs',
        'startCallHeartbeat', 'stopCallHeartbeat', 'formatClockTime'
    ],
    'lifecycle/IncomingCall.js': [
        'showIncoming', 'hideIncoming', 'bindRingtoneUnlock', 'unlockCallAudio', 'ensureRingAudio',
        'makeRingtoneDataUri', 'stopRingtone', 'stopVibration', 'startIncomingVibration',
        'playToneBurst', 'startOscillatorRing', 'startRingtone', 'armRingTimeout', 'clearRingTimeout',
        'ringHint', 'isInvitationExpired', 'rememberCallId', 'markCallTerminal', 'isCallAlreadyHandled',
        'isActivelyInCall', 'isOutboundCallerBusy', 'resetCallerRoleIfIdle'
    ],
    'lifecycle/OutgoingCall.js': [
        'placeCall', 'beginCallCountdown', 'clearPendingStart', 'cancelPendingStart', 'startCall',
        'isPeerCallableOnline', 'callErrorMessage', 'clearConnectionTimeout', 'armConnectionTimeout'
    ],
    'lifecycle/CallAnswer.js': ['acceptIncoming', 'waitForRemoteOffer'],
    'lifecycle/CallReject.js': ['rejectIncoming', 'finishUnanswered'],
    'lifecycle/CallEnd.js': ['endCall', 'releaseCallOnUnload'],
    'lifecycle/CallCleanup.js': ['cleanupMediaOnly'],
    'ui/CallUI.js': [
        'mountCallUiToBody', 'showInCall', 'showCallEnded', 'hideEnded', 'setCallStatus',
        'paintAvatar', 'setCallPeerAvatar', 'keepActiveCallVisible', 'remountCallEls',
        'isLiveAcceptedCall', 'endedCopy', 'rememberCallContext', 'setCtrlLabel', 'redialLastCall'
    ],
    'realtime/CallEvents.js': [
        'handleSignal', 'handleCallRow', 'syncIncomingFromServer', 'startRingingPoll', 'applyPeerAnswered'
    ],
    'controls/CallControls.js': ['setMuteUi']
};

function relImport(fromFile, toFile) {
    const fromDir = path.posix.dirname(fromFile);
    let rel = path.posix.relative(fromDir, toFile);
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

function headerFor(rel) {
    const state = relImport(rel, 'core/CallStateManager.js');
    const cfg = relImport(rel, 'utils/WebRTCConfig.js');
    const log = relImport(rel, 'utils/CallLogger.js');
    return `import { S, api, refreshEls } from '${state}';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '${cfg}';
import { callInfo, callWarn } from '${log}';

function stunConfig() { return iceConfig(); }

`;
}

function extractIifeBody(src) {
    const start = src.indexOf("(function () {");
    if (start < 0) throw new Error('IIFE start not found');
    let body = src.slice(src.indexOf('\n', start) + 1);
    body = body.replace(/^    'use strict';\n\n/, '');
    body = body.replace(/    callInfo\('build ' \+ CALL_BUILD \+ ' \| webrtc\.js loaded'\);\n    window\.CALL_DEBUG = true;\n\n    if \(window\.CommsWebRTC\) \{\n        return;\n    \}\n\n/, '');
    body = body.replace(/    var pc = null;[\s\S]*?    var timerCallId = null;\n\n/, '');
    body = body.replace(/    var els = \{[\s\S]*?\n    \};\n\n/, '');
    body = body.replace(/    function stunConfig\(\) \{[\s\S]*?    \}\n\n/, '');
    body = body.replace(/    var dismissedRingIds = Object\.create\(null\);\n    var answeredCallIds = Object\.create\(null\);\n    var shownIncomingIds = Object\.create\(null\);\n\n/, '');
    const end = body.lastIndexOf('\n})();');
    if (end >= 0) body = body.slice(0, end);
    return body;
}

function prefixState(body) {
    let out = body;
    STATE.sort((a, b) => b.length - a.length).forEach((name) => {
        const re = new RegExp('(?<!\\.)\\b' + name + '\\b', 'g');
        out = out.replace(re, 'S.' + name);
    });
    return out;
}

function prefixApiCalls(body, names) {
    let out = body;
    names.slice().sort((a, b) => b.length - a.length).forEach((fn) => {
        const re = new RegExp('(?<!function )(?<!async function )(?<!api\\.)\\b' + fn + '\\s*\\(', 'g');
        out = out.replace(re, 'api.' + fn + '(');
    });
    return out;
}

function parseFunctions(body) {
    const lines = body.split('\n');
    const fns = [];
    const re = /^    (async )?function ([A-Za-z0-9_]+)\(/;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(re);
        if (m) fns.push({ name: m[2], start: i });
    }
    const chunks = {};
    const preamble = [];
    const firstFn = fns[0] ? fns[0].start : lines.length;
    for (let i = 0; i < firstFn; i++) preamble.push(lines[i]);
    for (let i = 0; i < fns.length; i++) {
        const start = fns[i].start;
        const end = i + 1 < fns.length ? fns[i + 1].start : lines.length;
        chunks[fns[i].name] = lines.slice(start, end).join('\n');
    }
    let boot = '';
    if (fns.length) {
        const last = fns[fns.length - 1];
        const lastLines = chunks[last.name].split('\n');
        // split trailing boot (non-function) after last function's closing brace is hard;
        // keep boot in WebRTCManager via leftover after window.CommsWebRTC assignment later
        const bootIdx = lastLines.findIndex((l) => /^\s+mountCallUiToBody\(\)/.test(l) || /^\s+api\.mountCallUiToBody\(\)/.test(l) || /^\s+document\.addEventListener/.test(l));
        if (bootIdx > 0) {
            boot = lastLines.slice(bootIdx).join('\n');
            chunks[last.name] = lastLines.slice(0, bootIdx).join('\n');
        }
    }
    return { preamble: preamble.join('\n'), chunks, names: fns.map((f) => f.name), boot };
}

function fileForName(name) {
    for (const [file, names] of Object.entries(FILE_FOR)) {
        if (names.includes(name)) return file;
    }
    return 'core/WebRTCManager.js';
}

function dedentModule(text) {
    return text.replace(/^    /gm, '');
}

const src = fs.readFileSync(srcPath, 'utf8');
let body = extractIifeBody(src);
body = prefixState(body);
const parsed = parseFunctions(body);
body = prefixApiCalls(body, parsed.names);
const parsed2 = parseFunctions(body);

const buckets = {};
for (const name of parsed2.names) {
    const file = fileForName(name);
    buckets[file] = buckets[file] || [];
    buckets[file].push(parsed2.chunks[name]);
}

for (const [rel, parts] of Object.entries(buckets)) {
    const names = parsed2.names.filter((n) => fileForName(n) === rel);
    let extra = '';
    if (rel === 'core/WebRTCManager.js') {
        extra = '\n' + dedentModule(parsed2.preamble) + '\n';
    }
    if (rel === 'core/MediaManager.js') {
        extra = `const HTTPS_PORT_BY_HTTP = {
    '8000': '8440',
    '8005': '8440',
    '8006': '8441',
    '8080': '8441',
    '8002': '8443'
};

`;
    }
    const assigns = names.map((n) => `api.${n} = ${n};`).join('\n');
    const code = headerFor(rel) + extra + dedentModule(parts.join('\n')) + '\n\n' + assigns + '\n';
    const dest = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, code);
    console.log(String(code.split('\n').length).padStart(4), rel);
}

const bootPath = path.join(outRoot, 'core/_bootSnippet.js');
fs.writeFileSync(bootPath, dedentModule(parsed2.boot || ''));
console.log('boot snippet', (parsed2.boot || '').split('\n').length);
console.log('fn count', parsed2.names.length);
