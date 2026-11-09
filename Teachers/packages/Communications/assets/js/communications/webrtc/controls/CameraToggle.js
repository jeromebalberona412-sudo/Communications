import { api } from '../core/CallStateManager.js';
export function toggleCamera(enabled) { return api.setCameraEnabled(!!enabled); }
