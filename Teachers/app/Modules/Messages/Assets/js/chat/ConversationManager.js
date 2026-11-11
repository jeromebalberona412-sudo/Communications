/**
 * Floating Messenger-Style Chat Windows
 * Opens conversations as docked windows at bottom-right, like Facebook Messenger.
 * Works on ALL pages, persists across navigation within the same tab session.
 */
import { createFloatingContext } from './floating/state.js';
import { attachThread } from './floating/thread.js';
import { attachWindows } from './floating/windows.js';

(function () {
    'use strict';

    if (window.CommsFloatingChat && window.CommsFloatingChat.__booted) return;

    var ctx = createFloatingContext();
    attachThread(ctx);
    attachWindows(ctx);

    function init() {
        var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
        if (!boot) return;

        ctx.currentUserId = Number(boot.dataset.currentUserId || 0);
        ctx.portalUserType = boot.dataset.portalUserType || '';

        if (!ctx.currentUserId) return;

        try {
            ctx.routes = JSON.parse(boot.dataset.routes || '{}');
        } catch (e) {
            ctx.routes = {};
        }

        var container = document.createElement('div');
        container.id = 'floatingChatContainer';
        container.className = 'floating-chat-container';
        document.body.appendChild(container);

        document.addEventListener('click', function (e) {
            if (e.target.closest('.floating-chat-attach-wrap')) return;
            Object.keys(ctx.openWindows).forEach(function (cid) {
                var w = ctx.openWindows[cid];
                if (w) ctx.hideAttachMenu(w.el);
            });
        });

        if (!ctx.isOnMessagesPage()) {
            var state = ctx.loadState();
            if (state && state.windows && Array.isArray(state.windows)) {
                state.windows.forEach(function (w) {
                    if (w && w.conversationId) {
                        setTimeout(function () {
                            ctx.openChatWindow(w.conversationId, {
                                peerName: w.peerName,
                                peerAvatar: w.peerAvatar,
                                isGroup: w.isGroup,
                                memberCount: w.memberCount
                            });
                            if (w.minimized) {
                                setTimeout(function () {
                                    ctx.minimizeWindow(w.conversationId);
                                }, 100);
                            }
                        }, 50);
                    }
                });
            }
        }

        window.addEventListener('resize', ctx.positionWindows);

        if (window.onCommsHeaderMessageInsert) {
            var original = window.onCommsHeaderMessageInsert;
            window.onCommsHeaderMessageInsert = function (message) {
                ctx.handleRealtimeMessage(message);
                if (typeof original === 'function') original(message);
            };
        } else {
            window.onCommsHeaderMessageInsert = ctx.handleRealtimeMessage;
        }

        document.addEventListener('click', function (e) {
            var logout = e.target.closest('a[href*="logout"], button[href*="logout"]');
            if (logout) {
                ctx.clearState();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    var openChatWindow = ctx.openChatWindow;

    window.CommsFloatingChat = {
        __booted: true,
        open: openChatWindow,
        close: ctx.closeWindow,
        minimize: ctx.minimizeWindow,
        restore: ctx.restoreWindow,
        applyReaction: ctx.applyFloatingReaction
    };

    window.openChatWindow = openChatWindow;
})();
