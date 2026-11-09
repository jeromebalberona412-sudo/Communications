import { state } from './state.js';
import { refreshUnread } from './unread.js';

export function scheduleInboxReload() {
    window.clearTimeout(state.inboxReloadTimer);
    state.inboxReloadTimer = window.setTimeout(function () {
        if (window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
            window.CommsChat.reloadConversations();
        }
        if (typeof window.refreshMessagesPopover === 'function') {
            window.refreshMessagesPopover();
        }
        refreshUnread();
    }, 0);
}
