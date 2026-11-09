import { api } from '../core/CallStateManager.js';

export function notifyCall(message, type) {
    if (typeof api.toast === 'function') api.toast(message, type || 'info');
}
