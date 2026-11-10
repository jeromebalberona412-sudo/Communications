export function rootEl() {
    return document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
}

export function samePortalType(a, b) {
    a = String(a || '').toLowerCase().trim();
    b = String(b || '').toLowerCase().trim();
    if (!a || !b) return true;
    if (a === b) return true;
    var students = { students: 1, student: 1, kabataan: 1, user: 1 };
    var teachers = { teachers: 1, teacher: 1, sk_official: 1, official: 1 };
    return !!((students[a] && students[b]) || (teachers[a] && teachers[b]));
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
