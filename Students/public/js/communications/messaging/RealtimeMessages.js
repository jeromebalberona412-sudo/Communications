export function subscribeConversation(conversationId) {
    if (window.CommsRealtime && typeof window.CommsRealtime.subscribeConversation === 'function') {
        return window.CommsRealtime.subscribeConversation(conversationId);
    }
}
