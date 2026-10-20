/**
 * Shared getUserMedia constraints for Communications voice/video.
 * Prefer sharper open-cam quality while keeping mobile framing natural.
 */

export function isCoarsePointerMobile() {
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(max-width: 900px)').matches) return true;
    } catch (e) { /* ignore */ }
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

export function audioConstraints() {
    // Prefer natural voice: light echo cancel only (avoid heavy DSP that makes audio robotic).
    return {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 }
    };
}

/**
 * Higher-quality framing for self/group video.
 */
export function videoConstraints() {
    var mobile = isCoarsePointerMobile();

    return {
        facingMode: { ideal: 'user' },
        aspectRatio: { ideal: mobile ? 4 / 3 : 16 / 9 },
        width: mobile
            ? { ideal: 960, min: 480, max: 1280 }
            : { ideal: 1280, min: 640, max: 1920 },
        height: mobile
            ? { ideal: 720, min: 360, max: 960 }
            : { ideal: 720, min: 360, max: 1080 },
        frameRate: { ideal: mobile ? 28 : 30, max: 30 }
    };
}

export function mediaConstraints(withVideo) {
    return {
        audio: audioConstraints(),
        video: withVideo ? videoConstraints() : false
    };
}

export function videoOnlyConstraints() {
    return {
        audio: false,
        video: videoConstraints()
    };
}

/**
 * If the track supports zoom, pin it to the minimum (usually 1x) so mobile
 * does not start in a cropped / zoomed mode. Prefer sharper ideals when available.
 */
export async function applyNaturalCameraFraming(track) {
    if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') {
        return;
    }

    try {
        var caps = track.getCapabilities() || {};
        var next = {};
        var mobile = isCoarsePointerMobile();

        if (caps.facingMode && caps.facingMode.indexOf('user') !== -1) {
            next.facingMode = 'user';
        }

        if (caps.zoom) {
            var minZoom = typeof caps.zoom.min === 'number' ? caps.zoom.min : 1;
            next.advanced = [{ zoom: minZoom }];
        }

        if (caps.width && caps.height) {
            next.width = { ideal: mobile ? 960 : 1280 };
            next.height = { ideal: mobile ? 720 : 720 };
        }

        if (caps.frameRate) {
            next.frameRate = { ideal: mobile ? 28 : 30 };
        }

        if (Object.keys(next).length) {
            await track.applyConstraints(next);
        }
    } catch (e) {
        // Capabilities/constraints vary widely; ignore unsupported apply.
    }
}

export async function prepareLocalStream(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return stream;
    var tracks = stream.getVideoTracks();
    for (var i = 0; i < tracks.length; i += 1) {
        await applyNaturalCameraFraming(tracks[i]);
    }
    return stream;
}
