import { participantKey } from './ParticipantManager.js';
import { groupIceConfig } from '../utils/WebRTCConfig.js';

export function closePeerEntry(entry) {
    if (!entry || !entry.pc) return;
    try {
        entry.pc.onicecandidate = null;
        entry.pc.ontrack = null;
        entry.pc.onconnectionstatechange = null;
        entry.pc.close();
    } catch (e) { /* ignore */ }
    entry.pc = null;
}

export function closeAllPeers(peerMap) {
    Object.keys(peerMap || {}).forEach(function (key) {
        closePeerEntry(peerMap[key]);
        delete peerMap[key];
    });
}

export function getPeer(peerMap, id, type) {
    return peerMap[participantKey(id, type)] || null;
}

export function iceServers() {
    return groupIceConfig();
}
