/**
 * Authoritative 1:1 call runtime. Modules read/write S; UI reads S.els.
 */
export const STATES = {
    IDLE: 'idle',
    INITIATING: 'initiating',
    RINGING: 'ringing',
    ACCEPTED: 'accepted',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ENDED: 'ended',
    REJECTED: 'rejected',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    MISSED: 'missed'
};

export function createEls() {
    return {
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
}

export const S = {
    lifecycle: 'idle',
    pc: null,
    localStream: null,
    currentCall: null,
    incomingCall: null,
    incomingCallId: null,
    lastCallContext: null,
    callTimer: null,
    callStartedAt: null,
    timerAnchored: false,
    lastCallDurationMs: 0,
    iceQueue: [],
    startingCall: false,
    cameraEnabled: false,
    wantsVideo: false,
    callConnected: false,
    callAnswered: false,
    ringTimeout: null,
    connectionTimeout: null,
    endedAutoClose: null,
    role: null,
    lastEndedCallId: null,
    lastIncomingCallId: null,
    incomingSyncTimer: null,
    pendingStartTimer: null,
    pendingStartTick: null,
    pendingStart: null,
    remoteStream: null,
    audioUnlockCtx: null,
    negotiating: false,
    callHeartbeatTimer: null,
    summaryShownFor: Object.create(null),
    answeredCall: null,
    cameraBusy: false,
    cameraPending: null,
    cameraChain: Promise.resolve(),
    remoteCameraEnabled: true,
    remoteMicEnabled: true,
    cameraSeq: 0,
    remoteCameraSeq: 0,
    videoSender: null,
    iceDisconnectTimer: null,
    cleaningCall: false,
    clockOffsetMs: 0,
    ringCtx: null,
    ringTimer: null,
    ringOscillators: [],
    ringAudio: null,
    ringtonePlaying: false,
    ringMode: null,
    ringingCallId: null,
    peerAnsweredFor: null,
    ringUnlockBound: false,
    ringNotify: null,
    timerCallId: null,
    acceptingCallId: null,
    acceptGeneration: 0,
    answerAppliedFor: null,
    decliningCall: false,
    ringingPreview: false,
    previewGeneration: 0,
    _previewJob: null,
    redialLock: false,
    dismissedRingIds: Object.create(null),
    answeredCallIds: Object.create(null),
    shownIncomingIds: Object.create(null),
    els: null
};

export function refreshEls() {
    S.els = createEls();
    return S.els;
}

export function setLifecycle(next) {
    S.lifecycle = next;
    return S.lifecycle;
}

export function resetCallFields() {
    S.pc = null;
    S.localStream = null;
    S.currentCall = null;
    S.callConnected = false;
    S.callAnswered = false;
    S.role = null;
    S.startingCall = false;
    S.cameraEnabled = false;
    S.wantsVideo = false;
    S.videoSender = null;
    S.iceQueue = [];
    S.lifecycle = STATES.IDLE;
}

export const api = {};
