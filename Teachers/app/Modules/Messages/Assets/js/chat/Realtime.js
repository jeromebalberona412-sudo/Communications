/**
 * Supabase Realtime: messages, typing, presence, unread badge, call signaling.
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.
 *
 * SECURITY WARNING:
 * This file uses VITE_SUPABASE_PUBLISHABLE_KEY which is SAFE for frontend.
 *
 * NEVER use VITE_SUPABASE_SECRET_KEY or any sb_secret_* keys in frontend code.
 * Secret keys must ONLY be used in backend/server-side code.
 *
 * Supabase Row Level Security (RLS) policies must be enabled on all tables
 * to protect data from unauthorized access.
 */
import { state } from './realtime/state.js';
import { initBootConfig } from './realtime/helpers.js';
import {
    subscribeConversation,
    ensureCallChannel,
    teardownCallChannel,
    broadcastSignal,
    broadcastMessage
} from './realtime/channels.js';
import { broadcastTyping, stopTyping } from './realtime/typing.js';
import { flushPendingSignals } from './realtime/signals.js';
import { refreshUnread, updateHeaderBadge } from './realtime/unread.js';
import { startPresence } from './realtime/presence.js';
import { startPersonalInbox } from './realtime/inbox.js';
import { initGlobalMessageWatch } from './realtime/global-watch.js';
import { attachLifecycleListeners } from './realtime/lifecycle.js';

(function () {
    'use strict';

    if (window.CommsRealtime && window.CommsRealtime.__booted) {
        return;
    }

    var cfg = initBootConfig();
    state.url = cfg.url;
    state.key = cfg.key;
    state.enabled = !!(state.url && state.key);

    window.CommsRealtime = {
        enabled: state.enabled,
        __booted: true,
        subscribeConversation: subscribeConversation,
        ensureCallChannel: ensureCallChannel,
        teardownCallChannel: teardownCallChannel,
        broadcastTyping: broadcastTyping,
        stopTyping: stopTyping,
        broadcastSignal: broadcastSignal,
        broadcastMessage: broadcastMessage,
        refreshUnread: refreshUnread,
        updateHeaderBadge: updateHeaderBadge,
        flushPendingSignals: flushPendingSignals
    };

    attachLifecycleListeners();

    if (state.enabled) {
        startPresence();
        startPersonalInbox();
        initGlobalMessageWatch();
    } else {
        startPresence();
    }

    refreshUnread();
    setInterval(refreshUnread, state.enabled ? 30000 : 20000);
})();
