/**
 * Chat manager — conversations
 */
import { portalTypesMatchJs } from '../realtime/helpers.js';

export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;

function setThreadOpen(open) {
    root.classList.toggle('is-thread-open', !!open);
}

function isHiddenAdminPeer(peer) {
    if (!peer || peer.is_group) return false;
    var role = String(peer.role || peer.user_type || '').toLowerCase();
    var name = String(peer.name || '').toLowerCase().trim();
    if (role === 'sk_fed' || role === 'admin') return true;
    return name === 'sk federation administrator'
        || name.indexOf('federation administrator') !== -1
        || name.indexOf('sk federation admin') !== -1;
}

function peerKey(conversation) {
    var peer = (conversation && conversation.other_user) || {};
    var isGroup = conversation.conversation_type === 'group' || conversation.is_default_group || peer.is_group;
    if (isGroup) return 'g:' + Number(conversation.id || 0);
    var type = String(peer.user_type || peer.type || peer.portal || '').trim().toLowerCase();
    if (type === 'student' || type === 'kabataan' || type === 'user') type = 'students';
    if (type === 'teacher' || type === 'sk_official' || type === 'official') type = 'teachers';
    var pid = Number(peer.id || peer.user_id || 0);
    return pid > 0 ? ('p:' + pid + ':' + type) : ('c:' + Number(conversation.id || 0));
}

function dedupeConversations(list) {
    var seen = Object.create(null);
    var kept = [];
    (list || []).forEach(function (conversation) {
        if (!conversation) return;
        var id = Number(conversation.id || 0);
        var key = peerKey(conversation);
        var stamp = Date.parse(conversation.updated_at || '') || 0;
        if (seen[key] == null && id) {
            var duplicateId = kept.some(function (row) { return Number(row.id) === id; });
            if (duplicateId) return;
        }
        if (seen[key] == null) {
            seen[key] = kept.length;
            kept.push(conversation);
            return;
        }
        var index = seen[key];
        var previous = Date.parse(kept[index].updated_at || '') || 0;
        if (stamp >= previous) kept[index] = conversation;
    });
    return kept;
}

function renderConversations(filter) {
    var q = String(filter || '').trim().toLowerCase();
    var items = dedupeConversations(state.conversations).filter(function (c) {
        if (c.conversation_type === 'group' || c.is_default_group) return true;
        return !isHiddenAdminPeer(c.other_user || {});
    }).slice().sort(function (a, b) {
        var ta = Date.parse((a && a.updated_at) || '') || 0;
        var tb = Date.parse((b && b.updated_at) || '') || 0;
        return tb - ta;
    });
    if (q) {
        items = items.filter(function (c) {
            var label = (c.other_user && c.other_user.name) || c.name || '';
            return String(label).toLowerCase().indexOf(q) !== -1;
        });
    }

    if (!items.length) {
        els.convList.innerHTML = '';
        els.convEmpty.hidden = false;
        return;
    }
    els.convEmpty.hidden = true;
    els.convList.innerHTML = items.map(function (c) {
        var peer = c.other_user || {};
        var isGroup = c.conversation_type === 'group' || c.is_default_group || peer.is_group;
        var lm = c.last_message;
        var preview = 'No messages yet';
        if (lm) {
            if (lm.message_type === 'call' || lm.message_type === 'system') {
                preview = lm.body || 'Call update';
            } else if (lm.body) {
                preview = lm.body;
                if (lm.message_type === 'image') preview = '📷 ' + lm.body;
                else if (lm.message_type === 'file') preview = '📎 ' + lm.body;
            } else if (lm.message_type === 'image') {
                preview = '📷 Photo';
            } else if (lm.message_type === 'file') {
                preview = '📎 File';
            } else {
                preview = lm.body || 'No messages yet';
            }
        }
        var unread = Number(c.unread_count || 0);
        var active = Number(c.id) === Number(state.activeId) ? ' is-active' : '';
        var fullName = isGroup
            ? (c.name || peer.name || 'Group chat')
            : (peer.name || 'User');
        var displayName = fullName.length > 22 ? fullName.slice(0, 19).replace(/\s+$/, '') + '...' : fullName;
        var avatar = isGroup
            ? (peer.profile_image_url || c.avatar_url || Comms.defaultAvatar(fullName))
            : api.resolvePeerAvatar(peer);
        var liveMap = window.__COMMS_PRESENCE_ONLINE_IDS__ || {};
        var peerPortal = String(peer.user_type || peer.type || peer.portal || '').trim().toLowerCase();
        var liveOnline = !isGroup && peer.id && (
            (peerPortal && liveMap[peerPortal + ':' + Number(peer.id)])
            || liveMap[Number(peer.id)]
        );
        var online = isGroup
            ? 'offline'
            : (liveOnline || String(peer.online_status || '').toLowerCase() === 'online' ? 'online' : 'offline');
        if (!isGroup && peer && online === 'online') peer.online_status = 'online';
        var memberHint = '';
        var avatarHtml = '<img class="comms-avatar" src="' + Comms.escapeHtml(avatar) + '" alt="" onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(displayName)) + '\'">';
        if (isGroup) {
            var max = Number(c.max_members || 0);
            var count = Number(c.member_count || 0);
            memberHint = max > 0
                ? ('<div class="comms-conv-limit">' + count + ' / ' + max + ' members</div>')
                : (count > 0 ? ('<div class="comms-conv-limit">' + count + ' members</div>') : '');
            var previews = Array.isArray(c.member_previews) ? c.member_previews.slice(0, 3) : [];
            if (previews.length >= 2) {
                avatarHtml = '<span class="comms-avatar-stack" aria-hidden="true">' +
                    previews.map(function (p, idx) {
                        var src = (p && p.profile_image_url) || Comms.defaultAvatar((p && p.name) || 'U');
                        var nm = (p && p.name) || 'U';
                        return '<img class="comms-avatar-stack-item" style="z-index:' + (10 - idx) + '" src="' +
                            Comms.escapeHtml(src) + '" alt="" title="' + Comms.escapeHtml(nm) + '"' +
                            ' onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(nm)) + '\'">';
                    }).join('') +
                    (count > previews.length
                        ? ('<span class="comms-avatar-stack-more">+' + (count - previews.length) + '</span>')
                        : '') +
                    '</span>';
            }
        }
        var unreadBadge = unread > 0
            ? ('<span class="comms-unread" aria-label="' + unread + ' unread">' + (unread > 99 ? '99+' : unread) + '</span>')
            : '';
        return '<button type="button" class="comms-conv-item' + (isGroup ? ' is-group' : '') + (unread > 0 ? ' has-unread' : '') + active + '" data-id="' + c.id + '"' +
            ' data-peer-name="' + Comms.escapeHtml(fullName) + '"' +
            ' title="' + Comms.escapeHtml(fullName) + '"' +
            ' data-peer-avatar="' + Comms.escapeHtml(avatar) + '"' +
            ' data-peer-status="' + online + '"' +
            ' data-is-group="' + (isGroup ? '1' : '0') + '"' +
            ' data-member-count="' + Number(c.member_count || 0) + '"' +
            ' role="listitem">' +
            avatarHtml +
            '<div class="comms-conv-main">' +
            '<div class="comms-conv-name" title="' + Comms.escapeHtml(fullName) + '">' + Comms.escapeHtml(displayName) + '</div>' +
            memberHint +
            '<div class="comms-conv-preview' + (unread > 0 ? ' is-unread' : '') + '">' + Comms.escapeHtml(preview) + '</div>' +
            '</div>' +
            '<div class="comms-conv-meta">' +
            '<span class="comms-conv-time">' + Comms.escapeHtml(Comms.formatTime(c.updated_at)) + '</span>' +
            unreadBadge +
            '</div></button>';
    }).join('');
}

function loadConversation(id, opts) {
    return api.openConversation(id, opts);
}

function loadConversations() {
    var epoch = Number(window.__COMMS_INBOX_EPOCH__) || 0;
    state.listGen = (state.listGen || 0) + 1;
    var gen = state.listGen;
    return Comms.api(routes.conversations).then(function (data) {
        if (gen !== state.listGen) return;
        if (epoch !== (Number(window.__COMMS_INBOX_EPOCH__) || 0)) return;
        var list = data.conversations || [];
        if (state.activeId && document.visibilityState !== 'hidden') {
            list.forEach(function (c) {
                if (Number(c.id) === Number(state.activeId)) c.unread_count = 0;
            });
        }
        state.conversations = dedupeConversations(list);
        if (Comms.writeInboxCache) Comms.writeInboxCache(state.conversations);
        renderConversations(els.convFilter ? els.convFilter.value : '');
    }).catch(function (err) {
        if (!state.conversations || !state.conversations.length) {
            Comms.showToast(err.message || 'Failed to load conversations.', 'error');
        }
    });
}

function noteInboxActivity(row) {
    if (!row || row.conversation_id == null) return;
    var cid = Number(row.conversation_id);
    var list = state.conversations || [];
    var idx = list.findIndex(function (c) { return Number(c.id) === cid; });
    var preview = {
        body: row.body || '',
        message_type: row.message_type || 'text',
        created_at: row.created_at || new Date().toISOString()
    };
    var item = idx === -1 ? { id: cid, unread_count: 0, other_user: { name: row.sender_name || 'Chat' } } : list[idx];
    item.last_message = preview;
    item.updated_at = preview.created_at;
    var root = document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
    var mine = !!(root && Number(row.sender_id) === Number(root.dataset.currentUserId || 0)
        && portalTypesMatchJs(row.sender_type, root.dataset.portalUserType));
    var open = Number(state.activeId) === cid && document.visibilityState !== 'hidden';
    if (open) item.unread_count = 0;
    else if (!mine) item.unread_count = Number(item.unread_count || 0) + 1;
    if (idx === -1) list.unshift(item);
    else {
        list.splice(idx, 1);
        list.unshift(item);
    }
    state.conversations = dedupeConversations(list);
    if (Comms.writeInboxCache) Comms.writeInboxCache(list);
    renderConversations(els.convFilter ? els.convFilter.value : '');
    if (Array.isArray(window.__COMMS_HEADER_CONVERSATIONS__)) {
        var header = window.__COMMS_HEADER_CONVERSATIONS__;
        var hIdx = header.findIndex(function (c) { return Number(c.id) === cid; });
        if (hIdx !== -1) {
            header[hIdx].last_message = preview;
            header[hIdx].updated_at = preview.created_at;
            header[hIdx].unread_count = item.unread_count;
            var moved = header.splice(hIdx, 1)[0];
            header.unshift(moved);
        }
    }
}

function hydrateFromCache() {
    var inbox = Comms.readInboxCache ? Comms.readInboxCache() : null;
    if (Array.isArray(inbox) && inbox.length) {
        state.conversations = dedupeConversations(inbox);
        renderConversations(els.convFilter ? els.convFilter.value : '');
    }
}

    Object.assign(api, {
        hydrateFromCache: hydrateFromCache,
        isHiddenAdminPeer: isHiddenAdminPeer,
        loadConversation: loadConversation,
        loadConversations: loadConversations,
        renderConversations: renderConversations,
        noteInboxActivity: noteInboxActivity,
        setThreadOpen: setThreadOpen
    });
}
