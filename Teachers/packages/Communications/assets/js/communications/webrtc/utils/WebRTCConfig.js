import { CALL_BUILD as BUILD } from '../../../calls/config.js';

export const CALL_BUILD = '2026-11-09-d';
export { RING_TIMEOUT_MS, CALL_START_DELAY_MS, CONNECTION_TIMEOUT_MS, ICE_FAIL_GRACE_MS, STATUS_POLL_MS, EVENTS, CHANNEL } from '../../../calls/config.js';

export function iceConfig() {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
        ],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 4
    };
}

export function groupIceConfig() {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
        ]
    };
}

export const LEGACY_BUILD = BUILD;
