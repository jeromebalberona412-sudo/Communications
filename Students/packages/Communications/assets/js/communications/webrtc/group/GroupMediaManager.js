import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';

export async function acquireGroupStream(videoEnabled) {
    var devices = navigator.mediaDevices;
    if (!devices || typeof devices.getUserMedia !== 'function') {
        throw new Error('Camera/microphone is not available in this browser.');
    }
    if (!videoEnabled) {
        return devices.getUserMedia({ audio: true, video: false });
    }
    try {
        var stream = await devices.getUserMedia(mediaConstraints(true));
        await prepareLocalStream(stream);
        return stream;
    } catch (err) {
        var fallback = await devices.getUserMedia({
            audio: true,
            video: { facingMode: 'user' }
        });
        await prepareLocalStream(fallback);
        return fallback;
    }
}

export async function replaceGroupVideoTrack(stream, enabled) {
    if (!stream) return stream;
    stream.getVideoTracks().forEach(function (track) {
        try { track.stop(); } catch (e) { /* ignore */ }
        try { stream.removeTrack(track); } catch (e2) { /* ignore */ }
    });
    if (!enabled) return stream;
    var cam = await navigator.mediaDevices.getUserMedia(videoOnlyConstraints());
    await prepareLocalStream(cam);
    cam.getVideoTracks().forEach(function (track) {
        stream.addTrack(track);
    });
    return stream;
}
