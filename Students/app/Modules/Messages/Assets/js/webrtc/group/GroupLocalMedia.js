import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';

export function createGroupLocalMedia(ctx, ui) {
    async function getLocalStream(videoEnabled) {
        var devices = navigator.mediaDevices;
        if (!devices || typeof devices.getUserMedia !== 'function') {
            throw new Error('Camera/microphone is not available.');
        }
        try {
            var stream = await devices.getUserMedia(mediaConstraints(!!videoEnabled));
            if (videoEnabled) {
                await prepareLocalStream(stream);
            }
            return stream;
        } catch (err) {
            if (videoEnabled) {
                try {
                    var fallback = await devices.getUserMedia({
                        audio: mediaConstraints(false).audio,
                        video: { facingMode: 'user' }
                    });
                    await prepareLocalStream(fallback);
                    return fallback;
                } catch (e2) {
                    err = e2;
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
            throw new Error((err && err.message) || 'Unable to access camera/microphone.');
        }
    }

    async function ensureLocalMedia() {
        if (ctx.meshLocalStream) return ctx.meshLocalStream;
        ctx.meshLocalStream = await getLocalStream(ctx.meshWantsVideo);
        ctx.meshCameraOn = !!ctx.meshWantsVideo;
        var e = ui.els();
        if (e.inCall) {
            e.inCall.hidden = false;
            e.inCall.classList.add('is-group-call');
            if (ctx.meshWantsVideo) e.inCall.classList.add('is-video-call');
        }
        if (e.localVideo) {
            e.localVideo.srcObject = ctx.meshLocalStream;
            e.localVideo.muted = true;
            e.localVideo.defaultMuted = true;
            e.localVideo.setAttribute('muted', '');
            e.localVideo.playsInline = true;
            e.localVideo.setAttribute('playsinline', '');
            e.localVideo.autoplay = true;
            e.localVideo.hidden = false;
            e.localVideo.classList.remove('is-camera-off');
            var play = e.localVideo.play();
            if (play && typeof play.catch === 'function') play.catch(function () { /* ignore */ });
            e.localVideo.classList.toggle('is-cam-landscape', false);
            e.localVideo.classList.toggle('is-cam-portrait', true);
            try {
                var track = ctx.meshLocalStream.getVideoTracks()[0];
                var settings = track && typeof track.getSettings === 'function' ? track.getSettings() : null;
                if (settings && settings.width && settings.height) {
                    var landscape = (Number(settings.width) / Number(settings.height)) >= 1.15;
                    e.localVideo.classList.toggle('is-cam-landscape', landscape);
                    e.localVideo.classList.toggle('is-cam-portrait', !landscape);
                }
            } catch (err) { /* ignore */ }
        }
        var off = document.getElementById('commsLocalVideoOff');
        if (off) off.hidden = !!ctx.meshCameraOn;
        return ctx.meshLocalStream;
    }

    return {
        getLocalStream: getLocalStream,
        ensureLocalMedia: ensureLocalMedia,
        videoOnlyConstraints: videoOnlyConstraints,
        prepareLocalStream: prepareLocalStream
    };
}
