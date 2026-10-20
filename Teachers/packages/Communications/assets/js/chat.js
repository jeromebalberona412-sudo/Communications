/**
 * Messenger UI: conversation list, thread, send/read, user search.
 */
(function () {
    'use strict';

    var root = document.getElementById('commsApp');
    if (!root || !window.Comms) return;

    var routes = {};
    try { routes = JSON.parse(root.dataset.routes || '{}'); } catch (e) { routes = {}; }

    var state = {
        currentUserId: Number(root.dataset.currentUserId || 0),
        portalUserType: root.dataset.portalUserType || '',
        messageMaxLength: Math.max(1, Number(root.dataset.messageMaxLength || 1000) || 1000),
        conversations: [],
        activeId: null,
        activeConversation: null,
        messages: [],
        messagesHasMore: true,
        sendInFlight: false,
        searchTimer: null,
        filterTimer: null,
        loadingOlder: false,
        listMode: 'conversations',
        directoryFilter: 'officials',
        directoryGroups: [],
        barangayId: '',
        reactionEmojis: ['👍', '❤️', '😆', '😮', '😢', '🙏'],
        openReactionPickerId: null,
        reactInFlight: {},
        reactSkipRealtime: {},
        reactSeq: {},
        pendingAttachments: [],
        pendingPreviewUrls: [],
        pendingAttachment: null,
        pendingPreviewUrl: null,
        editingId: null,
        msgChangeSkipToast: {},
        maxTotalBytes: 25 * 1024 * 1024,
        maxImageCount: 3,
        maxFileCount: 10,
        // Local message cache: conversationId (string) → { messages, reactionEmojis, ts }
        messageCache: {},
        peerProfileRefreshTimer: null
    };

    var els = {
        sidebar: document.getElementById('commsSidebar'),
        convList: document.getElementById('commsConvList'),
        directoryList: document.getElementById('commsDirectoryList'),
        convEmpty: document.getElementById('commsConvEmpty'),
        threadEmpty: document.getElementById('commsThreadEmpty'),
        threadActive: document.getElementById('commsThreadActive'),
        messages: document.getElementById('commsMessages'),
        composer: document.getElementById('commsComposer'),
        input: document.getElementById('commsMessageInput'),
        sendBtn: document.getElementById('commsSendBtn'),
        userSearch: document.getElementById('commsConvFilter') || document.getElementById('commsUserSearch'),
        searchResults: document.getElementById('commsSearchResults'),
        convFilter: document.getElementById('commsConvFilter') || document.getElementById('commsUserSearch'),
        peerName: document.getElementById('commsPeerName'),
        peerMeta: document.getElementById('commsPeerMeta'),
        peerAvatar: document.getElementById('commsPeerAvatar'),
        peerStatusDot: document.getElementById('commsPeerStatusDot'),
        backBtn: document.getElementById('commsBackBtn'),
        typing: document.getElementById('commsTyping'),
        voiceBtn: document.getElementById('commsVoiceBtn'),
        videoBtn: document.getElementById('commsVideoBtn'),
        filterBar: document.getElementById('commsFilterBar'),
        barangayFilter: document.getElementById('commsBarangayFilter'),
        attachBtn: document.getElementById('commsAttachBtn'),
        photoInput: document.getElementById('commsPhotoInput'),
        cameraInput: document.getElementById('commsCameraInput'),
        fileInput: document.getElementById('commsFileInput'),
        attachPreview: document.getElementById('commsAttachPreview'),
        attachPreviewInner: document.getElementById('commsAttachPreviewInner'),
        attachClear: document.getElementById('commsAttachClear'),
        attachMenu: document.getElementById('commsAttachMenu'),
        pickCameraBtn: document.getElementById('commsPickCameraBtn'),
        pickPhotosBtn: document.getElementById('commsPickPhotosBtn'),
        pickFilesBtn: document.getElementById('commsPickFilesBtn'),
        uploadProgress: document.getElementById('commsUploadProgress'),
        uploadProgressBar: document.getElementById('commsUploadProgressBar'),
        scrollBottom: document.getElementById('commsScrollBottom'),
        threadMenuBtn: document.getElementById('commsThreadMenuBtn'),
        threadMenu: document.getElementById('commsThreadMenu'),
        renameGroupBtn: document.getElementById('commsRenameGroupBtn'),
        changeGroupPhotoBtn: document.getElementById('commsChangeGroupPhotoBtn'),
        groupAvatarInput: document.getElementById('commsGroupAvatarInput'),
        viewMembersBtn: document.getElementById('commsViewMembersBtn'),
        groupInfoBtn: document.getElementById('commsGroupInfoBtn'),
        groupModal: document.getElementById('commsGroupModal'),
        groupModalTitle: document.getElementById('commsGroupModalTitle'),
        groupModalBody: document.getElementById('commsGroupModalBody'),
        renameModal: document.getElementById('commsRenameModal'),
        renameForm: document.getElementById('commsRenameForm'),
        renameInput: document.getElementById('commsRenameInput'),
        renameSubmit: document.getElementById('commsRenameSubmit')
    };

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
        if (els.changeGroupPhotoBtn) {
            els.changeGroupPhotoBtn.hidden = !(isGroup && conversation && conversation.can_change_avatar);
        }
    }

    function closeGroupModals() {
        if (els.groupModal) els.groupModal.hidden = true;
        if (els.renameModal) els.renameModal.hidden = true;
        if (els.threadMenu) els.threadMenu.hidden = true;
        if (els.threadMenuBtn) els.threadMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function memberAvatarHtml(member) {
        var mName = (member && member.name) || 'User';
        var src = resolvePeerAvatar(member);
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
                html += '<div class="comms-group-member" role="listitem" data-user-id="' + Number(m.id || 0) + '">' +
                    memberAvatarHtml(m) +
                    '<div class="comms-group-member-main">' +
                    '<div class="comms-group-member-name">' + Comms.escapeHtml(mName) + '</div>' +
                    '<div class="comms-group-member-meta">' +
                    (position ? Comms.escapeHtml(String(position)) : Comms.escapeHtml(role)) +
                    (position && role === 'Admin' ? ' · Admin' : '') +
                    '</div></div>';
                if (mode === 'call' && Number(m.id) !== Number(state.currentUserId)) {
                    html += '<div class="comms-group-member-actions">' +
                        '<button type="button" class="comms-btn-secondary comms-group-call-btn" data-call-type="voice" data-user-id="' + Number(m.id) + '">Voice</button>' +
                        '<button type="button" class="comms-btn-secondary comms-group-call-btn" data-call-type="video" data-user-id="' + Number(m.id) + '">Video</button>' +
                        '</div>';
                }
                html += '</div>';
            });
        }
        html += '</div>';
        return html;
    }

    function openGroupInfoModal(mode, opts) {
        opts = opts || {};
        var conv = state.activeConversation;
        if (!conv || !isGroupConversation(conv) || !els.groupModal || !els.groupModalBody) return;
        var name = conv.name || (conv.other_user && conv.other_user.name) || 'Group chat';
        var count = Number(conv.member_count || (conv.members && conv.members.length) || 0);
        var max = Number(conv.max_members || 0);
        var typeLabel = conv.default_group_type === 'SK_OFFICIALS'
            ? 'SK Officials'
            : (conv.default_group_type === 'SK_FEDERATIONS' ? 'SK Federations' : 'Group');
        if (els.groupModalTitle) {
            els.groupModalTitle.textContent = mode === 'members'
                ? 'View Members'
                : (mode === 'call' ? 'Select call recipient' : 'Group Info');
        }

        // Always refresh members so photos/names stay accurate.
        if (!opts.skipFetch && routes.conversationMembers) {
            els.groupModalBody.innerHTML = '<p class="comms-muted">Loading members…</p>';
            els.groupModal.hidden = false;
            Comms.api(Comms.route(routes.conversationMembers, conv.id), { dedupe: true }).then(function (data) {
                if (data && data.conversation) {
                    state.activeConversation = Object.assign({}, state.activeConversation || {}, data.conversation);
                }
                if (data && Array.isArray(data.members)) {
                    state.activeConversation.members = data.members;
                    state.activeConversation.member_count = data.member_count != null
                        ? data.member_count
                        : data.members.length;
                }
                openGroupInfoModal(mode, { skipFetch: true });
            }).catch(function (err) {
                Comms.showToast(err.message || 'Unable to load members.', 'error');
                els.groupModalBody.innerHTML = '<p class="comms-muted">Unable to load members.</p>';
            });
            return;
        }

        var members = Array.isArray(conv.members) ? conv.members : [];
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

    function beginGroupOrDirectCall(callType) {
        var conv = state.activeConversation;
        if (!state.activeId || !window.CommsWebRTC) return;
        if (!isGroupConversation(conv)) {
            window.CommsWebRTC.startCall(state.activeId, callType, conv);
            return;
        }
        // Default GCs: ring the whole group (mesh). Optional 1:1 still available from Members.
        window.CommsWebRTC.startCall(state.activeId, callType, conv);
    }

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

    function renderConversations(filter) {
        var q = String(filter || '').trim().toLowerCase();
        var items = (state.conversations || []).filter(function (c) {
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
                : resolvePeerAvatar(peer);
            var liveOnline = !isGroup && peer.id && (window.__COMMS_PRESENCE_ONLINE_IDS__ || {})[Number(peer.id)];
            var online = isGroup
                ? 'offline'
                : (liveOnline || String(peer.online_status || '').toLowerCase() === 'online' ? 'online' : 'offline');
            if (!isGroup && peer && online === 'online') peer.online_status = 'online';
            var memberHint = '';
            if (isGroup) {
                var max = Number(c.max_members || 0);
                var count = Number(c.member_count || 0);
                memberHint = max > 0
                    ? ('<div class="comms-conv-limit">' + count + ' / ' + max + ' members</div>')
                    : (count > 0 ? ('<div class="comms-conv-limit">' + count + ' members</div>') : '');
            }
            return '<button type="button" class="comms-conv-item' + (isGroup ? ' is-group' : '') + active + '" data-id="' + c.id + '"' +
                ' data-peer-name="' + Comms.escapeHtml(fullName) + '"' +
                ' title="' + Comms.escapeHtml(fullName) + '"' +
                ' data-peer-avatar="' + Comms.escapeHtml(avatar) + '"' +
                ' data-peer-status="' + online + '"' +
                ' data-is-group="' + (isGroup ? '1' : '0') + '"' +
                ' role="listitem">' +
                '<img class="comms-avatar" src="' + Comms.escapeHtml(avatar) + '" alt="" onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(displayName)) + '\'">' +
                '<div class="comms-conv-main">' +
                '<div class="comms-conv-name" title="' + Comms.escapeHtml(fullName) + '">' + Comms.escapeHtml(displayName) + '</div>' +
                memberHint +
                '<div class="comms-conv-preview">' + Comms.escapeHtml(preview) + '</div>' +
                '</div>' +
                '<div class="comms-conv-meta">' +
                '<span class="comms-conv-time">' + Comms.escapeHtml(Comms.formatTime(c.updated_at)) + '</span>' +
                '</div></button>';
        }).join('');
    }

    function callBubbleClass(body) {
        var text = String(body || '').toLowerCase();
        if (text.indexOf('ended') !== -1) return 'comms-bubble--call comms-bubble--call-ended';
        if (text.indexOf('missed') !== -1) return 'comms-bubble--call comms-bubble--call-missed';
        if (text.indexOf('declined') !== -1) return 'comms-bubble--call comms-bubble--call-declined';
        if (text.indexOf('cancelled') !== -1 || text.indexOf('canceled') !== -1) return 'comms-bubble--call comms-bubble--call-cancelled';
        if (text.indexOf('answered') !== -1) return 'comms-bubble--call comms-bubble--call-answered';
        if (text.indexOf('started') !== -1 || text.indexOf('ringing') !== -1) return 'comms-bubble--call comms-bubble--call-started';
        return 'comms-bubble--call';
    }

    var callPhoneIcon = '<svg class="comms-call-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>';

    function groupCallStillOpen(m) {
        var body = String(m && m.body || '').toLowerCase();
        if (body.indexOf('group') === -1 || body.indexOf('started') === -1) return false;
        var items = state.messages || [];
        for (var i = 0; i < items.length; i += 1) {
            var other = items[i];
            if (!other || Number(other.id) <= Number(m.id) || other.message_type !== 'call') continue;
            var text = String(other.body || '').toLowerCase();
            if (text.indexOf('ended') !== -1 || text.indexOf('missed') !== -1 || text.indexOf('cancelled') !== -1 || text.indexOf('canceled') !== -1) {
                return false;
            }
        }
        return true;
    }

    function renderCallBubble(m) {
        var join = groupCallStillOpen(m)
            ? '<button type="button" class="comms-call-join" data-join-group-call="' + Comms.escapeHtml(String(m.conversation_id || state.activeId || '')) + '">Join Call</button>'
            : '';
        return '<div class="comms-bubble-wrap ' + (m.mine ? 'is-mine' : 'is-theirs') + ' is-call" data-id="' + m.id + '">' +
            '<div class="comms-bubble-row">' +
            '<div class="' + callBubbleClass(m.body) + '" role="status">' +
            callPhoneIcon +
            '<span class="comms-call-text">' + Comms.escapeHtml(m.body) + '</span>' +
            join +
            '</div>' +
            renderMessageActions(m, false) +
            '</div></div>';
    }

    function renderReactionChips(reactions, messageId) {
        var items = Array.isArray(reactions)
            ? reactions.filter(function (r) { return Number(r.count || 0) > 0; })
            : [];
        if (!items.length) return '';

        return '<div class="comms-reaction-chips" role="group" aria-label="Reactions">' +
            items.map(function (r) {
                return '<button type="button" class="comms-reaction-summary' + (r.mine ? ' is-mine' : '') + '"' +
                    ' data-react-people="' + Number(messageId || 0) + '"' +
                    ' data-react-people-emoji="' + Comms.escapeHtml(r.emoji) + '"' +
                    ' aria-haspopup="dialog" aria-label="' + Comms.escapeHtml(r.emoji) + ' ' + Number(r.count || 0) + ' reactions">' +
                    '<span class="comms-reaction-stack-btn" aria-hidden="true">' + Comms.escapeHtml(r.emoji) + '</span>' +
                    '<span class="comms-reaction-count" aria-hidden="true">' + Number(r.count || 0) + '</span>' +
                    '</button>';
            }).join('') +
            '</div>';
    }

    // Reaction picker is a fixed-position singleton on <body> to escape overflow:hidden clip contexts.
    var pickerEl = (function () {
        var el = document.createElement('div');
        el.className = 'comms-reaction-picker';
        el.setAttribute('role', 'menu');
        el.setAttribute('aria-label', 'Choose reaction');
        el.style.display = 'none';
        el.style.position = 'fixed';
        el.style.zIndex = '99999';
        document.body.appendChild(el);
        return el;
    }());

    function renderReactionPicker(messageId) {
        // Inline picker slot is no longer used; picker lives in pickerEl on body.
        return '';
    }

    function positionPicker(triggerBtn) {
        if (!triggerBtn) return;
        var rect = triggerBtn.getBoundingClientRect();
        var pickerW = pickerEl.offsetWidth || 240;
        var pickerH = pickerEl.offsetHeight || 48;
        var pad = 8;
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var top = rect.top - pickerH - 8;
        var left = rect.left + (rect.width / 2) - (pickerW / 2);

        if (top < pad) {
            top = rect.bottom + 8;
        }
        left = Math.max(pad, Math.min(left, vw - pickerW - pad));
        top = Math.max(pad, Math.min(top, vh - pickerH - pad));

        pickerEl.style.top = top + 'px';
        pickerEl.style.left = left + 'px';
    }

    function showPickerFor(messageId, triggerBtn) {
        state.openReactionPickerId = Number(messageId) || null;
        if (!state.openReactionPickerId) { hideGlobalPicker(); return; }
        pickerEl.setAttribute('data-react-picker', messageId);
        pickerEl.innerHTML = state.reactionEmojis.map(function (emoji) {
            return '<button type="button" class="comms-reaction-pick" data-react-emoji="' +
                Comms.escapeHtml(emoji) + '" role="menuitem">' +
                Comms.escapeHtml(emoji) + '</button>';
        }).join('');
        pickerEl.style.display = 'inline-flex';
        positionPicker(triggerBtn);
        requestAnimationFrame(function () {
            positionPicker(triggerBtn);
        });
    }

    function hideGlobalPicker() {
        state.openReactionPickerId = null;
        pickerEl.style.display = 'none';
        pickerEl.innerHTML = '';
    }

    var reactBtnIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg>';

    function formatBytes(bytes) {
        var n = Number(bytes || 0);
        if (!n) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(2) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function fileDocIconSvg() {
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
    }

    function fileExtLabel(name) {
        var parts = String(name || '').split('.');
        return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
    }

    function fileKindClass(att) {
        var name = String((att && att.file_name) || '');
        var mime = String((att && att.mime_type) || '').toLowerCase();
        var ext = fileExtLabel(name);
        if (ext === 'PDF' || mime === 'application/pdf') return ' is-pdf';
        if (ext === 'DOC' || ext === 'DOCX' || mime.indexOf('msword') !== -1 || mime.indexOf('wordprocessingml') !== -1) {
            return ' is-word';
        }
        if (ext === 'XLS' || ext === 'XLSX' || mime.indexOf('spreadsheetml') !== -1 || mime.indexOf('ms-excel') !== -1) {
            return ' is-excel';
        }
        return '';
    }

    function formatFullDateTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString([], {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function formatDaySeparator(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        var now = new Date();
        var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (d.toDateString() === now.toDateString()) return time;
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + time;
        var weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        if (d >= weekAgo) {
            return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + time;
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + time;
    }

    function shouldInsertDateSeparator(prevIso, currIso) {
        if (!currIso) return false;
        if (!prevIso) return true;
        var prev = new Date(prevIso);
        var curr = new Date(currIso);
        if (Number.isNaN(prev.getTime()) || Number.isNaN(curr.getTime())) return true;
        if (prev.toDateString() !== curr.toDateString()) return true;
        return Math.abs(curr.getTime() - prev.getTime()) >= 45 * 60 * 1000;
    }

    function renderDateSeparator(iso) {
        var label = formatDaySeparator(iso);
        if (!label) return '';
        return '<div class="comms-date-sep" role="separator">' +
            '<span class="comms-date-sep-text">' + Comms.escapeHtml(label) + '</span>' +
            '</div>';
    }

    function renderAttachments(attachments) {
        var items = Array.isArray(attachments) ? attachments : [];
        if (!items.length) return '';
        return items.map(function (att) {
            if (att.file_type === 'image' || att.storage_provider === 'cloudinary') {
                var src = att.url || att.download_url;
                return '<button type="button" class="comms-bubble-image" data-comms-lightbox-src="' + Comms.escapeHtml(src) + '" aria-label="View image">' +
                    '<img src="' + Comms.escapeHtml(src) + '" alt="' + Comms.escapeHtml(att.file_name || 'Image') + '" loading="lazy">' +
                    '</button>';
            }
            var kind = fileKindClass(att);
            var href = att.download_url || '';
            var name = att.file_name || 'Document';
            var sizeLabel = formatBytes(att.file_size);
            var metaHtml = '<span class="comms-bubble-file-ext" aria-hidden="true">' + fileDocIconSvg() + '</span>' +
                '<span class="comms-bubble-file-meta">' +
                '<span class="comms-bubble-file-name">' + Comms.escapeHtml(name) + '</span>' +
                (sizeLabel ? '<span class="comms-bubble-file-size">' + Comms.escapeHtml(sizeLabel) + '</span>' : '') +
                '</span>';
            if (kind.indexOf('is-pdf') !== -1 && href) {
                return '<a class="comms-bubble-file' + kind + '" href="' + Comms.escapeHtml(href) + '" download="' + Comms.escapeHtml(name) + '" target="_blank" rel="noopener noreferrer" title="' + Comms.escapeHtml(name) + '">' +
                    metaHtml +
                    '</a>';
            }
            return '<a class="comms-bubble-file' + kind + '" href="' + Comms.escapeHtml(href) + '" download="' + Comms.escapeHtml(name) + '" target="_blank" rel="noopener noreferrer" title="' + Comms.escapeHtml(name) + '">' +
                metaHtml +
                '</a>';
        }).join('');
    }

    function clearPendingAttachment() {
        state.pendingPreviewUrls.forEach(function (url) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        });
        state.pendingAttachments = [];
        state.pendingPreviewUrls = [];
        state.pendingAttachment = null;
        state.pendingPreviewUrl = null;
        if (els.photoInput) els.photoInput.value = '';
        if (els.cameraInput) els.cameraInput.value = '';
        if (els.fileInput) els.fileInput.value = '';
        if (els.attachPreview) els.attachPreview.hidden = true;
        if (els.attachPreviewInner) els.attachPreviewInner.innerHTML = '';
        setUploadProgress(0, true);
        syncComposerEndControls();
    }

    function setUploadProgress(percent, hidden) {
        if (!els.uploadProgress || !els.uploadProgressBar) return;
        if (hidden) {
            els.uploadProgress.hidden = true;
            els.uploadProgressBar.style.width = '0%';
            return;
        }
        els.uploadProgress.hidden = false;
        els.uploadProgressBar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    }

    function isImageFile(file) {
        return String((file && file.type) || '').indexOf('image/') === 0;
    }

    function syncComposerEndControls() {
        if (!els.sendBtn) return;
        var hasText = !!String(els.input && els.input.value || '').length;
        var hasFiles = (state.pendingAttachments || []).length > 0;
        var canSend = hasText || hasFiles;
        els.sendBtn.hidden = false;
        els.sendBtn.disabled = !!state.sendInFlight || !canSend;
        els.sendBtn.classList.toggle('is-ready', canSend);
        els.sendBtn.title = 'Send';
    }

    function messageMaxLines() {
        var fromDom = Number(els.input && els.input.getAttribute('data-max-lines'));
        return Math.max(1, Number.isFinite(fromDom) && fromDom > 0 ? fromDom : 500);
    }

    function countMessageLines(raw) {
        var body = normalizeMessageBody(raw);
        if (body === '') return 0;
        return body.split('\n').length;
    }

    function clampMessageToMaxLines(text) {
        var max = messageMaxLines();
        var lines = normalizeMessageBody(text).split('\n');
        if (lines.length <= max) return lines.join('\n');
        return lines.slice(0, max).join('\n');
    }

    function normalizeMessageBody(raw) {
        if (Comms.normalizeMessageBody) {
            return Comms.normalizeMessageBody(raw);
        }
        return String(raw == null ? '' : raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    function messageCharCount(raw) {
        var body = normalizeMessageBody(raw);
        if (Comms.measureMessageLength) {
            return Comms.measureMessageLength(body);
        }
        return body.length;
    }

    function validateMessageBody(raw, opts) {
        opts = opts || {};
        var body = normalizeMessageBody(raw);
        var allowEmpty = !!opts.allowEmpty;
        if (!allowEmpty && body.trim() === '') {
            Comms.showToast('Message cannot be empty.', 'error');
            return null;
        }
        if (countMessageLines(body) > messageMaxLines()) {
            Comms.showToast('Message cannot exceed ' + messageMaxLines() + ' lines.', 'error');
            return null;
        }
        var count = messageCharCount(body);
        if (count > state.messageMaxLength) {
            Comms.showToast('Message cannot exceed 1000 characters.', 'error');
            return null;
        }
        return body;
    }

    function clampMessageToMaxChars(text) {
        var next = normalizeMessageBody(text);
        if (next.length <= state.messageMaxLength) return next;
        return next.slice(0, state.messageMaxLength);
    }

    function toastMessageCharLimit() {
        Comms.showToast('Message cannot exceed 1000 characters.', 'error');
    }

    function removePendingAttachmentAt(index) {
        var i = Number(index);
        if (!Number.isFinite(i) || i < 0 || i >= (state.pendingAttachments || []).length) return;
        var url = state.pendingPreviewUrls[i];
        if (url) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }
        state.pendingAttachments.splice(i, 1);
        state.pendingPreviewUrls.splice(i, 1);
        state.pendingAttachment = state.pendingAttachments[0] || null;
        state.pendingPreviewUrl = state.pendingPreviewUrls[0] || null;
        renderAttachPreview();
        syncComposerEndControls();
    }

    function renderAttachPreview() {
        if (!els.attachPreview || !els.attachPreviewInner) return;
        var files = state.pendingAttachments || [];
        if (!files.length) {
            els.attachPreview.hidden = true;
            els.attachPreviewInner.innerHTML = '';
            return;
        }
        els.attachPreview.hidden = false;
        els.attachPreviewInner.innerHTML = files.map(function (f, i) {
            var name = Comms.escapeHtml(f.name || (isImageFile(f) ? 'Image' : 'File'));
            var removeBtn = '<button type="button" class="comms-attach-item-remove" data-attach-remove="' + i + '" title="Remove" aria-label="Remove ' + name + '">&times;</button>';
            if (isImageFile(f) && state.pendingPreviewUrls[i]) {
                var src = state.pendingPreviewUrls[i];
                return '<div class="comms-attach-preview-item is-image is-row">' +
                    '<button type="button" class="comms-attach-preview-zoom" data-comms-lightbox-src="' + Comms.escapeHtml(src) + '" aria-label="View image">' +
                    '<img src="' + Comms.escapeHtml(src) + '" alt="' + name + '"></button>' +
                    '<span class="comms-attach-preview-name" title="' + name + '">' + name + '</span>' +
                    removeBtn +
                    '</div>';
            }
            return '<div class="comms-attach-preview-item comms-attach-preview-file is-row">' +
                '<strong>' + Comms.escapeHtml(fileExtLabel(f.name)) + '</strong>' +
                '<span class="comms-attach-preview-name" title="' + name + '">' + name + '</span>' +
                removeBtn +
                '</div>';
        }).join('');
        if (els.attachPreview.dataset.attachWired !== 'true') {
            els.attachPreview.addEventListener('click', function (e) {
                var removeBtn = e.target.closest('[data-attach-remove]');
                if (removeBtn && els.attachPreview.contains(removeBtn)) {
                    e.preventDefault();
                    e.stopPropagation();
                    removePendingAttachmentAt(removeBtn.getAttribute('data-attach-remove'));
                    return;
                }
                var thumb = e.target.closest('[data-comms-lightbox-src]');
                if (!thumb || !els.attachPreview.contains(thumb)) return;
                e.preventDefault();
                e.stopPropagation();
                var images = Array.prototype.slice.call(els.attachPreview.querySelectorAll('[data-comms-lightbox-src]')).map(function (node) {
                    return node.getAttribute('data-comms-lightbox-src') || '';
                }).filter(Boolean);
                var start = thumb.getAttribute('data-comms-lightbox-src') || '';
                if (start && Comms.openImageLightbox) {
                    if (Date.now() < (window.__commsIgnoreLightboxUntil || 0)) return;
                    Comms.openImageLightbox(start, images, {
                        onRemoveAt: function (idx, src) {
                            var pendingIdx = (state.pendingPreviewUrls || []).indexOf(src);
                            if (pendingIdx >= 0) removePendingAttachmentAt(pendingIdx);
                        }
                    });
                }
            });
            els.attachPreview.dataset.attachWired = 'true';
        }
    }

    function pushPendingFiles(files, kind) {
        var maxImg = state.maxImageCount || 3;
        var maxFile = state.maxFileCount || 10;
        var maxBytes = state.maxTotalBytes || (25 * 1024 * 1024);
        var list = Array.prototype.slice.call(files || []);
        if (!list.length) return;

        var selectBytes = 0;
        var selectImg = 0;
        var selectFile = 0;
        list.forEach(function (f) {
            selectBytes += f.size || 0;
            if (isImageFile(f)) selectImg++;
            else selectFile++;
        });

        var pendingBytes = 0;
        var imgCount = 0;
        var fileCount = 0;
        (state.pendingAttachments || []).forEach(function (f) {
            pendingBytes += f.size || 0;
            if (isImageFile(f)) imgCount++;
            else fileCount++;
        });

        if (selectBytes > maxBytes || (pendingBytes + selectBytes) > maxBytes) {
            Comms.showToast('Maximum 25 MB only. Selection was not added.', 'error');
            return;
        }
        if (kind === 'image' && (imgCount + selectImg) > maxImg) {
            Comms.showToast('Max 3 images per upload. Selection was not added.', 'error');
            return;
        }
        if (kind !== 'image' && (fileCount + selectFile) > maxFile) {
            Comms.showToast('Max ' + maxFile + ' files. Selection was not added.', 'error');
            return;
        }

        list.forEach(function (f) {
            state.pendingAttachments.push(f);
            state.pendingPreviewUrls.push(isImageFile(f) ? URL.createObjectURL(f) : null);
        });
        state.pendingAttachment = state.pendingAttachments[0] || null;
        state.pendingPreviewUrl = state.pendingPreviewUrls[0] || null;
        renderAttachPreview();
        syncComposerEndControls();
    }

    function setPendingAttachment(file) {
        if (!file) return;
        pushPendingFiles([file], isImageFile(file) ? 'image' : 'file');
    }

    function syncScrollBottomBtn() {
        if (!els.scrollBottom || !els.messages) return;
        var el = els.messages;
        var distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        els.scrollBottom.hidden = distance < 80;
    }

    function jumpToLatestMessages() {
        if (!els.messages) return;
        var pin = function () {
            els.messages.scrollTop = els.messages.scrollHeight;
            syncScrollBottomBtn();
        };
        pin();
        window.requestAnimationFrame(function () {
            pin();
            window.requestAnimationFrame(pin);
        });
        window.setTimeout(pin, 50);
        window.setTimeout(pin, 200);
    }

    var msgMoreIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.85"/><circle cx="12" cy="12" r="1.85"/><circle cx="12" cy="19" r="1.85"/></svg>';

    function renderMessageActions(m, deleted) {
        var items = '';
        if (!deleted && m.mine && m.message_type === 'text') {
            items += '<button type="button" role="menuitem" data-msg-edit="' + m.id + '">Edit</button>';
        }
        items += '<button type="button" role="menuitem" data-msg-delete="' + m.id + '">Delete</button>';
        return '<div class="comms-msg-actions">' +
            '<button type="button" class="comms-msg-more" data-msg-more="' + m.id + '" aria-label="Message actions" aria-haspopup="menu" aria-expanded="false" title="More">' + msgMoreIcon + '</button>' +
            '<div class="comms-msg-menu" data-msg-menu="' + m.id + '" role="menu" hidden>' + items + '</div>' +
            '</div>';
    }

    function closeMessageMenus() {
        if (!els.messages) return;
        els.messages.querySelectorAll('[data-msg-menu]').forEach(function (menu) {
            menu.hidden = true;
        });
        els.messages.querySelectorAll('[data-msg-more]').forEach(function (btn) {
            btn.setAttribute('aria-expanded', 'false');
        });
        els.messages.querySelectorAll('.comms-bubble-wrap.is-menu-open').forEach(function (wrap) {
            wrap.classList.remove('is-menu-open');
        });
    }

    function replaceMessage(updated) {
        if (!updated) return;
        var idx = state.messages.findIndex(function (m) { return Number(m.id) === Number(updated.id); });
        if (idx === -1) return;
        state.messages[idx] = updated;
        saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
        renderMessages({ preserveScroll: true });
    }

    function removeMessageLocal(messageId) {
        state.messages = state.messages.filter(function (m) { return Number(m.id) !== Number(messageId); });
        saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
        renderMessages({ preserveScroll: true });
        loadConversations();
    }

    function saveEditedMessage(messageId) {
        var input = els.messages.querySelector('[data-edit-input="' + messageId + '"]');
        if (!input || !routes.updateMessage) return;
        var body = validateMessageBody(input.value, { el: input });
        if (body == null) return;
        state.msgChangeSkipToast[String(messageId)] = true;
        Comms.api(Comms.route(routes.updateMessage, messageId), {
            method: 'PATCH',
            body: JSON.stringify({ body: body }),
            dedupe: false
        }).then(function (data) {
            state.editingId = null;
            if (data && data.message) {
                replaceMessage(data.message);
            }
            Comms.showToast('Message saved.', 'success');
            window.setTimeout(function () { delete state.msgChangeSkipToast[String(messageId)]; }, 800);
        }).catch(function (err) {
            delete state.msgChangeSkipToast[String(messageId)];
            Comms.showToast(err.message || 'Unable to edit message.', 'error');
        });
    }

    function deleteMessage(messageId, scope) {
        if (!routes.deleteMessage) return;
        state.msgChangeSkipToast[String(messageId)] = true;
        Comms.api(Comms.route(routes.deleteMessage, messageId) + '?scope=' + encodeURIComponent(scope), {
            method: 'DELETE',
            body: JSON.stringify({ scope: scope }),
            dedupe: false
        }).then(function (data) {
            state.editingId = null;
            if (data && data.scope === 'me') {
                removeMessageLocal(messageId);
                Comms.showToast('Message deleted for you.', 'success');
                return;
            }
            if (data && data.message) {
                replaceMessage(data.message);
                loadConversations();
                Comms.showToast('Message deleted for everyone.', 'success');
            }
            window.setTimeout(function () { delete state.msgChangeSkipToast[String(messageId)]; }, 800);
        }).catch(function (err) {
            delete state.msgChangeSkipToast[String(messageId)];
            Comms.showToast(err.message || 'Unable to delete message.', 'error');
        });
    }

    function openDeletePrompt(messageId) {
        var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
        if (!msg) return;
        var deleted = msg.deleted_for_all || msg.message_type === 'deleted';
        var canDeleteAll = !!msg.mine && !deleted;
        if (typeof Comms.openDeleteMessageDialog !== 'function') {
            deleteMessage(messageId, canDeleteAll ? 'all' : 'me');
            return;
        }
        Comms.openDeleteMessageDialog({ canDeleteAll: canDeleteAll }).then(function (scope) {
            if (!scope) return;
            deleteMessage(messageId, scope);
        });
    }

    function latestMineMessageId(items) {
        for (var i = items.length - 1; i >= 0; i -= 1) {
            if (items[i] && items[i].mine && items[i].message_type !== 'call' && items[i].message_type !== 'system') {
                return String(items[i].id);
            }
        }
        return null;
    }

    function renderSendStatus(msg, isLatestMine) {
        if (!msg || !msg.mine || !isLatestMine) return '';
        var status = msg.send_status || '';
        if (!status && String(msg.id || '').indexOf('local-') === 0) status = 'sending';
        // Hide "Sent" after a moment; never leave a permanent label on real ids.
        if (status === 'sent' && String(msg.id || '').indexOf('local-') !== 0) {
            var age = msg._sentAt ? (Date.now() - Number(msg._sentAt)) : 99999;
            if (age > 2500) return '';
        }
        if (status !== 'sending' && status !== 'sent' && status !== 'failed') return '';
        var label = status === 'sending' ? 'Sending...' : (status === 'sent' ? 'Sent' : 'Failed');
        return '<div class="comms-send-status is-' + status + '" role="status">' + label + '</div>';
    }

    function renderMessages(opts) {
        opts = opts || {};
        var prevScroll = els.messages ? els.messages.scrollTop : 0;
        var stickBottom = false;
        if (opts.stickBottom === true) {
            stickBottom = true;
        } else if (els.messages && opts.stickBottom !== false && !opts.preserveScroll) {
            stickBottom = els.messages.scrollTop + els.messages.clientHeight >= els.messages.scrollHeight - 48;
        }
        if (!els.messages) return;

        var items = state.messages || [];
        var parts = [];
        var prevCreatedAt = null;
        var latestIndex = items.length - 1;
        var latestMineId = latestMineMessageId(items);

        items.forEach(function (m, index) {
            var insertedSep = false;
            if (shouldInsertDateSeparator(prevCreatedAt, m.created_at)) {
                parts.push(renderDateSeparator(m.created_at));
                insertedSep = true;
            }
            if (index === latestIndex && !insertedSep) {
                parts.push(renderDateSeparator(m.created_at || prevCreatedAt));
            }

            var titleAttr = ' title="' + Comms.escapeHtml(formatFullDateTime(m.created_at)) + '"';

            if (m.message_type === 'call' || m.message_type === 'system') {
                parts.push(renderCallBubble(m));
                prevCreatedAt = m.created_at;
                return;
            }
            if (m.deleted_for_all || m.message_type === 'deleted') {
                parts.push('<div class="comms-bubble-wrap ' + (m.mine ? 'is-mine' : 'is-theirs') + '" data-id="' + m.id + '"' + titleAttr + '>' +
                    renderGroupSenderMeta(m, !!m.mine, items[index - 1]) +
                    '<div class="comms-bubble-row">' +
                    '<div class="comms-bubble comms-bubble--deleted">' +
                    '<div class="comms-bubble-text">This message was deleted</div>' +
                    '</div>' +
                    '<div class="comms-bubble-tools">' + renderMessageActions(m, true) + '</div>' +
                    '</div></div>');
                prevCreatedAt = m.created_at;
                return;
            }

            var mine = !!m.mine;
            var pickerOpen = Number(state.openReactionPickerId) === Number(m.id);
            var editing = Number(state.editingId) === Number(m.id);
            var hasAttachments = (m.message_type === 'image' || m.message_type === 'file') ||
                (Array.isArray(m.attachments) && m.attachments.length > 0);
            var hasTextBody = !!String(m.body || '').trim() || editing;
            var attachmentOnly = hasAttachments && !hasTextBody;
            var splitAttachText = hasAttachments && hasTextBody && !editing;
            var showMsgActions = !editing;
            var showReact = !editing;
            var isAutomation = m.message_type === 'automation';
            var sideCls = mine ? 'comms-bubble--mine' : 'comms-bubble--theirs';
            var bubbleExtra = (hasAttachments ? ' has-attachment' : '') +
                (attachmentOnly ? ' has-attachment-only' : '') +
                (isAutomation ? ' comms-bubble--automation' : '');
            var attachHtml = renderAttachments(m.attachments);
            var bodyHtml = '';
            if (m.body && !editing) {
                bodyHtml = '<div class="comms-bubble-text">' + Comms.escapeHtml(m.body) +
                    (m.edited ? ' <span class="comms-edited">edited</span>' : '') +
                    '</div>';
            }

            var bubbleContent;
            if (editing) {
                bubbleContent =
                    '<div class="comms-edit-panel" role="group" aria-label="Edit message">' +
                    '<label class="visually-hidden" for="commsEditInput' + m.id + '">Edit message</label>' +
                    '<textarea id="commsEditInput' + m.id + '" class="comms-edit-input" data-edit-input="' + m.id + '" rows="3" data-max-lines="500">' +
                    Comms.escapeHtml(m.body || '') +
                    '</textarea>' +
                    '<div class="comms-edit-actions">' +
                    '<button type="button" class="comms-edit-cancel" data-edit-cancel="' + m.id + '">Cancel</button>' +
                    '<button type="button" class="comms-edit-save" data-edit-save="' + m.id + '">Save</button>' +
                    '</div></div>';
            } else if (splitAttachText) {
                bubbleContent =
                    '<div class="comms-bubble-cluster">' +
                    '<div class="comms-bubble ' + sideCls + ' has-attachment has-attachment-only">' + attachHtml + '</div>' +
                    '<div class="comms-bubble ' + sideCls + (isAutomation ? ' comms-bubble--automation' : '') + '">' + bodyHtml + '</div></div>';
            } else {
                bubbleContent =
                    '<div class="comms-bubble ' + sideCls + bubbleExtra + '">' +
                    attachHtml +
                    bodyHtml +
                    '</div>';
            }

            parts.push('<div class="comms-bubble-wrap ' + (mine ? 'is-mine' : 'is-theirs') + (pickerOpen ? ' is-picker-open' : '') + (isAutomation ? ' is-automation' : '') + '" data-id="' + m.id + '"' + titleAttr + '>' +
                renderGroupSenderMeta(m, mine, items[index - 1]) +
                '<div class="comms-bubble-row">' +
                bubbleContent +
                '<div class="comms-bubble-tools">' +
                (showMsgActions ? renderMessageActions(m, false) : '') +
                (showReact ? '<button type="button" class="comms-react-btn" data-react-toggle="' + m.id + '" aria-label="Add reaction" title="React" aria-expanded="' + (pickerOpen ? 'true' : 'false') + '">' + reactBtnIcon + '</button>' : '') +
                '</div>' +
                '</div>' +
                (showReact ? renderReactionPicker(m.id) : '') +
                renderReactionChips(m.reactions, m.id) +
                renderSendStatus(m, latestMineId != null && String(m.id) === latestMineId) +
                '</div>');
            prevCreatedAt = m.created_at;
        });

        els.messages.innerHTML = parts.join('');
        if (opts.preserveScroll) {
            els.messages.scrollTop = prevScroll;
        } else if (stickBottom || opts.stickBottom === true) {
            els.messages.scrollTop = els.messages.scrollHeight;
        } else {
            els.messages.scrollTop = prevScroll;
        }
        if (opts.restoreScrollHeight != null && Number.isFinite(opts.restoreScrollHeight)) {
            els.messages.scrollTop = els.messages.scrollHeight - opts.restoreScrollHeight;
        }
        syncScrollBottomBtn();
        if (window.Comms && typeof window.Comms.wireChatImageLightbox === 'function' && !els.messages.dataset.lightboxWired) {
            window.Comms.wireChatImageLightbox(els.messages);
            els.messages.dataset.lightboxWired = 'true';
        }
        if (window.Comms && typeof window.Comms.wireDocumentPreview === 'function' && !els.messages.dataset.docPreviewWired) {
            window.Comms.wireDocumentPreview(els.messages);
        }
        if (state.editingId && Comms.resizeGrowTextarea) {
            var editEl = els.messages.querySelector('[data-edit-input="' + state.editingId + '"]');
            if (editEl) {
                Comms.resizeGrowTextarea(editEl, 6, 2);
            }
        }
    }

    function closeReactionPickersDom() {
        hideGlobalPicker();
        if (!els.messages) return;
        els.messages.querySelectorAll('.comms-bubble-wrap.is-picker-open').forEach(function (el) {
            el.classList.remove('is-picker-open');
            var btn = el.querySelector('[data-react-toggle]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    function openReactionPickerInPlace(messageId, triggerBtn) {
        if (!els.messages) return;
        closeReactionPickersDom();
        var wrap = els.messages.querySelector('.comms-bubble-wrap[data-id="' + messageId + '"]');
        if (wrap) {
            wrap.classList.add('is-picker-open');
            if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
        }
        showPickerFor(messageId, triggerBtn || document.body);
    }

    function patchReactionChipsDom(messageId, reactions) {
        if (!els.messages) return false;
        var wrap = els.messages.querySelector('.comms-bubble-wrap[data-id="' + messageId + '"]');
        if (!wrap) return false;
        var chipsHtml = renderReactionChips(reactions, messageId);
        var existing = wrap.querySelector('.comms-reaction-chips');
        if (existing) {
            if (chipsHtml) existing.outerHTML = chipsHtml;
            else existing.remove();
        } else if (chipsHtml) {
            wrap.insertAdjacentHTML('beforeend', chipsHtml);
        }
        return true;
    }

    function cloneReactions(reactions) {
        return Comms.cloneReactions ? Comms.cloneReactions(reactions) : (Array.isArray(reactions) ? reactions.slice() : []);
    }

    function optimisticToggleReactions(reactions, emoji) {
        if (Comms.optimisticToggleReactions) {
            return Comms.optimisticToggleReactions(reactions, emoji, {
                currentUserId: state.currentUserId,
                portalUserType: state.portalUserType
            });
        }
        return reactions;
    }

    function applyMessageReactions(messageId, reactions, opts) {
        opts = opts || {};
        var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
        if (msg) {
            msg.reactions = Array.isArray(reactions) ? reactions : [];
        }
        if (opts.closePicker !== false) {
            state.openReactionPickerId = null;
            closeReactionPickersDom();
        }
        if (!patchReactionChipsDom(messageId, msg ? msg.reactions : reactions)) {
            renderMessages({ preserveScroll: true });
        }
        if (state.activeId) {
            saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
        }
    }

    function patchRemoteReaction(messageId, eventType, row) {
        var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
        if (!msg || !row) return false;
        var list = cloneReactions(msg.reactions);
        var emoji = String(row.emoji || '');
        if (!emoji) return false;
        var isMine = Number(row.user_id) === Number(state.currentUserId)
            && String(row.user_type || '') === String(state.portalUserType || '');
        // Ignore our own realtime echoes while a local toggle is in flight.
        if (isMine && state.reactSkipRealtime[String(messageId)]) return true;
        var entry = null;
        list.forEach(function (r) {
            if (r.emoji === emoji) entry = r;
        });

        if (eventType === 'DELETE') {
            if (!entry) return true;
            entry.count = Math.max(0, entry.count - 1);
            if (isMine) entry.mine = false;
            entry.users = (entry.users || []).filter(function (u) {
                return !(Number(u.id) === Number(row.user_id) && String(u.user_type || '') === String(row.user_type || ''));
            });
        } else if (eventType === 'INSERT') {
            var newUser = {
                id: Number(row.user_id || 0),
                user_type: String(row.user_type || ''),
                name: isMine ? 'You' : String((state.activeConversation && state.activeConversation.other_user && state.activeConversation.other_user.name) || 'Someone'),
                mine: isMine
            };
            if (entry) {
                entry.count += 1;
                if (isMine) entry.mine = true;
                entry.users = (entry.users || []).filter(function (u) {
                    return !(Number(u.id) === newUser.id && String(u.user_type || '') === newUser.user_type);
                }).concat([newUser]);
            } else {
                list.push({ emoji: emoji, count: 1, mine: isMine, users: [newUser] });
            }
        } else if (eventType === 'UPDATE') {
            var oldEmoji = String((row._old_emoji) || '');
            if (!oldEmoji || oldEmoji === emoji) return false;
            var oldEntry = null;
            list.forEach(function (r) {
                if (r.emoji === oldEmoji) oldEntry = r;
            });
            if (oldEntry) {
                oldEntry.count = Math.max(0, oldEntry.count - 1);
                if (isMine) oldEntry.mine = false;
            }
            if (entry) {
                entry.count += 1;
                if (isMine) entry.mine = true;
            } else {
                list.push({ emoji: emoji, count: 1, mine: isMine });
            }
        } else {
            return false;
        }

        msg.reactions = list.filter(function (r) { return Number(r.count) > 0; });
        if (!patchReactionChipsDom(messageId, msg.reactions)) {
            renderMessages({ preserveScroll: true });
        }
        if (state.activeId) {
            saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
        }
        return true;
    }

    function onReactionChange(messageId, meta) {
        if (!state.activeId || !messageId) return;
        if (!state.messages.some(function (m) { return Number(m.id) === Number(messageId); })) return;
        if (state.reactSkipRealtime[String(messageId)]) return;

        if (meta && meta.eventType && patchRemoteReaction(messageId, meta.eventType, meta.row)) {
            return;
        }

        var watchId = state.activeId;
        var watchSeq = state.reactSeq[String(messageId)] || 0;
        Comms.api(Comms.route(routes.messages, watchId), { dedupe: true }).then(function (data) {
            if (Number(state.activeId) !== Number(watchId)) return;
            if ((state.reactSeq[String(messageId)] || 0) !== watchSeq) return;
            if (state.reactSkipRealtime[String(messageId)]) return;
            var fresh = (data.messages || []).find(function (m) {
                return Number(m.id) === Number(messageId);
            });
            if (!fresh) return;
            applyMessageReactions(messageId, fresh.reactions || [], { closePicker: false });
        }).catch(function () { /* ignore */ });
    }

    function toggleReaction(messageId, emoji) {
        if (!routes.react || !messageId || !emoji) return;

        var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
        if (!msg) return;

        var previous = cloneReactions(msg.reactions);
        var next = optimisticToggleReactions(previous, emoji);
        var added = next.some(function (r) { return r.emoji === emoji && r.mine; })
            && !previous.some(function (r) { return r.emoji === emoji && r.mine; });

        var key = String(messageId);
        var seq = (state.reactSeq[key] || 0) + 1;
        state.reactSeq[key] = seq;
        state.reactSkipRealtime[key] = true;

        if (added && typeof Comms.playReactionSound === 'function') {
            Comms.playReactionSound();
        }
        applyMessageReactions(messageId, next);

        Comms.api(Comms.route(routes.react, messageId), {
            method: 'POST',
            body: JSON.stringify({ emoji: emoji }),
            dedupe: false
        }).then(function (data) {
            // Stale response from an older click — keep the latest optimistic UI.
            if (state.reactSeq[key] !== seq) return;
            applyMessageReactions(data.message_id || messageId, data.reactions || next, { closePicker: false });
        }).catch(function (err) {
            if (state.reactSeq[key] !== seq) return;
            applyMessageReactions(messageId, previous, { closePicker: false });
            Comms.showToast(err.message || 'Unable to react.', 'error');
        }).finally(function () {
            if (state.reactSeq[key] !== seq) return;
            window.setTimeout(function () {
                if (state.reactSeq[key] !== seq) return;
                delete state.reactSkipRealtime[key];
            }, 500);
        });
    }

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

    function updatePeerHeader(conversation) {
        var peer = (conversation && conversation.other_user) || {};
        var isGroup = isGroupConversation(conversation);
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
            if (peer.user_type_label) statusBits.push(String(peer.user_type_label));
            statusBits.push(max > 0 ? (count + ' / ' + max + ' members') : (count + ' members'));
        } else {
            if (peer.user_type_label) statusBits.push(String(peer.user_type_label));
            if (peer.position) statusBits.push(String(peer.position));
            if (peer.barangay_name) statusBits.push(String(peer.barangay_name));
            statusBits.push(formatPresenceLabel(peer));
        }
        if (els.peerMeta) els.peerMeta.textContent = statusBits.filter(Boolean).join(' · ');

        var isOnline = !isGroup && String(peer.online_status || '').toLowerCase() === 'online';
        if (els.peerStatusDot) {
            els.peerStatusDot.hidden = !!isGroup;
            els.peerStatusDot.setAttribute('data-status', isOnline ? 'online' : 'offline');
            els.peerStatusDot.title = isOnline ? 'Online' : 'Offline';
        }

        if (els.peerAvatar) {
            var avatarUrl = isGroup
                ? ((conversation && conversation.avatar_url) || peer.profile_image_url || Comms.defaultAvatar(name))
                : resolvePeerAvatar(peer);
            els.peerAvatar.alt = name;
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

        syncGroupActions(conversation);

        if (conversation && conversation.id && !isGroup) {
            savePeerProfileCache(conversation.id, peer);
        }
    }

    function peerProfileCacheKey(conversationId) {
        return 'comms:peer-profile:' + String(conversationId);
    }

    function loadPeerProfileCache(conversationId) {
        if (!window.SkLocalCache || typeof window.SkLocalCache.get !== 'function') return null;
        var entry = window.SkLocalCache.get(peerProfileCacheKey(conversationId));
        if (!entry || !entry.payload) return null;
        return entry.payload;
    }

    function savePeerProfileCache(conversationId, peer) {
        if (!conversationId || !peer || !window.SkLocalCache || typeof window.SkLocalCache.set !== 'function') return;
        window.SkLocalCache.set(peerProfileCacheKey(conversationId), {
            id: peer.id || null,
            name: peer.name || '',
            user_type_label: peer.user_type_label || '',
            position: peer.position || '',
            barangay_name: peer.barangay_name || '',
            profile_image_url: peer.profile_image_url || '',
            online_status: peer.online_status || '',
            last_seen: peer.last_seen || null,
            user_type: peer.user_type || ''
        });
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
            if (peer && peer.id && live[Number(peer.id)]) {
                peer.online_status = 'online';
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
                var keyId = Number(key || 0);
                if (keyId) onlineIds[keyId] = true;
                return;
            }
            metas.forEach(function (meta) {
                var uid = Number((meta && meta.user_id) || key || 0);
                if (uid) onlineIds[uid] = true;
            });
        });
        window.__COMMS_PRESENCE_ONLINE_IDS__ = Object.assign(
            {},
            window.__COMMS_PRESENCE_ONLINE_IDS__ || {},
            onlineIds
        );

        state.conversations.forEach(function (c) {
            var peer = c.other_user;
            if (!peer || !peer.id) return;
            var next = onlineIds[Number(peer.id)] ? 'online' : 'offline';
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

    function setListMode(mode) {
        state.listMode = mode;
        var isChats = mode === 'conversations';
        if (els.convList) els.convList.hidden = !isChats;
        if (els.directoryList) els.directoryList.hidden = isChats;
        // Keep Search always visible (filters chats or people).
        if (els.convFilter) els.convFilter.hidden = false;
        var convFilterWrap = document.querySelector('.comms-search-wrap--filter');
        if (convFilterWrap) convFilterWrap.hidden = false;
        if (els.barangayFilter) {
            var showBarangay = mode === 'officials' || mode === 'chairpersons';
            els.barangayFilter.hidden = !showBarangay;
            var barangayWrap = document.getElementById('commsBarangayWrap');
            if (barangayWrap) barangayWrap.hidden = !showBarangay;
        }
        if (els.convEmpty && !isChats) {
            els.convEmpty.hidden = true;
        }
        if (els.searchResults) {
            els.searchResults.hidden = true;
            els.searchResults.innerHTML = '';
        }
    }

    function loadDirectory() {
        if (!routes.directory) return Promise.resolve();
        var params = new URLSearchParams();
        params.set('filter', state.directoryFilter || 'officials');
        if (state.barangayId) params.set('barangay_id', state.barangayId);
        return Comms.api(routes.directory + '?' + params.toString()).then(function (data) {
            renderDirectory(data.groups || []);
        }).catch(function (err) {
            Comms.showToast(err.message || 'Failed to load directory.', 'error');
        });
    }

    function renderDirectory(groups) {
        if (!els.directoryList) return;
        state.directoryGroups = Array.isArray(groups) ? groups : [];
        paintDirectory(state.directoryGroups, els.convFilter ? els.convFilter.value : '');
    }

    function filterDirectoryLocal(query) {
        paintDirectory(state.directoryGroups || [], query);
    }

    function paintDirectory(groups, query) {
        if (!els.directoryList) return;
        var q = String(query || '').trim().toLowerCase();
        var filtered = (groups || []).map(function (group) {
            var users = (group.users || []).filter(function (u) {
                if (!q) return true;
                var blob = [
                    u.name || '',
                    u.position || '',
                    u.barangay_name || '',
                    u.user_type_label || ''
                ].join(' ').toLowerCase();
                return blob.indexOf(q) !== -1;
            });
            return { title: group.title, users: users };
        }).filter(function (g) { return (g.users || []).length > 0; });

        if (!filtered.length) {
            els.directoryList.innerHTML = '<div class="comms-empty"><p>No people found for this filter.</p></div>';
            return;
        }
        els.directoryList.innerHTML = filtered.map(function (group) {
            var users = group.users || [];
            if (!users.length) return '';
            return '<div class="comms-dir-group-title">' + Comms.escapeHtml(group.title || 'People') + '</div>' +
                users.map(function (u) {
                    var avatar = u.profile_image_url || Comms.defaultAvatar(u.name);
                    var online = String(u.online_status || '').toLowerCase() === 'online';
                    var meta = [u.position || u.user_type_label || '', u.barangay_name || ''].filter(Boolean).join(' · ');
                    return '<div class="comms-dir-item" role="listitem" data-user-id="' + u.id + '">' +
                        '<div class="comms-dir-avatar-wrap">' +
                        '<img class="comms-avatar" src="' + Comms.escapeHtml(avatar) + '" alt="" onerror="this.onerror=null;this.src=\'' + Comms.escapeHtml(Comms.defaultAvatar(u.name)) + '\'">' +
                        (online ? '<span class="comms-online-dot" title="Online" aria-label="Online"></span>' : '') +
                        '</div>' +
                        '<button type="button" class="comms-dir-open" data-user-id="' + u.id + '" style="border:0;background:transparent;text-align:left;padding:0;cursor:pointer;min-width:0;">' +
                        '<div class="comms-conv-name">' + Comms.escapeHtml(u.name || 'User') + '</div>' +
                        '<div class="comms-dir-meta">' + Comms.escapeHtml(meta) + '</div>' +
                        '</button>' +
                        '<div class="comms-dir-actions">' +
                        '<button type="button" class="comms-icon-btn comms-call-action-btn" data-dir-call="voice" data-user-id="' + u.id + '" aria-label="Voice call">' +
                        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>' +
                        '<span class="comms-call-action-label">Voice call</span>' +
                        '</button>' +
                        '<button type="button" class="comms-icon-btn comms-call-action-btn" data-dir-call="video" data-user-id="' + u.id + '" aria-label="Video call">' +
                        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' +
                        '<span class="comms-call-action-label">Video call</span>' +
                        '</button>' +
                        '</div></div>';
                }).join('');
        }).join('');
    }

    function openOrCallUser(userId, callType) {
        return Comms.api(routes.storeConversation, {
            method: 'POST',
            body: JSON.stringify({ user_id: Number(userId) }),
            dedupe: false
        }).then(function (data) {
            var conversation = data.conversation;
            return openConversation(conversation.id).then(function () {
                if (callType && window.CommsWebRTC) {
                    window.CommsWebRTC.startCall(conversation.id, callType, conversation);
                }
            });
        }).catch(function (err) {
            Comms.showToast(err.message || 'Unable to open conversation.', 'error');
        });
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
            state.conversations = list;
            if (Comms.writeInboxCache) Comms.writeInboxCache(state.conversations);
            renderConversations(els.convFilter ? els.convFilter.value : '');
        }).catch(function (err) {
            Comms.showToast(err.message || 'Failed to load conversations.', 'error');
        });
    }

    function hydrateFromCache() {
        var inbox = Comms.readInboxCache ? Comms.readInboxCache() : null;
        if (Array.isArray(inbox) && inbox.length) {
            state.conversations = inbox;
            renderConversations(els.convFilter ? els.convFilter.value : '');
        }
    }

    function saveMsgCache(id, messages, emojis) {
        var payload = {
            messages: messages,
            reactionEmojis: emojis,
            ts: Date.now()
        };
        state.messageCache[String(id)] = payload;
        if (Comms.writeThreadCache) Comms.writeThreadCache(id, payload);
    }

    function loadMsgCache(id) {
        if (state.messageCache[String(id)]) return state.messageCache[String(id)];
        var stored = Comms.readThreadCache ? Comms.readThreadCache(id) : null;
        if (stored) {
            state.messageCache[String(id)] = stored;
            return stored;
        }
        return null;
    }

    function applyMessages(messages, emojis, opts) {
        state.messages = messages || [];
        if (Array.isArray(emojis) && emojis.length) {
            state.reactionEmojis = emojis;
        }
        if (opts && opts.hasMore != null) {
            state.messagesHasMore = !!opts.hasMore;
        }
        renderMessages(opts);
    }

    function loadOlderMessages() {
        if (state.loadingOlder || !state.activeId || !state.messagesHasMore) return Promise.resolve();
        if (!state.messages.length || !els.messages) return Promise.resolve();
        var oldest = state.messages[0];
        var beforeId = oldest && oldest.id;
        if (!beforeId || String(beforeId).indexOf('local-') === 0) return Promise.resolve();

        state.loadingOlder = true;
        var cid = state.activeId;
        var prevHeight = els.messages.scrollHeight;
        var url = Comms.route(routes.messages, cid) + '?before_id=' + encodeURIComponent(beforeId);

        return Comms.api(url, { dedupe: true }).then(function (data) {
            if (Number(state.activeId) !== Number(cid)) return;
            var older = data.messages || [];
            var perPage = 40;
            if (!older.length) {
                state.messagesHasMore = false;
                return;
            }
            if (older.length < perPage) {
                state.messagesHasMore = false;
            }
            var existingIds = {};
            state.messages.forEach(function (m) { existingIds[String(m.id)] = true; });
            var prepend = older.filter(function (m) { return !existingIds[String(m.id)]; });
            if (!prepend.length) {
                state.messagesHasMore = false;
                return;
            }
            state.messages = prepend.concat(state.messages);
            if (Array.isArray(data.reaction_emojis) && data.reaction_emojis.length) {
                state.reactionEmojis = data.reaction_emojis;
            }
            saveMsgCache(cid, state.messages, state.reactionEmojis);
            renderMessages({ restoreScrollHeight: prevHeight });
        }).catch(function () { /* ignore */ }).finally(function () {
            state.loadingOlder = false;
        });
    }

    function stopLocalTyping() {
        if (!state.activeId || !window.CommsRealtime) return;
        if (typeof window.CommsRealtime.stopTyping === 'function') {
            window.CommsRealtime.stopTyping(state.activeId);
        } else if (typeof window.CommsRealtime.broadcastTyping === 'function') {
            window.CommsRealtime.broadcastTyping(state.activeId, { stop: true });
        }
    }

    function notifyComposerTyping(rawValue) {
        if (!state.activeId || !window.CommsRealtime || typeof window.CommsRealtime.broadcastTyping !== 'function') {
            return;
        }
        var hasText = !!String(rawValue == null ? '' : rawValue).replace(/\s/g, '');
        if (!hasText) {
            stopLocalTyping();
            return;
        }
        window.CommsRealtime.broadcastTyping(state.activeId);
    }

    function openConversation(id, opts) {
        opts = opts || {};
        if (state.activeId && Number(state.activeId) !== Number(id)) {
            stopLocalTyping();
        }
        state.activeId = Number(id);
        window.__COMMS_PAGE_ACTIVE_ID__ = state.activeId;
        state.messagesHasMore = true;
        state.loadingOlder = false;
        setThreadOpen(true);
        els.threadEmpty.hidden = true;
        els.threadActive.hidden = false;
        if (els.typing) {
            els.typing.hidden = true;
            els.typing.textContent = '';
        }
        renderConversations(els.convFilter ? els.convFilter.value : '');
        if (typeof window.syncFederationsMessagesPageHeaderBtn === 'function') {
            window.syncFederationsMessagesPageHeaderBtn();
        } else {
            var msgBtn = document.getElementById('commsMsgBtn');
            if (msgBtn && document.body.classList.contains('comms-messages-layout')) {
                msgBtn.title = 'Minimize to chat';
                msgBtn.setAttribute('aria-label', 'Minimize to chat');
            }
        }

        if (window.CommsRealtime && typeof window.CommsRealtime.subscribeConversation === 'function') {
            window.CommsRealtime.subscribeConversation(state.activeId);
        }

        // Instant header: list row → SkLocalCache → then API refresh.
        var listConv = state.conversations.find(function (c) {
            return Number(c.id) === Number(id);
        });
        if (listConv && listConv.other_user) {
            updatePeerHeader(listConv);
        } else {
            applyCachedPeerHeader(id);
        }
        if (state.activeConversation && Number(state.activeConversation.id) === Number(id)) {
            updatePeerHeader(state.activeConversation);
        }

        // Show cached messages immediately so the thread appears instantly
        var cached = loadMsgCache(id);
        if (cached && Array.isArray(cached.messages) && cached.messages.length) {
            state.messages = cached.messages;
            if (Array.isArray(cached.reactionEmojis) && cached.reactionEmojis.length) {
                state.reactionEmojis = cached.reactionEmojis;
            }
            renderMessages({ stickBottom: true });
        }

        // Load conversation header and fresh messages in parallel
        var convPromise = Comms.api(Comms.route(routes.showConversation, id));
        var msgPromise = Comms.api(Comms.route(routes.messages, id));

        convPromise.then(function (data) {
            if (!data || !data.conversation) return;
            if (Number(state.activeId) !== Number(id)) return;
            var conv = data.conversation;
            var peer = conv.other_user || {};
            // Keep a working list/cache avatar if API returns empty/broken placeholder.
            if (listConv && listConv.other_user && listConv.other_user.profile_image_url) {
                var apiAvatar = String(peer.profile_image_url || '').trim();
                if (!apiAvatar) {
                    peer.profile_image_url = listConv.other_user.profile_image_url;
                    conv.other_user = peer;
                }
            }
            state.activeConversation = conv;
            updatePeerHeader(conv);
        }).catch(function () { /* non-fatal */ });

        return msgPromise.then(function (data) {
            var freshMessages = data.messages || [];
            var freshEmojis = Array.isArray(data.reaction_emojis) ? data.reaction_emojis : [];

            // Only re-render if conversation is still active
            if (Number(state.activeId) === Number(id)) {
                state.messagesHasMore = freshMessages.length >= 40;
                applyMessages(freshMessages, freshEmojis, { stickBottom: !cached, hasMore: state.messagesHasMore });
            }

            saveMsgCache(id, freshMessages, freshEmojis);

            if (document.visibilityState === 'hidden') return null;
            window.__COMMS_INBOX_EPOCH__ = (Number(window.__COMMS_INBOX_EPOCH__) || 0) + 1;
            if (listConv) {
                listConv.unread_count = 0;
                renderConversations(els.convFilter ? els.convFilter.value : '');
            }
            return Comms.api(Comms.route(routes.read, id), { method: 'POST', body: '{}' });
        }).then(function (data) {
            if (data && typeof data.unread_count === 'number' && window.CommsRealtime && typeof window.CommsRealtime.updateHeaderBadge === 'function') {
                window.CommsRealtime.updateHeaderBadge(data.unread_count);
            } else if (window.CommsRealtime && typeof window.CommsRealtime.refreshUnread === 'function') {
                window.CommsRealtime.refreshUnread();
            }
            if (!opts.skipReloadList) {
                return loadConversations();
            }
        }).catch(function (err) {
            Comms.showToast(err.message || 'Unable to open conversation.', 'error');
        });
    }

    function appendMessage(message) {
        if (!message || Number(message.conversation_id) !== Number(state.activeId)) return;
        if (state.messages.some(function (m) { return String(m.id) === String(message.id); })) return;

        // Drop optimistic local bubbles when the real message arrives (stops stuck "Sending...").
        if (message.mine && message.id != null && String(message.id).indexOf('local-') !== 0) {
            var body = String(message.body || '');
            state.messages = state.messages.filter(function (m) {
                var id = String(m.id || '');
                if (id.indexOf('local-') !== 0) return true;
                if (body && String(m.body || '') === body) return false;
                if (!body && (message.message_type === 'image' || message.message_type === 'file')
                    && (m.message_type === 'image' || m.message_type === 'file')) {
                    return false;
                }
                return true;
            });
        }

        state.messages.push(Object.assign({}, message, message.mine ? { send_status: message.send_status || 'sent' } : {}));
        saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
        renderMessages({ stickBottom: true });
    }

    function reloadActiveMessages() {
        if (!state.activeId) return Promise.resolve();
        var cid = state.activeId;
        return Comms.api(Comms.route(routes.messages, cid)).then(function (data) {
            var msgs = data.messages || [];
            var emojis = Array.isArray(data.reaction_emojis) ? data.reaction_emojis : [];
            saveMsgCache(cid, msgs, emojis);
            if (Number(state.activeId) === Number(cid)) {
                applyMessages(msgs, emojis, { stickBottom: true });
            }
            loadConversations();
        }).catch(function () { /* ignore */ });
    }

    function resizeComposer() {
        if (!els.input) return;
        if (Comms.resizeGrowTextarea) {
            Comms.resizeGrowTextarea(els.input, 4, 1);
        } else {
            els.input.style.height = 'auto';
            var next = Math.min(Math.max(els.input.scrollHeight, 72), 180);
            els.input.style.height = next + 'px';
        }
    }

    function publishSentMessage(sent, extraPeers) {
        if (!sent || !window.CommsRealtime || typeof window.CommsRealtime.broadcastMessage !== 'function') return;
        var conv = state.activeConversation;
        var peer = conv && conv.other_user;
        var peers = Array.isArray(extraPeers) ? extraPeers : [];
        if (!peers.length && conv && Array.isArray(conv.members)) peers = conv.members;
        window.CommsRealtime.broadcastMessage(sent.conversation_id || state.activeId, sent, {
            peerId: peer && !peer.is_group ? (peer.id || peer.user_id) : null,
            peerType: peer && !peer.is_group ? (peer.user_type || peer.type || peer.portal_user_type) : null,
            peers: peers
        });
    }

    function sendMessage(body) {
        if (!state.activeId) return;
        var files = (state.pendingAttachments || []).slice();
        var text = normalizeMessageBody(body);
        text = clampMessageToMaxLines(text);
        if (text.trim() === '' && !files.length) {
            if (String(body || '').length > 0) {
                Comms.showToast('Message cannot be only spaces.', 'error');
            }
            return;
        }
        if (text.trim() !== '') {
            var validated = validateMessageBody(text);
            if (validated == null) return;
            text = validated;
        } else {
            text = '';
        }
        if (state.sendInFlight && files.length) return;

        stopLocalTyping();
        els.input.value = '';
        resizeComposer();
        var previewUrls = (state.pendingPreviewUrls || []).slice();
        // Keep blob URLs for optimistic bubbles; clearPendingAttachment would revoke them.
        state.pendingPreviewUrls = [];
        clearPendingAttachment();
        syncComposerEndControls();

        var tempId = 'local-' + Date.now();
        if (text) {
            appendMessage({
                id: tempId,
                conversation_id: state.activeId,
                body: text,
                message_type: 'text',
                mine: true,
                send_status: 'sending',
                created_at: new Date().toISOString(),
                reactions: [],
                attachments: []
            });
        }

        var jobs = [];
        if (text) {
            jobs.push(Comms.api(Comms.route(routes.messages, state.activeId), {
                method: 'POST',
                body: JSON.stringify({ body: text }),
                dedupe: false
            }).then(function (data) {
                if (!data || !data.message) return;
                var sent = Object.assign({}, data.message, { send_status: 'sent', mine: true, _sentAt: Date.now() });
                publishSentMessage(sent);
                var realIdx = state.messages.findIndex(function (m) { return Number(m.id) === Number(sent.id); });
                var tempIdx = state.messages.findIndex(function (m) { return String(m.id) === tempId; });
                if (realIdx !== -1 && tempIdx !== -1) {
                    state.messages[realIdx] = Object.assign({}, state.messages[realIdx], { send_status: 'sent', mine: true, _sentAt: Date.now() });
                    state.messages.splice(tempIdx, 1);
                } else if (tempIdx !== -1) {
                    state.messages[tempIdx] = sent;
                } else {
                    appendMessage(sent);
                    return;
                }
                saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
                renderMessages({ stickBottom: true });
                window.setTimeout(function () { renderMessages({ stickBottom: false, preserveScroll: true }); }, 2600);
            }));
        }

        if (files.length) {
            state.sendInFlight = true;
            if (els.sendBtn) els.sendBtn.disabled = true;
            if (els.attachBtn) els.attachBtn.disabled = true;
            setUploadProgress(20, false);
            files.forEach(function (file, i) {
                var fileTempId = 'local-att-' + Date.now() + '-' + i;
                var isImage = isImageFile(file);
                var blobUrl = previewUrls[i] || (isImage ? URL.createObjectURL(file) : null);
                appendMessage({
                    id: fileTempId,
                    conversation_id: state.activeId,
                    body: '',
                    message_type: isImage ? 'image' : 'file',
                    mine: true,
                    send_status: 'sending',
                    created_at: new Date().toISOString(),
                    reactions: [],
                    attachments: [{
                        id: 0,
                        file_name: file.name,
                        file_type: isImage ? 'image' : 'file',
                        mime_type: file.type || null,
                        file_size: file.size || null,
                        storage_provider: 'local',
                        url: blobUrl,
                        download_url: blobUrl || '#'
                    }]
                });
                var form = new FormData();
                form.append('attachment', file, file.name);
                jobs.push(Comms.api(Comms.route(routes.messages, state.activeId), {
                    method: 'POST',
                    body: form,
                    dedupe: false
                }).then(function (data) {
                    setUploadProgress(100, false);
                    if (!data || !data.message) return;
                    var sent = Object.assign({}, data.message, { send_status: 'sent', mine: true });
                    publishSentMessage(sent);
                    var realIdx = state.messages.findIndex(function (m) { return Number(m.id) === Number(sent.id); });
                    var tempIdx = state.messages.findIndex(function (m) { return String(m.id) === fileTempId; });
                    if (tempIdx !== -1) {
                        var prevAtt = state.messages[tempIdx].attachments || [];
                        prevAtt.forEach(function (a) {
                            if (a && a.url && String(a.url).indexOf('blob:') === 0) {
                                try { URL.revokeObjectURL(a.url); } catch (e) { /* ignore */ }
                            }
                        });
                    }
                    if (realIdx !== -1 && tempIdx !== -1) {
                        state.messages[realIdx] = Object.assign({}, state.messages[realIdx], { send_status: 'sent', mine: true });
                        state.messages.splice(tempIdx, 1);
                    } else if (tempIdx !== -1) {
                        state.messages[tempIdx] = sent;
                    } else {
                        appendMessage(sent);
                        return;
                    }
                    saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
                    renderMessages({ stickBottom: true });
                }));
            });
        }

        // Don't block the UI on slow inbox reloads — mark send done as soon as POSTs finish.
        Promise.all(jobs).then(function () {
            loadConversations();
        }).catch(function (err) {
            state.messages.forEach(function (m) {
                var id = String(m.id || '');
                if (id === tempId || id.indexOf('local-att-') === 0) {
                    m.send_status = 'failed';
                }
            });
            renderMessages({ stickBottom: true });
            Comms.showToast(err.message || 'Failed to send message.', 'error');
        }).finally(function () {
            state.sendInFlight = false;
            if (els.sendBtn) els.sendBtn.disabled = false;
            if (els.attachBtn) els.attachBtn.disabled = false;
            window.setTimeout(function () { setUploadProgress(0, true); }, 400);
            syncComposerEndControls();
            if (els.input) els.input.focus();
        });

        // Safety: never leave "Sending..." forever if the request hangs.
        window.setTimeout(function () {
            var stuck = false;
            state.messages.forEach(function (m) {
                if (String(m.id) === tempId && m.send_status === 'sending') {
                    m.send_status = 'failed';
                    stuck = true;
                }
            });
            if (stuck) renderMessages({ stickBottom: false, preserveScroll: true });
        }, 20000);
    }

    function startConversationWithUser(userId) {
        return Comms.api(routes.storeConversation, {
            method: 'POST',
            body: JSON.stringify({ user_id: Number(userId) }),
            dedupe: false
        }).then(function (data) {
            if (els.searchResults) els.searchResults.hidden = true;
            if (els.convFilter) els.convFilter.value = '';
            return loadConversations().then(function () {
                return openConversation(data.conversation.id);
            });
        }).catch(function (err) {
            Comms.showToast(err.message || 'Unable to start conversation.', 'error');
        });
    }

    function searchUsers(q) {
        if (!els.searchResults) return;
        if (!q || q.length < 1) {
            els.searchResults.hidden = true;
            els.searchResults.innerHTML = '';
            return;
        }
        Comms.api(routes.searchUsers + '?q=' + encodeURIComponent(q)).then(function (data) {
            var users = data.users || [];
            if (!users.length) {
                els.searchResults.innerHTML = '<div class="comms-search-item"><span>No users found</span></div>';
                els.searchResults.hidden = false;
                return;
            }
            els.searchResults.innerHTML = users.map(function (u) {
                return '<button type="button" class="comms-search-item" data-user-id="' + u.id + '">' +
                    '<strong>' + Comms.escapeHtml(u.name) + '</strong>' +
                    '<span>' + Comms.escapeHtml(u.user_type_label || u.role) + '</span></button>';
            }).join('');
            els.searchResults.hidden = false;
        }).catch(function (err) {
            Comms.showToast(err.message || 'Search failed.', 'error');
        });
    }

    var markAllBtn = document.getElementById('commsMarkAllRead');
    var markAllBusy = false;
    if (markAllBtn) {
        markAllBtn.addEventListener('click', function () {
            if (markAllBusy || !routes.markAllRead) return;
            var label = markAllBtn.querySelector('.comms-mark-all-read-label');
            markAllBusy = true;
            markAllBtn.disabled = true;
            markAllBtn.setAttribute('aria-busy', 'true');
            if (label) label.textContent = 'Marking...';
            window.__COMMS_INBOX_EPOCH__ = (Number(window.__COMMS_INBOX_EPOCH__) || 0) + 1;
            Comms.api(routes.markAllRead, { method: 'POST', body: '{}', dedupe: true }).then(function (data) {
                (state.conversations || []).forEach(function (c) { c.unread_count = 0; });
                if (Comms.writeInboxCache) Comms.writeInboxCache(state.conversations);
                renderConversations(els.convFilter ? els.convFilter.value : '');
                if (data && typeof data.unread_count === 'number' && window.CommsRealtime && typeof window.CommsRealtime.updateHeaderBadge === 'function') {
                    window.CommsRealtime.updateHeaderBadge(data.unread_count);
                }
                return loadConversations();
            }).catch(function (err) {
                Comms.showToast((err && err.message) || 'Could not mark messages as read. Please try again.', 'error');
                loadConversations();
                if (window.CommsRealtime && typeof window.CommsRealtime.refreshUnread === 'function') {
                    window.CommsRealtime.refreshUnread();
                }
            }).finally(function () {
                markAllBusy = false;
                markAllBtn.disabled = false;
                markAllBtn.removeAttribute('aria-busy');
                if (label) label.textContent = 'Mark All as Read';
            });
        });
    }

    els.convList.addEventListener('click', function (e) {
        var btn = e.target.closest('.comms-conv-item');
        if (!btn) return;
        // Instant header paint from list row while API loads.
        if (btn.dataset.peerName) {
            updatePeerHeader({
                id: btn.dataset.id,
                other_user: {
                    name: btn.dataset.peerName,
                    profile_image_url: btn.dataset.peerAvatar || '',
                    online_status: btn.dataset.peerStatus || 'offline'
                }
            });
        }
        openConversation(btn.dataset.id);
    });

    if (els.messages) {
        els.messages.addEventListener('click', function (e) {
            var peopleBtn = e.target.closest('[data-react-people]');
            if (peopleBtn) {
                e.preventDefault();
                e.stopPropagation();
                var pid = Number(peopleBtn.getAttribute('data-react-people'));
                var pmsg = state.messages.find(function (m) { return Number(m.id) === pid; });
                var emojiEl = e.target.closest('[data-react-people-emoji]');
                var filterEmoji = emojiEl ? (emojiEl.getAttribute('data-react-people-emoji') || '') : '';
                if (Comms.openReactionModal) {
                    Comms.openReactionModal(pmsg ? pmsg.reactions : [], filterEmoji);
                } else if (Comms.toggleReactionPeople) {
                    Comms.toggleReactionPeople(peopleBtn, pmsg ? pmsg.reactions : [], {
                        pinned: true,
                        emoji: filterEmoji
                    });
                }
                return;
            }
            var toggle = e.target.closest('[data-react-toggle]');
            if (toggle) {
                e.preventDefault();
                e.stopPropagation();
                var tid = Number(toggle.getAttribute('data-react-toggle'));
                if (Number(state.openReactionPickerId) === tid) {
                    closeReactionPickersDom();
                } else {
                    openReactionPickerInPlace(tid, toggle);
                }
                return;
            }
            var emojiBtn = e.target.closest('[data-react-emoji]');
            if (emojiBtn && !emojiBtn.closest('.comms-reaction-picker')) {
                e.preventDefault();
                e.stopPropagation();
                var wrap = emojiBtn.closest('.comms-bubble-wrap');
                var mid = wrap ? Number(wrap.getAttribute('data-id')) : 0;
                var emoji = emojiBtn.getAttribute('data-react-emoji');
                if (mid && emoji) toggleReaction(mid, emoji);
                return;
            }
            var editBtn = e.target.closest('[data-msg-edit]');
            if (editBtn) {
                e.preventDefault();
                closeMessageMenus();
                state.editingId = Number(editBtn.getAttribute('data-msg-edit'));
                renderMessages({ preserveScroll: true });
                var editor = els.messages.querySelector('[data-edit-input="' + state.editingId + '"]');
                if (editor && !editor.dataset.limitWired) {
                    editor.removeAttribute('maxlength');
                    editor.addEventListener('keydown', function (ev) {
                        var current = normalizeMessageBody(editor.value || '');
                        if (ev.key === 'Enter' && !(ev.ctrlKey || ev.metaKey)) {
                            if (messageCharCount(current + '\n') > state.messageMaxLength) {
                                ev.preventDefault();
                                toastMessageCharLimit();
                            }
                            return;
                        }
                        if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                            if (messageCharCount(current + ev.key) > state.messageMaxLength) {
                                ev.preventDefault();
                                toastMessageCharLimit();
                            }
                        }
                    });
                    editor.addEventListener('paste', function (ev) {
                        var paste = (ev.clipboardData || window.clipboardData);
                        if (!paste) return;
                        var incoming = paste.getData('text');
                        if (incoming == null) return;
                        ev.preventDefault();
                        var start = editor.selectionStart || 0;
                        var end = editor.selectionEnd || 0;
                        var value = editor.value || '';
                        var raw = value.slice(0, start) + incoming + value.slice(end);
                        var next = clampMessageToMaxChars(raw);
                        editor.value = next;
                        if (next !== normalizeMessageBody(raw)) toastMessageCharLimit();
                        if (Comms.resizeGrowTextarea) {
                            Comms.resizeGrowTextarea(editor, 6, 2);
                        }
                    });
                    editor.addEventListener('input', function () {
                        var next = clampMessageToMaxChars(editor.value || '');
                        if (next !== normalizeMessageBody(editor.value || '')) {
                            editor.value = next;
                            toastMessageCharLimit();
                        }
                        if (countMessageLines(editor.value) > messageMaxLines()) {
                            editor.value = clampMessageToMaxLines(editor.value);
                            Comms.showToast('Message cannot exceed ' + messageMaxLines() + ' lines.', 'error');
                        }
                        if (Comms.resizeGrowTextarea) {
                            Comms.resizeGrowTextarea(editor, 6, 2);
                        }
                    });
                    editor.dataset.limitWired = '1';
                }
                if (editor) {
                    editor.focus();
                }
                return;
            }
            var saveBtn = e.target.closest('[data-edit-save]');
            if (saveBtn) {
                e.preventDefault();
                saveEditedMessage(Number(saveBtn.getAttribute('data-edit-save')));
                return;
            }
            var cancelBtn = e.target.closest('[data-edit-cancel]');
            if (cancelBtn) {
                e.preventDefault();
                state.editingId = null;
                renderMessages({ preserveScroll: true });
                return;
            }
            var deleteChoice = e.target.closest('[data-msg-delete]');
            if (deleteChoice) {
                e.preventDefault();
                closeMessageMenus();
                openDeletePrompt(Number(deleteChoice.getAttribute('data-msg-delete')));
                return;
            }
            var moreBtn = e.target.closest('[data-msg-more]');
            if (moreBtn) {
                e.preventDefault();
                e.stopPropagation();
                var wrapMore = moreBtn.closest('.comms-bubble-wrap');
                var menu = wrapMore ? wrapMore.querySelector('[data-msg-menu]') : null;
                var opening = menu && menu.hidden;
                closeMessageMenus();
                if (opening && menu) {
                    menu.hidden = false;
                    moreBtn.setAttribute('aria-expanded', 'true');
                    if (wrapMore) wrapMore.classList.add('is-menu-open');
                }
            }
        });
        els.messages.addEventListener('pointerover', function (e) {
            var peopleBtn = e.target.closest('[data-react-people]');
            if (!peopleBtn || !els.messages.contains(peopleBtn)) return;
            var pid = Number(peopleBtn.getAttribute('data-react-people'));
            var pmsg = state.messages.find(function (m) { return Number(m.id) === pid; });
            var emojiEl = e.target.closest('[data-react-people-emoji]');
            if (Comms.showReactionPeople) {
                Comms.showReactionPeople(peopleBtn, pmsg ? pmsg.reactions : [], {
                    pinned: false,
                    emoji: emojiEl ? (emojiEl.getAttribute('data-react-people-emoji') || '') : ''
                });
            }
        });
        els.messages.addEventListener('pointerout', function (e) {
            var peopleBtn = e.target.closest('[data-react-people]');
            if (!peopleBtn) return;
            var related = e.relatedTarget;
            if (related && (peopleBtn.contains(related) || (related.closest && related.closest('#commsReactionPeople')))) {
                return;
            }
            if (Comms.scheduleHideReactionPeople) Comms.scheduleHideReactionPeople();
        });
    }
    pickerEl.addEventListener('click', function (e) {
        var emojiBtn = e.target.closest('[data-react-emoji]');
        if (!emojiBtn) return;
        e.preventDefault();
        e.stopPropagation();
        var mid = Number(state.openReactionPickerId);
        var emoji = emojiBtn.getAttribute('data-react-emoji');
        if (mid && emoji) {
            toggleReaction(mid, emoji);
        }
        closeReactionPickersDom();
    });

    document.addEventListener('click', function (e) {
        if (els.messages && !e.target.closest('[data-msg-more]') && !e.target.closest('[data-msg-menu]')) {
            closeMessageMenus();
        }
        if (!state.openReactionPickerId) return;
        if (e.target.closest('.comms-reaction-picker') || e.target.closest('[data-react-toggle]')) return;
        closeReactionPickersDom();
    });

    // Reposition picker on scroll/resize so it tracks the button
    if (els.messages) {
        els.messages.addEventListener('scroll', function () {
            if (state.openReactionPickerId) { hideGlobalPicker(); }
            closeMessageMenus();
            syncScrollBottomBtn();
            if (els.messages.scrollTop <= 48) {
                loadOlderMessages();
            }
        }, { passive: true });
    }
    if (els.scrollBottom) {
        els.scrollBottom.addEventListener('click', function (e) {
            e.preventDefault();
            jumpToLatestMessages();
        });
    }
    window.addEventListener('resize', function () {
        if (state.openReactionPickerId) { hideGlobalPicker(); }
        syncScrollBottomBtn();
    }, { passive: true });

    if (els.directoryList) {
        els.directoryList.addEventListener('click', function (e) {
            var callBtn = e.target.closest('[data-dir-call]');
            if (callBtn) {
                openOrCallUser(callBtn.dataset.userId, callBtn.dataset.dirCall);
                return;
            }
            var openBtn = e.target.closest('[data-user-id]');
            if (openBtn) {
                openOrCallUser(openBtn.dataset.userId, null);
            }
        });
    }

    if (els.filterBar) {
        els.filterBar.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-filter]');
            if (!btn) return;
            els.filterBar.querySelectorAll('.comms-filter-btn').forEach(function (el) {
                el.classList.toggle('is-active', el === btn);
            });
            var filter = btn.dataset.filter;
            if (filter === 'conversations') {
                setListMode('conversations');
                loadConversations();
                return;
            }
            state.directoryFilter = filter;
            setListMode(filter);
            loadDirectory();
        });
    }

    if (els.barangayFilter) {
        els.barangayFilter.addEventListener('change', function () {
            state.barangayId = els.barangayFilter.value || '';
            if (state.listMode !== 'conversations') {
                loadDirectory();
            }
        });
    }

    if (els.searchResults) {
        els.searchResults.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-user-id]');
            if (!btn) return;
            startConversationWithUser(btn.dataset.userId);
        });
    }

    if (els.convFilter) {
        els.convFilter.addEventListener('input', function () {
            clearTimeout(state.filterTimer);
            clearTimeout(state.searchTimer);
            var q = els.convFilter.value.trim();
            state.filterTimer = setTimeout(function () {
                if (state.listMode === 'conversations') {
                    renderConversations(q);
                } else {
                    filterDirectoryLocal(q);
                }
            }, 120);
            state.searchTimer = setTimeout(function () {
                searchUsers(q);
            }, 250);
        });
    }

    els.composer.addEventListener('submit', function (e) {
        e.preventDefault();
        sendMessage(els.input.value);
    });

    if (els.attachBtn && els.attachMenu && els.photoInput && els.fileInput) {
        els.attachMenu.hidden = true;
        els.attachBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            els.attachMenu.hidden = !els.attachMenu.hidden;
        });
        if (els.pickCameraBtn) {
            els.pickCameraBtn.addEventListener('click', function () {
                els.attachMenu.hidden = true;
                var isPhone = window.matchMedia('(max-width: 768px)').matches;
                if (!isPhone) {
                    if (window.CommsLiveCamera && typeof window.CommsLiveCamera.close === 'function') {
                        window.CommsLiveCamera.close();
                    }
                    if (els.photoInput) {
                        els.photoInput.click();
                        return;
                    }
                }
                if (window.CommsLiveCamera && typeof window.CommsLiveCamera.open === 'function') {
                    var pendingImg = (state.pendingAttachments || []).filter(function (f) { return isImageFile(f); }).length;
                    if (pendingImg >= (state.maxImageCount || 3)) {
                        Comms.showToast('Max 3 images per upload. Selection was not added.', 'error');
                        return;
                    }
                    window.CommsLiveCamera.open(function (file) {
                        if (file) pushPendingFiles([file], 'image');
                    });
                    return;
                }
                if (els.cameraInput) {
                    if (!isPhone) els.cameraInput.removeAttribute('capture');
                    els.cameraInput.click();
                }
            });
        }
        if (els.pickPhotosBtn) {
            els.pickPhotosBtn.addEventListener('click', function () {
                els.attachMenu.hidden = true;
                if (window.CommsLiveCamera && typeof window.CommsLiveCamera.close === 'function') {
                    window.CommsLiveCamera.close();
                }
                els.photoInput.click();
            });
        }
        if (els.pickFilesBtn) {
            els.pickFilesBtn.addEventListener('click', function () {
                els.attachMenu.hidden = true;
                els.fileInput.click();
            });
        }
        if (els.cameraInput) {
            els.cameraInput.addEventListener('change', function () {
                pushPendingFiles(els.cameraInput.files, 'image');
                els.cameraInput.value = '';
            });
        }
        els.photoInput.addEventListener('change', function () {
            pushPendingFiles(els.photoInput.files, 'image');
            els.photoInput.value = '';
        });
        els.fileInput.addEventListener('change', function () {
            pushPendingFiles(els.fileInput.files, 'file');
            els.fileInput.value = '';
        });
    }
    if (els.attachClear) {
        els.attachClear.addEventListener('click', function () {
            clearPendingAttachment();
        });
    }

    els.input.addEventListener('input', function () {
        var next = clampMessageToMaxChars(els.input.value || '');
        if (next !== normalizeMessageBody(els.input.value || '')) {
            els.input.value = next;
            toastMessageCharLimit();
        }
        if (countMessageLines(els.input.value) > messageMaxLines()) {
            els.input.value = clampMessageToMaxLines(els.input.value);
            Comms.showToast('Message cannot exceed ' + messageMaxLines() + ' lines.', 'error');
        }
        els.input.classList.toggle('is-line-limit', countMessageLines(els.input.value) >= messageMaxLines());
        resizeComposer();
        syncComposerEndControls();
        notifyComposerTyping(els.input.value);
    });

    els.input.addEventListener('paste', function (e) {
        var paste = (e.clipboardData || window.clipboardData);
        if (!paste) return;
        var incoming = paste.getData('text');
        if (incoming == null) return;
        e.preventDefault();
        var start = els.input.selectionStart || 0;
        var end = els.input.selectionEnd || 0;
        var value = els.input.value || '';
        var raw = value.slice(0, start) + incoming + value.slice(end);
        var next = clampMessageToMaxChars(clampMessageToMaxLines(raw));
        els.input.value = next;
        if (next !== normalizeMessageBody(raw)) {
            toastMessageCharLimit();
        }
        els.input.classList.toggle('is-line-limit', countMessageLines(els.input.value) >= messageMaxLines());
        resizeComposer();
        syncComposerEndControls();
        notifyComposerTyping(els.input.value);
    });

    els.input.addEventListener('keydown', function (e) {
        // Enter = new line only. Ctrl/Cmd+Enter sends.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendMessage(els.input.value);
            return;
        }
        var current = normalizeMessageBody(els.input.value || '');
        if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
            if (messageCharCount(current + '\n') > state.messageMaxLength) {
                e.preventDefault();
                toastMessageCharLimit();
            }
            return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (messageCharCount(current + e.key) > state.messageMaxLength) {
                e.preventDefault();
                toastMessageCharLimit();
            }
        }
    });

    els.backBtn.addEventListener('click', function () {
        stopLocalTyping();
        setThreadOpen(false);
        state.activeId = null;
        window.__COMMS_PAGE_ACTIVE_ID__ = null;
        if (els.typing) {
            els.typing.hidden = true;
            els.typing.textContent = '';
        }
        els.threadActive.hidden = true;
        els.threadEmpty.hidden = false;
        renderConversations(els.convFilter.value);
    });

    els.voiceBtn.addEventListener('click', function () {
        beginGroupOrDirectCall('voice');
    });

    els.videoBtn.addEventListener('click', function () {
        beginGroupOrDirectCall('video');
    });

    if (els.threadMenuBtn) {
        els.threadMenuBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!els.threadMenu) return;
            var open = els.threadMenu.hidden;
            els.threadMenu.hidden = !open;
            els.threadMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }
    if (els.renameGroupBtn) {
        els.renameGroupBtn.addEventListener('click', function () {
            closeGroupModals();
            if (!state.activeConversation || !state.activeConversation.can_rename || !els.renameModal) return;
            if (els.renameInput) {
                els.renameInput.value = state.activeConversation.name
                    || (state.activeConversation.other_user && state.activeConversation.other_user.name)
                    || '';
            }
            els.renameModal.hidden = false;
            if (els.renameInput) els.renameInput.focus();
        });
    }
    if (els.changeGroupPhotoBtn && els.groupAvatarInput) {
        els.changeGroupPhotoBtn.addEventListener('click', function () {
            closeGroupModals();
            if (!state.activeConversation || !state.activeConversation.can_change_avatar) return;
            els.groupAvatarInput.value = '';
            els.groupAvatarInput.click();
        });
        els.groupAvatarInput.addEventListener('change', function () {
            var file = els.groupAvatarInput.files && els.groupAvatarInput.files[0];
            if (!file || !state.activeId || !routes.conversationAvatar) return;
            if (file.size > 10 * 1024 * 1024) {
                Comms.showToast('Group photo must be 10 MB or smaller.', 'error');
                return;
            }
            var fd = new FormData();
            fd.append('avatar', file);
            Comms.showToast('Uploading group photo…', 'info');
            fetch(Comms.route(routes.conversationAvatar, state.activeId), {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: fd
            })
                .then(function (r) {
                    return r.json().then(function (data) {
                        if (!r.ok) throw new Error((data && (data.message || (data.errors && data.errors.avatar && data.errors.avatar[0]))) || 'Upload failed.');
                        return data;
                    });
                })
                .then(function (data) {
                    if (data && data.conversation) {
                        state.activeConversation = data.conversation;
                        updatePeerHeader(data.conversation);
                        loadConversations();
                    }
                    Comms.showToast('Group photo updated.', 'success');
                })
                .catch(function (err) {
                    Comms.showToast(err.message || 'Unable to update group photo.', 'error');
                })
                .finally(function () {
                    els.groupAvatarInput.value = '';
                });
        });
    }
    if (els.viewMembersBtn) {
        els.viewMembersBtn.addEventListener('click', function () {
            closeGroupModals();
            openGroupInfoModal('members');
        });
    }
    if (els.groupInfoBtn) {
        els.groupInfoBtn.addEventListener('click', function () {
            closeGroupModals();
            openGroupInfoModal('info');
        });
    }
    if (els.renameForm) {
        els.renameForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!state.activeId || !routes.renameConversation || !els.renameInput) return;
            if (els.renameSubmit && els.renameSubmit.disabled) return;
            var name = String(els.renameInput.value || '').trim();
            if (!name) {
                Comms.showToast('Group name is required.', 'error');
                return;
            }
            if (els.renameSubmit) {
                els.renameSubmit.disabled = true;
                els.renameSubmit.textContent = 'Saving...';
            }
            if (els.renameInput) els.renameInput.disabled = true;
            Comms.api(Comms.route(routes.renameConversation, state.activeId), {
                method: 'PATCH',
                body: JSON.stringify({ name: name }),
                dedupe: false
            }).then(function (data) {
                if (data && data.conversation) {
                    state.activeConversation = data.conversation;
                    updatePeerHeader(data.conversation);
                    loadConversations();
                }
                closeGroupModals();
                Comms.showToast('Group renamed.', 'success');
            }).catch(function (err) {
                Comms.showToast(err.message || 'Unable to rename group.', 'error');
            }).finally(function () {
                if (els.renameSubmit) {
                    els.renameSubmit.disabled = false;
                    els.renameSubmit.textContent = 'Save';
                }
                if (els.renameInput) els.renameInput.disabled = false;
            });
        });
    }
    document.querySelectorAll('[data-comms-group-close]').forEach(function (el) {
        el.addEventListener('click', closeGroupModals);
    });
    document.querySelectorAll('[data-comms-rename-close]').forEach(function (el) {
        el.addEventListener('click', closeGroupModals);
    });
    if (els.groupModalBody) {
        els.groupModalBody.addEventListener('click', function (e) {
            var btn = e.target.closest('.comms-group-call-btn');
            if (!btn || !state.activeId || !window.CommsWebRTC) return;
            var uid = Number(btn.getAttribute('data-user-id') || 0);
            var callType = btn.getAttribute('data-call-type') || 'voice';
            if (!uid) return;
            closeGroupModals();
            window.CommsWebRTC.startCall(state.activeId, callType, state.activeConversation, uid);
        });
    }

    document.addEventListener('click', function (e) {
        if (els.searchResults && !els.searchResults.contains(e.target) && e.target !== els.convFilter) {
            els.searchResults.hidden = true;
        }
        if (els.attachMenu && !els.attachMenu.hidden && !e.target.closest('.comms-attach-menu-wrap')) {
            els.attachMenu.hidden = true;
        }
        if (els.threadMenu && !els.threadMenu.hidden && !e.target.closest('.comms-thread-menu-wrap')) {
            els.threadMenu.hidden = true;
            if (els.threadMenuBtn) els.threadMenuBtn.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('click', function (e) {
        var joinBtn = e.target.closest('[data-join-group-call]');
        if (!joinBtn || !window.CommsWebRTC || typeof window.CommsWebRTC.joinActiveGroupCall !== 'function') return;
        e.preventDefault();
        window.CommsWebRTC.joinActiveGroupCall(joinBtn.getAttribute('data-join-group-call') || state.activeId);
    });

    window.CommsChat = {
        appendMessage: appendMessage,
        publishSentMessage: publishSentMessage,
        reloadConversations: loadConversations,
        reloadActiveMessages: reloadActiveMessages,
        onReactionChange: onReactionChange,
        onMessageChange: function (row) {
            if (!row || !state.activeId || Number(row.conversation_id) !== Number(state.activeId)) return;
            var idx = state.messages.findIndex(function (m) { return String(m.id) === String(row.id); });
            if (idx === -1) return;
            var skipToast = !!state.msgChangeSkipToast[String(row.id)];
            if (row.deleted_for_all_at) {
                state.messages[idx].deleted_for_all = true;
                state.messages[idx].message_type = 'deleted';
                state.messages[idx].body = null;
                state.messages[idx].attachments = [];
                state.messages[idx].reactions = [];
                if (!skipToast) Comms.showToast('Message deleted.', 'info');
            } else if (row.body != null) {
                var prevBody = state.messages[idx].body;
                state.messages[idx].body = row.body;
                state.messages[idx].edited = true;
                if (!skipToast && String(prevBody || '') !== String(row.body || '')) {
                    Comms.showToast('Message edited.', 'info');
                }
            }
            saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
            renderMessages({ preserveScroll: true });
        },
        getActiveId: function () {
            return state.activeId || window.__COMMS_HEADER_ACTIVE_ID__ || null;
        },
        getActiveConversationMeta: function () {
            if (!state.activeId) return null;
            var peer = state.activeConversation && state.activeConversation.other_user
                ? state.activeConversation.other_user
                : null;
            var nameEl = document.getElementById('commsPeerName');
            var avatarEl = document.getElementById('commsPeerAvatar');
            return {
                id: Number(state.activeId),
                name: (peer && peer.name) || (nameEl ? String(nameEl.textContent || '').trim() : '') || 'Chat',
                avatar: (peer && peer.profile_image_url) || (avatarEl ? avatarEl.getAttribute('src') : '') || ''
            };
        },
        setTyping: function (visible, meta) {
            if (!els.typing) return;
            if (window.Comms && typeof window.Comms.paintTypingEl === 'function') {
                window.Comms.paintTypingEl(els.typing, !!visible, meta || null);
                return;
            }
            if (!visible) {
                els.typing.hidden = true;
                els.typing.textContent = '';
                return;
            }
            var who = meta && meta.name ? String(meta.name).trim() : '';
            els.typing.textContent = who ? (who + ' is typing...') : 'Typing...';
            els.typing.hidden = false;
        },
        updatePeerOnlineFromPresence: updatePeerOnlineFromPresence,
        refreshActivePeerProfile: refreshActivePeerProfile,
        routes: routes,
        state: state
    };

    if (els.attachMenu) els.attachMenu.hidden = true;
    if (els.attachPreview) els.attachPreview.hidden = true;

    startPeerProfileRealtime();
    syncComposerEndControls();
    resizeComposer();

    hydrateFromCache();
    loadConversations().then(function () {
        var initial = root.dataset.initialConversation;
        if (initial) openConversation(initial);
    });
})();

