/**
 * Chat manager — groups
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.groupMembersInflight !== undefined) var groupMembersInflight = ctx.groupMembersInflight;

function isGroupConversation(conversation) {
    if (!conversation) return false;
    return conversation.conversation_type === 'group'
        || !!conversation.is_default_group
        || !!(conversation.other_user && conversation.other_user.is_group);
}

function nameParts(fullName) {
    return String(fullName || '').trim().split(/\s+/).filter(Boolean);
}

function lastNameToken(fullName) {
    var parts = nameParts(fullName);
    if (!parts.length) return '';
    var suffixes = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };
    var last = parts[parts.length - 1].replace(/\.$/, '');
    if (suffixes[last.toLowerCase()] && parts.length > 1) {
        last = parts[parts.length - 2].replace(/\.$/, '');
    }
    return last;
}

function compactSenderLabel(fullName) {
    var full = String(fullName || '').trim();
    if (!full || full.toLowerCase() === 'none' || full.toLowerCase() === 'null') return 'Member';
    var last = lastNameToken(full);
    var first = nameParts(full)[0] || '';
    var label = last || first || full;
    var peers = [];
    (state.messages || []).forEach(function (row) {
        var peerName = String(row && row.sender_name || '').trim();
        if (peerName && peers.indexOf(peerName) === -1) peers.push(peerName);
    });
    var members = state.activeConversation && state.activeConversation.members;
    if (Array.isArray(members)) {
        members.forEach(function (member) {
            var peerName = String(member && member.name || '').trim();
            if (peerName && peers.indexOf(peerName) === -1) peers.push(peerName);
        });
    }
    var collisions = peers.filter(function (peerName) {
        return last && lastNameToken(peerName).toLowerCase() === last.toLowerCase();
    });
    if (collisions.length > 1 && first) {
        label = last + ', ' + first.charAt(0).toUpperCase() + '.';
    }
    if (label.length > 20) {
        label = label.slice(0, 17).replace(/\s+$/, '') + '...';
    }
    return label;
}

function renderGroupSenderMeta(m, mine, previous) {
    if (mine) return '';
    if (previous && !previous.mine && String(previous.sender_id) === String(m.sender_id)
        && previous.message_type !== 'call' && previous.message_type !== 'system') {
        return '';
    }
    var full = String(m.sender_name || '').trim() || 'Member';
    var name = compactSenderLabel(full);
    var avatar = String(m.sender_avatar_url || '').trim() || Comms.defaultAvatar(full);
    return '<div class="comms-msg-sender" title="' + Comms.escapeHtml(full) + '">' +
        '<img class="comms-msg-sender-avatar" src="' + Comms.escapeHtml(avatar) + '" alt="" ' +
        'onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(full)) + '\'">' +
        '<span class="comms-msg-sender-name">' + Comms.escapeHtml(name) + '</span>' +
        '</div>';
}

function syncGroupActions(conversation) {
    var isGroup = isGroupConversation(conversation);
    if (els.threadMenuBtn) els.threadMenuBtn.hidden = !isGroup;
    if (els.threadMenu) els.threadMenu.hidden = true;
    if (els.threadMenuBtn) els.threadMenuBtn.setAttribute('aria-expanded', 'false');
    if (els.renameGroupBtn) {
        els.renameGroupBtn.hidden = !(isGroup && conversation && conversation.can_rename);
    }
    var canPhoto = !!(isGroup && conversation && conversation.can_change_avatar);
    if (els.changeGroupPhotoBtn) els.changeGroupPhotoBtn.hidden = !canPhoto;
    if (els.groupPhotoBtn) els.groupPhotoBtn.hidden = !canPhoto;
}

function closeGroupModals() {
    if (els.groupModal) els.groupModal.hidden = true;
    if (els.renameModal) els.renameModal.hidden = true;
    if (els.threadMenu) els.threadMenu.hidden = true;
    if (els.threadMenuBtn) els.threadMenuBtn.setAttribute('aria-expanded', 'false');
}

function memberAvatarHtml(member) {
    var mName = (member && member.name) || 'User';
    var src = api.resolvePeerAvatar(member);
    var fallback = Comms.defaultAvatar(mName);
    return '<img class="comms-avatar comms-group-member-avatar" src="' + Comms.escapeHtml(src) + '" alt="' +
        Comms.escapeHtml(mName) + '" loading="lazy" referrerpolicy="no-referrer" ' +
        'onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(fallback) + '\'">';
}

function renderMembersListHtml(members, mode) {
    var html = '<div class="comms-group-members" role="list">';
    if (!members.length) {
        html += '<p class="comms-muted">No members found.</p>';
    } else {
        members.forEach(function (m) {
            var mName = m.name || 'User';
            var role = m.participant_role === 'admin' ? 'Admin' : 'Member';
            var position = m.federation_position || m.position || '';
            var isCurrentUser = Number(m.id) === Number(state.currentUserId);
            html += '<div class="comms-group-member" role="listitem" data-user-id="' + Number(m.id || 0) + '" data-user-type="' + Comms.escapeHtml(m.user_type || m.type || state.portalUserType) + '" data-user-name="' + Comms.escapeHtml(mName) + '">' +
                memberAvatarHtml(m) +
                '<div class="comms-group-member-main">' +
                '<div class="comms-group-member-name">' + Comms.escapeHtml(mName) + '</div>' +
                '<div class="comms-group-member-meta">' +
                (position ? Comms.escapeHtml(String(position)) : Comms.escapeHtml(role)) +
                (position && role === 'Admin' ? ' · Admin' : '') +
                '</div></div>';
            if (!isCurrentUser) {
                html += '<div class="comms-group-member-actions">' +
                    '<button type="button" class="comms-btn-secondary comms-member-message-btn" data-user-id="' + Number(m.id) + '" data-user-name="' + Comms.escapeHtml(mName) + '" data-user-type="' + Comms.escapeHtml(m.type || m.user_type || state.portalUserType) + '">Message</button>' +
                    '<button type="button" class="comms-btn-secondary comms-member-call-btn" data-user-id="' + Number(m.id) + '" data-user-name="' + Comms.escapeHtml(mName) + '">Call</button>' +
                    '</div>';
            }
            html += '</div>';
        });
    }
    html += '</div>';
    return html;
}

var groupMembersInflight = Object.create(null);

function groupMembersCacheKey(convId) {
    return 'comms.ui.groupMembers.' + String(state.currentUserId || 0) + '.' + String(convId || 0);
}

function readGroupMembersCache(convId) {
    try {
        var parsed = JSON.parse(sessionStorage.getItem(groupMembersCacheKey(convId)) || 'null');
        if (parsed && Number(parsed.userId) === Number(state.currentUserId) && Array.isArray(parsed.items)) {
            return parsed.items;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function writeGroupMembersCache(convId, items) {
    try {
        sessionStorage.setItem(groupMembersCacheKey(convId), JSON.stringify({
            userId: Number(state.currentUserId || 0),
            items: items,
            ts: Date.now()
        }));
    } catch (e2) { /* ignore */ }
}

function paintGroupInfoModal(mode, conv) {
    var name = conv.name || (conv.other_user && conv.other_user.name) || 'Group chat';
    var members = Array.isArray(conv.members) ? conv.members : [];
    var count = Number(conv.member_count || members.length || 0);
    var max = Number(conv.max_members || 0);
    var typeLabel = conv.default_group_type === 'SK_OFFICIALS'
        ? 'Teachers'
        : (conv.default_group_type === 'SK_FEDERATIONS' ? 'Students' : 'Group');
    if (els.groupModalTitle) {
        els.groupModalTitle.textContent = mode === 'members'
            ? 'View Members'
            : (mode === 'call' ? 'Select call recipient' : 'Group Info');
    }
    var html = '';
    if (mode !== 'members' && mode !== 'call') {
        var groupAvatar = conv.avatar_url
            || (conv.other_user && conv.other_user.profile_image_url)
            || Comms.defaultAvatar(name);
        html += '<div class="comms-group-info">' +
            '<div class="comms-group-info-head">' +
            '<img class="comms-avatar comms-group-info-avatar" src="' + Comms.escapeHtml(groupAvatar) + '" alt="" ' +
            'onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(name)) + '\'">' +
            '<div class="comms-group-info-copy">' +
            '<div class="comms-group-info-name">' + Comms.escapeHtml(name) + '</div>' +
            '<div class="comms-group-info-meta">Type: ' + Comms.escapeHtml(typeLabel) + '</div>' +
            '<div class="comms-group-info-meta">Members: ' + count + (max > 0 ? (' / ' + max) : '') + '</div>' +
            '<div class="comms-group-info-meta">Call limit: ' + Number(conv.call_max_participants || 8) + ' simultaneous participants</div>' +
            '</div></div></div>';
        html += '<div class="comms-group-info-section-title">Members</div>';
        html += renderMembersListHtml(members, 'info');
    } else {
        html += renderMembersListHtml(members, mode);
    }
    els.groupModalBody.innerHTML = html;
    els.groupModal.hidden = false;
}

function openGroupInfoModal(mode, opts) {
    opts = opts || {};
    var conv = state.activeConversation;
    if (!conv || !isGroupConversation(conv) || !els.groupModal || !els.groupModalBody) return;

    if (!Array.isArray(conv.members) || !conv.members.length) {
        var cachedMembers = readGroupMembersCache(conv.id);
        if (cachedMembers && cachedMembers.length) {
            conv.members = cachedMembers;
            conv.member_count = cachedMembers.length;
        }
    }

    if (els.groupModalTitle) {
        els.groupModalTitle.textContent = mode === 'members'
            ? 'View Members'
            : (mode === 'call' ? 'Select call recipient' : 'Group Info');
    }
    els.groupModal.hidden = false;
    if (Array.isArray(conv.members) && conv.members.length) {
        paintGroupInfoModal(mode, conv);
    } else {
        els.groupModalBody.innerHTML = '';
    }

    if (!opts.skipFetch && routes.conversationMembers) {
        var fetchKey = String(conv.id) + ':' + mode;
        if (groupMembersInflight[fetchKey]) return;
        groupMembersInflight[fetchKey] = Comms.api(Comms.route(routes.conversationMembers, conv.id), { dedupe: true }).then(function (data) {
            if (data && data.conversation) {
                state.activeConversation = Object.assign({}, state.activeConversation || {}, data.conversation);
            }
            if (data && Array.isArray(data.members)) {
                state.activeConversation.members = data.members;
                state.activeConversation.member_count = data.member_count != null
                    ? data.member_count
                    : data.members.length;
                writeGroupMembersCache(state.activeConversation.id, data.members);
            }
            if (state.activeConversation && !els.groupModal.hidden) {
                paintGroupInfoModal(mode, state.activeConversation);
            }
        }).catch(function (err) {
            Comms.showToast(err.message || 'Unable to load members.', 'error');
            if (!conv.members || !conv.members.length) {
                els.groupModalBody.innerHTML = '<p class="comms-muted">Unable to load members.</p>';
            }
        }).finally(function () {
            delete groupMembersInflight[fetchKey];
        });
        return;
    }

    paintGroupInfoModal(mode, conv);
}

function beginGroupOrDirectCall(callType) {
    var conv = state.activeConversation;
    if (!state.activeId || state.callStartLock) return;
    state.callStartLock = true;
    window.setTimeout(function () { state.callStartLock = false; }, 2000);
    ctx.withWebrtc(function (api) {
        api.startCall(state.activeId, callType, conv);
    });
}


    Object.assign(api, {
        beginGroupOrDirectCall: beginGroupOrDirectCall,
        closeGroupModals: closeGroupModals,
        compactSenderLabel: compactSenderLabel,
        groupMembersCacheKey: groupMembersCacheKey,
        isGroupConversation: isGroupConversation,
        lastNameToken: lastNameToken,
        memberAvatarHtml: memberAvatarHtml,
        nameParts: nameParts,
        openGroupInfoModal: openGroupInfoModal,
        paintGroupInfoModal: paintGroupInfoModal,
        readGroupMembersCache: readGroupMembersCache,
        renderGroupSenderMeta: renderGroupSenderMeta,
        renderMembersListHtml: renderMembersListHtml,
        syncGroupActions: syncGroupActions,
        writeGroupMembersCache: writeGroupMembersCache
    });

    ctx.groupMembersInflight = groupMembersInflight;
}
