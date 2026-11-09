import { api } from '../core/CallStateManager.js';

export function startVideoCall(conversationId, conversation, receiverId) {
    return api.startCall(conversationId, 'video', conversation, receiverId);
}
