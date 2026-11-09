import { loadWebrtc } from '../../webrtc/load.js';
import { state } from './state.js';
import { ensureClient } from './client.js';
import { refreshUnread, updateHeaderBadge, markOpenConversationRead } from './unread.js';
import { stopTyping } from './typing.js';

export function attachLifecycleListeners() {
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            try {
                var stored = sessionStorage.getItem('commsUnreadTotal');
                if (stored !== null && stored !== '') {
                    updateHeaderBadge(Number(stored));
                }
            } catch (e) { /* ignore */ }
        }
        refreshUnread();
        if (window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
            window.CommsChat.reloadConversations();
        }
    });

    window.addEventListener('pagehide', function () {
        if (state.localTyping.active && state.localTyping.conversationId) {
            stopTyping(state.localTyping.conversationId);
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && state.localTyping.active && state.localTyping.conversationId) {
            stopTyping(state.localTyping.conversationId);
            return;
        }
        if (document.visibilityState !== 'visible') return;
        var activeId = window.CommsChat && typeof window.CommsChat.getActiveId === 'function'
            ? window.CommsChat.getActiveId()
            : null;
        if (activeId) markOpenConversationRead(activeId);
        refreshUnread();
        if (window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
            window.CommsChat.reloadActiveMessages();
        }
        loadWebrtc().then(function (api) {
            if (api && typeof api.syncIncomingFromServer === 'function') {
                api.syncIncomingFromServer(null);
            }
        });
    });

    window.addEventListener('beforeunload', function () {
        var sb = ensureClient();
        if (!sb) return;

        try {
            Object.keys(state.topicChannels).forEach(function (topic) {
                try { sb.removeChannel(state.topicChannels[topic].channel); } catch (e) { /* ignore */ }
                delete state.topicChannels[topic];
            });
            if (state.messageChannel) sb.removeChannel(state.messageChannel);
            if (state.signalChannel) sb.removeChannel(state.signalChannel);
            if (state.presenceChannel) sb.removeChannel(state.presenceChannel);
            if (state.inboxChannel) sb.removeChannel(state.inboxChannel);
            if (state.callChannel) sb.removeChannel(state.callChannel);
        } catch (e) {
            // Ignore errors during cleanup
        }
    });
}
