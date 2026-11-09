/**
 * Shared mutable state and helpers for floating chat windows.
 */
export function createFloatingContext() {
    var ctx = {
        MAX_WINDOWS: 3,
        WINDOW_WIDTH: 328,
        WINDOW_HEIGHT_DESKTOP: 450,
        WINDOW_GAP: 16,
        openWindows: {},
        windowOrder: [],
        currentUserId: null,
        portalUserType: null,
        routes: {}
    };

    ctx.storageKey = function () {
        if (!ctx.currentUserId) return null;
        return 'commsFloatingChats.' + ctx.currentUserId;
    };

    ctx.saveState = function () {
        var key = ctx.storageKey();
        if (!key) return;
        try {
            var state = {
                windows: ctx.windowOrder.map(function (cid) {
                    var w = ctx.openWindows[cid];
                    return {
                        conversationId: cid,
                        minimized: w.minimized,
                        peerName: w.peerName,
                        peerAvatar: w.peerAvatar,
                        isGroup: w.isGroup,
                        memberCount: w.memberCount
                    };
                }),
                ts: Date.now()
            };
            sessionStorage.setItem(key, JSON.stringify(state));
        } catch (e) { /* ignore */ }
    };

    ctx.loadState = function () {
        var key = ctx.storageKey();
        if (!key) return null;
        try {
            var raw = sessionStorage.getItem(key);
            if (!raw) return null;
            var state = JSON.parse(raw);
            if (!state || !Array.isArray(state.windows)) return null;
            if (Date.now() - (state.ts || 0) > 3600000) {
                sessionStorage.removeItem(key);
                return null;
            }
            return state;
        } catch (e) {
            return null;
        }
    };

    ctx.clearState = function () {
        var key = ctx.storageKey();
        if (key) {
            try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
        }
    };

    ctx.escapeHtml = function (text) {
        if (window.Comms && typeof window.Comms.escapeHtml === 'function') {
            return window.Comms.escapeHtml(text);
        }
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    ctx.defaultAvatar = function (name) {
        if (window.Comms && typeof window.Comms.defaultAvatar === 'function') {
            return window.Comms.defaultAvatar(name);
        }
        return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=0039A8&color=fff';
    };

    ctx.formatTime = function (iso) {
        if (window.Comms && typeof window.Comms.formatTime === 'function') {
            return window.Comms.formatTime(iso);
        }
        if (!iso) return '';
        try {
            var d = new Date(iso);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    };

    ctx.isOnMessagesPage = function () {
        return window.location.pathname.indexOf('/messages') !== -1
            || window.location.pathname.indexOf('/communications') !== -1
            || document.getElementById('commsApp') !== null;
    };

    return ctx;
}
