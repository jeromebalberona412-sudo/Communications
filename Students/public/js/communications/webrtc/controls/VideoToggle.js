import { api } from '../core/CallStateManager.js';
export function toggleVideo(enabled) { return api.setCameraEnabled(!!enabled); }
