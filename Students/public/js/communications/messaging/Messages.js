/**
 * Messaging stays in chat.js. This module is the public hook for call buttons.
 */
export function sendMessageThroughChat(conversationId, body) {
    if (window.CommsChat && typeof window.CommsChat.sendMessage === 'function') {
        return window.CommsChat.sendMessage(conversationId, body);
    }
    return Promise.reject(new Error('Chat is not ready.'));
}
