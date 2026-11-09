import { api } from '../core/CallStateManager.js';

export function showAudioCall(call, statusText) {
    if (typeof api.showInCall === 'function') api.showInCall(call, statusText || 'Calling...');
}
