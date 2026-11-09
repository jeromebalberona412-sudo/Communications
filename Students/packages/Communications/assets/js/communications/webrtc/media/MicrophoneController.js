import { S, api } from '../core/CallStateManager.js';

export function setMicrophoneEnabled(enabled) {
    if (!S.localStream) return false;
    S.localStream.getAudioTracks().forEach(function (track) {
        track.enabled = !!enabled;
    });
    if (typeof api.setMuteUi === 'function') api.setMuteUi(!enabled);
    if (S.currentCall && typeof api.signalPeer === 'function') {
        api.signalPeer({
            type: 'mic-state',
            call_id: S.currentCall.id,
            conversation_id: S.currentCall.conversation_id,
            enabled: !!enabled
        });
    }
    return true;
}
