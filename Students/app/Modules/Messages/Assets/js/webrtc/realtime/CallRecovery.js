import { api } from '../core/CallStateManager.js';

export function recoverFromServer(data) {
    if (typeof api.reconcileWithServerState === 'function') {
        api.reconcileWithServerState(data);
    }
}
