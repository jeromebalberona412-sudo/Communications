/**
 * Chat manager — peer
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;

function resolvePeerAvatar(peer) {
    var name = (peer && peer.name) || 'User';
    var url = peer && peer.profile_image_url ? String(peer.profile_image_url).trim() : '';
    if (!url || url === 'null' || url === 'undefined') {
        return Comms.defaultAvatar(name);
    }
    return url;
}

function formatPresenceLabel(peer) {
    var status = String((peer && peer.online_status) || '').toLowerCase();
    if (status === 'online') return 'Online';
    if (status === 'offline') {
        if (peer && peer.last_seen) return 'Offline · Last seen ' + Comms.formatTime(peer.last_seen);
        return 'Offline';
    }
    if (peer && peer.last_seen) return 'Last seen ' + Comms.formatTime(peer.last_seen);
    return 'Offline';
}

function groupHasCustomPhoto(conversation) {
    if (!conversation) return false;
    if (conversation.has_custom_avatar) return true;
    var url = String(conversation.avatar_url || '');
    return url.indexOf('res.cloudinary.com') !== -1 || url.indexOf('/storage/') !== -1;
}

function renderPeerAvatarStack(conversation, fallbackName) {
    var stack = els.peerAvatarStack;
    var single = els.peerAvatar;
    if (!stack) {
        if (single) single.hidden = false;
        return;
    }
    if (groupHasCustomPhoto(conversation)) {
        stack.hidden = true;
        stack.innerHTML = '';
        if (single) single.hidden = false;
        return;
    }
    var previews = [];
    if (conversation) {
        if (Array.isArray(conversation.members) && conversation.members.length) {
            previews = conversation.members.slice(0, 3);
        } else if (Array.isArray(conversation.member_previews)) {
            previews = conversation.member_previews.slice(0, 3);
        }
    }
    var count = Number((conversation && conversation.member_count) || previews.length || 0);
    if (previews.length < 2) {
        stack.hidden = true;
        stack.innerHTML = '';
        if (single) single.hidden = false;
        return;
    }
    if (single) single.hidden = true;
    stack.hidden = false;
    stack.innerHTML = previews.map(function (p, idx) {
        var nm = (p && p.name) || 'U';
        var src = (p && (p.profile_image_url || p.avatar_url)) || Comms.defaultAvatar(nm);
        return '<img class="comms-avatar-stack-item" style="z-index:' + (10 - idx) + '" src="' +
            Comms.escapeHtml(src) + '" alt="" title="' + Comms.escapeHtml(nm) + '"' +
            ' onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(nm)) + '\'">';
    }).join('') + (count > previews.length
        ? ('<span class="comms-avatar-stack-more">+' + (count - previews.length) + '</span>')
        : '');
    stack.setAttribute('title', fallbackName || 'Group members');
}

function updatePeerHeader(conversation) {
    var peer = (conversation && conversation.other_user) || {};
    var isGroup = api.isGroupConversation(conversation);
    var name = isGroup
        ? ((conversation && conversation.name) || peer.name || 'Group chat')
        : (peer.name || 'User');
    if (els.peerName) {
        els.peerName.textContent = name;
        els.peerName.title = name;
    }

    var statusBits = [];
    if (isGroup) {
        var count = Number((conversation && conversation.member_count) || 0);
        var max = Number((conversation && conversation.max_members) || 0);
        var members = Array.isArray(conversation && conversation.members)
            ? conversation.members
            : (Array.isArray(conversation && conversation.member_previews) ? conversation.member_previews : []);
        var namePreview = members.slice(0, 3).map(function (m) {
            return api.compactSenderLabel((m && m.name) || '');
        }).filter(Boolean);
        if (namePreview.length) {
            statusBits.push(namePreview.join(', ') + (count > namePreview.length ? '…' : ''));
        } else if (peer.user_type_label) {
            statusBits.push(String(peer.user_type_label));
        }
        statusBits.push(max > 0 ? (count + ' / ' + max + ' members') : (count + ' members'));
    } else {
        if (peer.user_type_label) statusBits.push(String(peer.user_type_label));
        if (peer.position) statusBits.push(String(peer.position));
        if (peer.barangay_name) statusBits.push(String(peer.barangay_name));
        statusBits.push(formatPresenceLabel(peer));
    }
    if (els.peerMeta) {
        els.peerMeta.textContent = statusBits.filter(Boolean).join(' · ');
        els.peerMeta.classList.toggle('is-clickable', !!isGroup);
        els.peerMeta.setAttribute('role', isGroup ? 'button' : 'text');
        els.peerMeta.tabIndex = isGroup ? 0 : -1;
        els.peerMeta.title = isGroup ? 'View members' : '';
    }

    var isOnline = !isGroup && String(peer.online_status || '').toLowerCase() === 'online';
    if (els.peerStatusDot) {
        els.peerStatusDot.hidden = !!isGroup;
        els.peerStatusDot.setAttribute('data-status', isOnline ? 'online' : 'offline');
        els.peerStatusDot.title = isOnline ? 'Online' : 'Offline';
    }

    if (els.peerAvatarWrap) {
        els.peerAvatarWrap.classList.toggle('is-group', !!isGroup);
    }

    if (isGroup) {
        renderPeerAvatarStack(conversation, name);
    } else if (els.peerAvatarStack) {
        els.peerAvatarStack.hidden = true;
        els.peerAvatarStack.innerHTML = '';
        if (els.peerAvatar) els.peerAvatar.hidden = false;
    }

    if (els.peerAvatar && (!isGroup || !els.peerAvatarStack || els.peerAvatarStack.hidden)) {
        var avatarUrl = isGroup
            ? ((conversation && conversation.avatar_url) || peer.profile_image_url || Comms.defaultAvatar(name))
            : resolvePeerAvatar(peer);
        els.peerAvatar.alt = name;
        els.peerAvatar.hidden = false;
        els.peerAvatar.onerror = function () {
            els.peerAvatar.onerror = null;
            els.peerAvatar.src = isGroup
                ? ((conversation && conversation.avatar_url) || peer.profile_image_url || Comms.defaultAvatar(name))
                : Comms.defaultAvatar(name);
        };
        if (els.peerAvatar.getAttribute('src') !== avatarUrl) {
            els.peerAvatar.src = avatarUrl;
        }
    }

    api.syncGroupActions(conversation);

    if (conversation && conversation.id && !isGroup) {
        savePeerProfileCache(conversation.id, peer);
    }
}

function peerProfileCacheKey(conversationId) {
    return 'comms:peer-profile:' + String(conversationId);
}

function loadPeerProfileCache(conversationId) {
    var key = peerProfileCacheKey(conversationId);
    if (Comms.readCacheEntry) {
        var cached = Comms.readCacheEntry(key);
        if (cached && (cached.name || cached.profile_image_url || cached.id)) return cached;
    }
    if (!window.SkLocalCache || typeof window.SkLocalCache.get !== 'function') return null;
    var entry = window.SkLocalCache.get(key);
    if (!entry) return null;
    if (entry.payload && (entry.payload.name || entry.payload.id)) return entry.payload;
    if (entry.name || entry.id) return entry;
    return null;
}

function savePeerProfileCache(conversationId, peer) {
    if (!conversationId || !peer) return;
    var payload = {
        id: peer.id || null,
        name: peer.name || '',
        user_type_label: peer.user_type_label || '',
        position: peer.position || '',
        barangay_name: peer.barangay_name || '',
        profile_image_url: peer.profile_image_url || '',
        online_status: peer.online_status || '',
        last_seen: peer.last_seen || null,
        user_type: peer.user_type || ''
    };
    if (Comms.writeCacheEntry) {
        Comms.writeCacheEntry(peerProfileCacheKey(conversationId), payload);
        return;
    }
    if (window.SkLocalCache && typeof window.SkLocalCache.set === 'function') {
        window.SkLocalCache.set(peerProfileCacheKey(conversationId), payload);
    }
}

function applyCachedPeerHeader(conversationId) {
    var cached = loadPeerProfileCache(conversationId);
    if (!cached) return;
    updatePeerHeader({ id: conversationId, other_user: cached });
}

function refreshActivePeerProfile() {
    if (!state.activeId || !routes.showConversation) return Promise.resolve();
    var cid = state.activeId;
    return Comms.api(Comms.route(routes.showConversation, cid), { dedupe: true }).then(function (data) {
        if (Number(state.activeId) !== Number(cid) || !data || !data.conversation) return;
        var live = window.__COMMS_PRESENCE_ONLINE_IDS__ || {};
        var peer = data.conversation.other_user;
        if (peer && peer.id) {
            var pType = String(peer.user_type || peer.type || peer.portal || '').trim().toLowerCase();
            if ((pType && live[pType + ':' + Number(peer.id)]) || live[Number(peer.id)]) {
                peer.online_status = 'online';
            }
        }
        state.activeConversation = data.conversation;
        updatePeerHeader(data.conversation);
    }).catch(function () { /* ignore */ });
}

function startPeerProfileRealtime() {
    if (state.peerProfileRefreshTimer) {
        clearInterval(state.peerProfileRefreshTimer);
    }
    state.peerProfileRefreshTimer = setInterval(function () {
        if (!state.activeId) return;
        refreshActivePeerProfile();
    }, 20000);
}

function updatePeerOnlineFromPresence(presenceMap) {
    if (!presenceMap) return;

    var onlineIds = {};
    Object.keys(presenceMap).forEach(function (key) {
        var metas = presenceMap[key] || [];
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

    state.conversations.forEach(function (c) {
        var peer = c.other_user;
        if (!peer || !peer.id) return;
        var pType = String(peer.user_type || peer.type || peer.portal || '').trim().toLowerCase();
        var isOn = !!(pType && onlineIds[pType + ':' + Number(peer.id)]) || !!onlineIds[Number(peer.id)];
        var next = isOn ? 'online' : 'offline';
        if (String(peer.online_status || '') === next) return;
        peer.online_status = next;
        if (next === 'offline') peer.last_seen = new Date().toISOString();
        if (c.id) savePeerProfileCache(c.id, peer);
    });

    if (!state.activeConversation || !state.activeConversation.other_user) return;
    var activePeer = state.activeConversation.other_user;
    var peerId = Number(activePeer.id || 0);
    if (!peerId) return;

    var nextStatus = onlineIds[peerId] ? 'online' : 'offline';
    if (String(activePeer.online_status || '') === nextStatus) return;
    activePeer.online_status = nextStatus;
    if (nextStatus === 'offline') activePeer.last_seen = new Date().toISOString();
    state.activeConversation.other_user = activePeer;
    updatePeerHeader(state.activeConversation);
}


    Object.assign(api, {
        applyCachedPeerHeader: applyCachedPeerHeader,
        formatPresenceLabel: formatPresenceLabel,
        loadPeerProfileCache: loadPeerProfileCache,
        peerProfileCacheKey: peerProfileCacheKey,
        refreshActivePeerProfile: refreshActivePeerProfile,
        renderPeerAvatarStack: renderPeerAvatarStack,
        resolvePeerAvatar: resolvePeerAvatar,
        savePeerProfileCache: savePeerProfileCache,
        startPeerProfileRealtime: startPeerProfileRealtime,
        updatePeerHeader: updatePeerHeader,
        updatePeerOnlineFromPresence: updatePeerOnlineFromPresence
    });
}
