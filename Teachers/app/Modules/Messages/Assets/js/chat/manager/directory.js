/**
 * Chat manager — directory
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;

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
        return api.openConversation(conversation.id).then(function () {
            if (callType) {
                ctx.withWebrtc(function (api) {
                    api.startCall(conversation.id, callType, conversation);
                });
            }
        });
    }).catch(function (err) {
        Comms.showToast(err.message || 'Unable to open conversation.', 'error');
    });
}


    Object.assign(api, {
        filterDirectoryLocal: filterDirectoryLocal,
        loadDirectory: loadDirectory,
        openOrCallUser: openOrCallUser,
        paintDirectory: paintDirectory,
        renderDirectory: renderDirectory,
        setListMode: setListMode
    });
}
