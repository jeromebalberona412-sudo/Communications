import { S, api, refreshEls } from './CallStateManager.js';
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../utils/media-constraints.js';
import { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, iceConfig } from '../utils/WebRTCConfig.js';
import { callInfo, callWarn } from '../utils/CallLogger.js';

function stunConfig() { return iceConfig(); }

const HTTPS_PORT_BY_HTTP = {
    '8000': '8440',
    '8005': '8440',
    '8006': '8441',
    '8080': '8441',
    '8002': '8443'
};

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
    if (!api.isSecureMediaContext()) {
        return 'Voice/video needs HTTPS. Open ' + api.suggestedHttpsUrl()
            + ' (run npm run serve:lan), accept the certificate warning, then try again.';
    }
    return 'Camera/microphone is not available in this browser. Check site permissions and try again.';
}

function assertMediaReady() {
    if (!api.isSecureMediaContext()) {
        var insecure = new Error(api.mediaUnavailableMessage());
        insecure.code = 'MEDIA_INSECURE';
        throw insecure;
    }
    var devices = api.resolveMediaDevices();
    if (!devices) {
        var err = new Error(api.mediaUnavailableMessage());
        err.code = 'MEDIA_UNAVAILABLE';
        throw err;
    }
    return devices;
}

async function getLocalStream(videoEnabled) {
    var devices = api.assertMediaReady();
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
                    api.toast('Camera unavailable â€” continuing with microphone only.', 'error');
                    S.cameraEnabled = false;
                    S.wantsVideo = false;
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
        throw new Error((err && err.message) || api.mediaUnavailableMessage());
    }
}

function showSecureContextBanner() {
    var root = api.getCallRoot();
    if (!root || api.resolveMediaDevices()) return;
    if (document.querySelector('.comms-secure-banner')) return;

    var banner = document.createElement('div');
    banner.className = 'comms-secure-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = '<strong>Calls need HTTPS.</strong> '
        + 'Open <a href="' + api.suggestedHttpsUrl() + '">' + api.suggestedHttpsUrl() + '</a> '
        + '(run <code>npm run serve:lan</code>), accept the certificate once, then voice/video will work.';
    if (root.id === 'commsApp') {
        root.classList.add('has-secure-banner');
        root.insertBefore(banner, root.firstChild);
    } else {
        document.body.appendChild(banner);
    }
}

api.isSecureMediaContext = isSecureMediaContext;
api.suggestedHttpsUrl = suggestedHttpsUrl;
api.resolveMediaDevices = resolveMediaDevices;
api.mediaUnavailableMessage = mediaUnavailableMessage;
api.assertMediaReady = assertMediaReady;
api.getLocalStream = getLocalStream;
api.showSecureContextBanner = showSecureContextBanner;
