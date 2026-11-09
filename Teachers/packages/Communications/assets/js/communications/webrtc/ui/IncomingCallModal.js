import { api } from '../core/CallStateManager.js';

export function paintIncoming(call) {
    if (typeof api.showIncoming === 'function') api.showIncoming(call);
}

export function hideIncomingModal() {
    if (typeof api.hideIncoming === 'function') api.hideIncoming();
}
