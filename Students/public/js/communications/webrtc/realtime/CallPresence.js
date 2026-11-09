import { api } from '../core/CallStateManager.js';

export function isPeerOnline(userId, portalType) {
    if (typeof api.isPresenceOnline === 'function') {
        return api.isPresenceOnline(userId, portalType);
    }
    return false;
}
