import { api } from '../core/CallStateManager.js';

export function startAudioCall(conversationId, conversation, receiverId) {
    return api.startCall(conversationId, 'voice', conversation, receiverId);
}
