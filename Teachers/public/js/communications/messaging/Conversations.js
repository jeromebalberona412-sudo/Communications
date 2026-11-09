export function openConversation(conversationId, opts) {
    if (typeof window.openChatWindow === 'function') {
        window.openChatWindow(conversationId, opts || {});
        return;
    }
    if (window.CommsChat && typeof window.CommsChat.openConversation === 'function') {
        window.CommsChat.openConversation(conversationId);
    }
}
