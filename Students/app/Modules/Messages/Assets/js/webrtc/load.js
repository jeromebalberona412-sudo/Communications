/**
 * Lazy-load WebRTC / call UI only when a call is started or incoming.
 */
export function loadWebrtc() {
    if (window.CommsWebRTC && window.__COMMS_WEBRTC_BOOTSTRAPPED__) {
        return Promise.resolve(window.CommsWebRTC);
    }

    if (!window.__COMMS_WEBRTC_LOADING__) {
        window.__COMMS_WEBRTC_LOADING__ = import('./bootstrap.js').then(function (mod) {
            return mod.bootCommunicationsWebrtc();
        });
    }

    return window.__COMMS_WEBRTC_LOADING__;
}
