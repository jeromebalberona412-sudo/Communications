/**
 * Single source of truth for 1:1 + group call constants.
 * Event names must stay identical in Students and Teachers.
 */
export const CALL_BUILD = '2026-11-09-c';

export const RING_TIMEOUT_MS = 30000;
export const CALL_START_DELAY_MS = 400;
export const CONNECTION_TIMEOUT_MS = 30000;
export const ICE_FAIL_GRACE_MS = 8000;
export const STATUS_POLL_MS = 2500;

export const EVENTS = {
    CALL_END: 'call-end',
    HANGUP: 'hangup',
    CAMERA_STATE: 'camera-state',
    CAMERA: 'camera',
    MIC_STATE: 'mic-state',
    MIC: 'mic',
    ICE: 'ice',
    ICE_CANDIDATE: 'ice-candidate',
    CALL_INVITE: 'call-invite',
    INCOMING_CALL: 'incoming-call',
    CALL_ACCEPT: 'call-accept',
    CALL_ACCEPTED: 'call-accepted',
    GROUP_END: 'group-end',
    GROUP_LEAVE: 'group-leave',
    GROUP_JOIN: 'group-join',
    GROUP_ICE: 'group-ice'
};

export const CHANNEL = {
    SIGNAL_PREFIX: 'comms-signal-',
    INBOX_PREFIX: 'comms-inbox-'
};
