import { api } from '../core/CallStateManager.js';

export function showVideoCall(call, statusText) {
    if (typeof api.showInCall === 'function') api.showInCall(call, statusText || 'Calling...');
    if (typeof api.attachLocalVideo === 'function') api.attachLocalVideo();
}
