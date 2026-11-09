import { state } from './state.js';
import { ensureClient } from './client.js';
import { getRoot, bootRoutes } from './helpers.js';

export function startPresence() {
    var sb = ensureClient();
    var root = getRoot();
    if (!root) return;

    var userId = root.dataset.currentUserId;
    var routes = bootRoutes();

    var lastPresencePost = 0;

    function postPresence(online) {
        if (!routes.presence || !window.Comms || typeof window.Comms.api !== 'function') return;
        var now = Date.now();
        if (now - lastPresencePost < 10000) return;
        lastPresencePost = now;
        window.Comms.api(routes.presence, {
            method: 'POST',
            body: JSON.stringify({ online: !!online }),
            dedupe: false
        }).catch(function () { /* ignore */ });
    }

    function applyPresenceMap(stateMap) {
        var onlineIds = {};
        Object.keys(stateMap || {}).forEach(function (key) {
            var metas = stateMap[key] || [];
            if (!metas.length) {
                if (String(key).indexOf(':') !== -1) {
                    onlineIds[String(key).toLowerCase()] = true;
                }
                return;
            }
            metas.forEach(function (meta) {
                var uid = Number((meta && meta.user_id) || 0);
                var portal = String((meta && (meta.portal || meta.user_type || meta.type)) || '').trim().toLowerCase();
                if (!uid) {
                    var parts = String(key || '').split(':');
                    if (parts.length === 2) {
                        portal = portal || String(parts[0] || '').toLowerCase();
                        uid = Number(parts[1] || 0);
                    }
                }
                if (!uid) return;
                if (portal) onlineIds[portal + ':' + uid] = true;
                else onlineIds[uid] = true;
            });
        });
        window.__COMMS_PRESENCE_ONLINE_IDS__ = onlineIds;
        if (window.CommsChat && typeof window.CommsChat.updatePeerOnlineFromPresence === 'function') {
            window.CommsChat.updatePeerOnlineFromPresence(stateMap);
        }
        if (typeof window.onCommsHeaderPresence === 'function') {
            window.onCommsHeaderPresence(stateMap);
        }
    }

    if (sb) {
        var portalKey = String(root.dataset.portalUserType || 'user').trim().toLowerCase();
        var presenceKey = portalKey + ':' + String(userId);
        state.presenceChannel = sb.channel('comms-presence', {
            config: { presence: { key: presenceKey } }
        });

        state.presenceChannel
            .on('presence', { event: 'sync' }, function () {
                applyPresenceMap(state.presenceChannel.presenceState ? state.presenceChannel.presenceState() : {});
            })
            .on('presence', { event: 'join' }, function () {
                applyPresenceMap(state.presenceChannel.presenceState ? state.presenceChannel.presenceState() : {});
            })
            .on('presence', { event: 'leave' }, function () {
                applyPresenceMap(state.presenceChannel.presenceState ? state.presenceChannel.presenceState() : {});
            })
            .subscribe(async function (status) {
                if (status === 'SUBSCRIBED') {
                    await state.presenceChannel.track({
                        user_id: Number(userId),
                        portal: portalKey,
                        user_type: portalKey,
                        online_at: new Date().toISOString()
                    });
                }
            });
    }

    postPresence(true);
    setInterval(function () {
        if (document.visibilityState === 'visible') postPresence(true);
    }, state.enabled ? 45000 : 25000);

    document.addEventListener('visibilitychange', function () {
        postPresence(document.visibilityState === 'visible');
    });

    window.addEventListener('pagehide', function () {
        try {
            var token = document.querySelector('meta[name="csrf-token"]');
            fetch(routes.presence, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': token ? token.getAttribute('content') : ''
                },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify({ online: false })
            });
        } catch (e) { /* ignore */ }
    });
}
