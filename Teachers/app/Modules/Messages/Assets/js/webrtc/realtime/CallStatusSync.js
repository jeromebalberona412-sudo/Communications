import { api } from '../core/CallStateManager.js';

export function syncCallStatus(callId) {
    if (typeof api.fetchCallState === 'function') return api.fetchCallState(callId);
    return Promise.resolve(null);
}

export function applyServerCallRow(payload) {
    if (typeof api.handleCallRow === 'function') return api.handleCallRow(payload);
}
