import { S, api } from '../core/CallStateManager.js';

var screenTrack = null;

export async function startScreenShare() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        throw new Error('Screen sharing is not supported in this browser.');
    }
    var display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    screenTrack = display.getVideoTracks()[0];
    if (!screenTrack) throw new Error('No screen track was created.');
    if (typeof api.attachVideoTrackToSender === 'function') {
        await api.attachVideoTrackToSender(screenTrack);
    }
    screenTrack.addEventListener('ended', function () {
        stopScreenShare().catch(function () {});
    });
    return screenTrack;
}

export async function stopScreenShare() {
    if (screenTrack) {
        try { screenTrack.stop(); } catch (e) { /* ignore */ }
        screenTrack = null;
    }
    if (S.cameraEnabled && typeof api.applyCameraState === 'function') {
        await api.applyCameraState(true);
    } else if (typeof api.attachVideoTrackToSender === 'function') {
        await api.attachVideoTrackToSender(null);
    }
}
