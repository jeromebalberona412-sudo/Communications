export function rootEl() {
    return document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
}

export function me() {
    var root = rootEl();
    return {
        id: root ? Number(root.dataset.currentUserId || 0) : 0,
        type: root ? String(root.dataset.portalUserType || '') : '',
        name: root ? String(root.dataset.currentUserName || 'You') : 'You'
    };
}

export function toast(msg, type) {
    if (window.Comms && typeof window.Comms.showToast === 'function') {
        window.Comms.showToast(msg, type || 'error');
        return;
    }
    window.alert(msg);
}

export function routes() {
    return (window.CommsChat && window.CommsChat.routes) || {};
}

export function callElements() {
    return {
        inCall: document.getElementById('commsInCall'),
        incoming: document.getElementById('commsIncomingCall'),
        remoteGrid: document.getElementById('commsRemoteGrid'),
        remoteVideo: document.getElementById('commsRemoteVideo'),
        localVideo: document.getElementById('commsLocalVideo'),
        peerName: document.getElementById('commsCallPeerName'),
        callStatus: document.getElementById('commsCallStatus'),
        timer: document.getElementById('commsCallTimer'),
        callCenter: document.getElementById('commsCallCenter'),
        callAvatar: document.getElementById('commsCallPeerAvatar'),
        muteBtn: document.getElementById('commsMuteBtn'),
        cameraBtn: document.getElementById('commsCameraBtn')
    };
}
