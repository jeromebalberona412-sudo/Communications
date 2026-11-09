/**
 * Chat manager — teachers
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.teachersState !== undefined) var teachersState = ctx.teachersState;
    if (ctx.teachersEls !== undefined) var teachersEls = ctx.teachersEls;

// TEACHERS LIST FEATURE
// =========================================================================

var teachersState = {
    teachers: [],
    loading: false,
    searchTimer: null
};

var teachersEls = {
    conversationsTab: document.getElementById('commsConversationsTab'),
    teachersTab: document.getElementById('commsTeachersTab'),
    teachersList: document.getElementById('commsTeachersList'),
    teachersSearch: document.getElementById('commsTeachersSearch'),
    teachersSearchWrap: document.getElementById('commsTeachersSearchWrap'),
    teachersEmpty: document.getElementById('commsTeachersEmpty')
};

function membersUiCacheKey(kind) {
    return 'comms.ui.members.' + String(state.currentUserId || 0) + '.' + kind;
}

function readMembersUiCache(kind) {
    try {
        var parsed = JSON.parse(sessionStorage.getItem(membersUiCacheKey(kind)) || 'null');
        if (parsed && Number(parsed.userId) === Number(state.currentUserId) && Array.isArray(parsed.items)) {
            return parsed.items;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function writeMembersUiCache(kind, items) {
    try {
        sessionStorage.setItem(membersUiCacheKey(kind), JSON.stringify({
            userId: Number(state.currentUserId || 0),
            items: items,
            ts: Date.now()
        }));
    } catch (e2) { /* ignore */ }
}

function isLivePresenceOnline(userId, portal) {
    var map = window.__COMMS_PRESENCE_ONLINE_IDS__ || {};
    var id = Number(userId || 0);
    if (!id) return false;
    var typed = String(portal || '').toLowerCase() + ':' + id;
    if (typed && map[typed]) return true;
    return false;
}

function memberActionButtonsHtml(userId) {
    return '<div class="comms-member-actions">' +
        '<button type="button" class="comms-member-action" data-member-act="message" data-user-id="' + Number(userId) + '">Message</button>' +
        '<button type="button" class="comms-member-action" data-member-act="voice" data-user-id="' + Number(userId) + '">Voice Call</button>' +
        '<button type="button" class="comms-member-action" data-member-act="video" data-user-id="' + Number(userId) + '">Video Call</button>' +
        '</div>';
}

function handleMemberListAction(userId, act) {
    if (act === 'voice' || act === 'video') {
        return api.openOrCallUser(userId, act);
    }
    return api.openOrCallUser(userId, null);
}

function loadTeachersList(searchQuery) {
    if (!searchQuery) {
        var cached = readMembersUiCache('teachers');
        if (cached && cached.length) {
            teachersState.teachers = cached;
            renderTeachersList();
        }
    }
    if (teachersState.loading) return;
    teachersState.loading = true;

    var url = routes.teachersList || '/api/communications/users/teachers-list';
    if (searchQuery) {
        url += '?q=' + encodeURIComponent(searchQuery);
    }

    window.Comms.api(url, { method: 'GET', dedupe: true })
        .then(function (data) {
            teachersState.teachers = data.teachers || [];
            if (!searchQuery) writeMembersUiCache('teachers', teachersState.teachers);
            renderTeachersList();
        })
        .catch(function (err) {
            console.error('Failed to load teachers:', err);
            window.Comms.showToast('Failed to load teachers list.', 'error');
        })
        .finally(function () {
            teachersState.loading = false;
        });
}

function renderTeachersList() {
    if (!teachersEls.teachersList) return;

    teachersEls.teachersList.innerHTML = '';

    if (teachersState.teachers.length === 0) {
        if (teachersEls.teachersEmpty) {
            teachersEls.teachersEmpty.hidden = false;
        }
        return;
    }

    if (teachersEls.teachersEmpty) {
        teachersEls.teachersEmpty.hidden = true;
    }

    teachersState.teachers.forEach(function (teacher) {
        var item = document.createElement('div');
        item.className = 'comms-conv-item';
        item.dataset.userId = teacher.id;
        item.dataset.userType = 'teachers';

        var avatarUrl = teacher.profile_image_url || '';
        var initials = getInitialsForTeacher(teacher.name);
        var online = isLivePresenceOnline(teacher.id, 'teachers');

        var avatar = avatarUrl
            ? '<img src="' + escapeHtmlForTeacher(avatarUrl) + '" alt="" class="comms-avatar" width="48" height="48">'
            : '<div class="comms-avatar comms-avatar-initial" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:#0039A8;color:#fff;font-weight:700;font-size:18px;border-radius:50%;">' + escapeHtmlForTeacher(initials) + '</div>';

        var position = teacher.sk_position || teacher.username || 'Teacher';
        var barangay = teacher.barangay ? teacher.barangay.name : '';
        var subtitle = position + (barangay ? ' • ' + barangay : '');

        item.innerHTML =
            '<div class="comms-conv-avatar-wrap">' + avatar +
            (online ? '<span class="comms-online-dot" title="Online"></span>' : '') +
            '</div>' +
            '<div class="comms-conv-main">' +
            '<div class="comms-conv-name">' + escapeHtmlForTeacher(teacher.name) + '</div>' +
            '<div class="comms-conv-snippet" style="color:#586069;font-size:13px;">' +
            escapeHtmlForTeacher(subtitle) +
            '</div>' +
            memberActionButtonsHtml(teacher.id) +
            '</div>';

        item.addEventListener('click', function (e) {
            var actBtn = e.target.closest('[data-member-act]');
            if (actBtn) {
                e.preventDefault();
                e.stopPropagation();
                handleMemberListAction(actBtn.getAttribute('data-user-id'), actBtn.getAttribute('data-member-act'));
                return;
            }
            openTeacherConversation(teacher);
        });

        teachersEls.teachersList.appendChild(item);
    });
}

function openTeacherConversation(teacher) {
    // Create or find private conversation with this teacher
    var url = routes.storeConversation || '/api/communications/conversations';
    
    window.Comms.api(url, {
        method: 'POST',
        body: JSON.stringify({ user_id: teacher.id }),
        dedupe: false
    })
    .then(function (data) {
        if (data && data.conversation) {
            // Switch to conversations tab
            switchToConversationsTabFromTeachers();
            // Load and display the conversation
            api.loadConversation(data.conversation.id);
        }
    })
    .catch(function (err) {
        console.error('Failed to create conversation:', err);
        window.Comms.showToast('Failed to start conversation with teacher.', 'error');
    });
}

function getInitialsForTeacher(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function escapeHtmlForTeacher(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function switchToConversationsTabFromTeachers() {
    if (!teachersEls.conversationsTab || !teachersEls.teachersTab) return;

    // Update tab styles
    teachersEls.conversationsTab.classList.add('comms-tab-active');
    teachersEls.conversationsTab.style.borderBottomColor = '#0039A8';
    teachersEls.conversationsTab.style.color = '#0039A8';

    teachersEls.teachersTab.classList.remove('comms-tab-active');
    teachersEls.teachersTab.style.borderBottomColor = 'transparent';
    teachersEls.teachersTab.style.color = '#586069';

    // Show conversations list, hide teachers list
    if (els.convList) els.convList.style.display = '';
    if (teachersEls.teachersList) teachersEls.teachersList.style.display = 'none';
    if (teachersEls.teachersSearchWrap) teachersEls.teachersSearchWrap.style.display = 'none';
    if (els.userSearch && els.userSearch.parentElement) {
        els.userSearch.parentElement.style.display = '';
    }
    if (teachersEls.teachersEmpty) teachersEls.teachersEmpty.hidden = true;

    state.listMode = 'conversations';
}

function switchToTeachersTab() {
    if (!teachersEls.conversationsTab || !teachersEls.teachersTab) return;

    // Update tab styles
    teachersEls.teachersTab.classList.add('comms-tab-active');
    teachersEls.teachersTab.style.borderBottomColor = '#0039A8';
    teachersEls.teachersTab.style.color = '#0039A8';

    teachersEls.conversationsTab.classList.remove('comms-tab-active');
    teachersEls.conversationsTab.style.borderBottomColor = 'transparent';
    teachersEls.conversationsTab.style.color = '#586069';

    // Hide conversations list, show teachers list
    if (els.convList) els.convList.style.display = 'none';
    if (teachersEls.teachersList) teachersEls.teachersList.style.display = '';
    if (teachersEls.teachersSearchWrap) teachersEls.teachersSearchWrap.style.display = '';
    if (els.userSearch && els.userSearch.parentElement) {
        els.userSearch.parentElement.style.display = 'none';
    }

    state.listMode = 'teachers';

    // Load teachers list if not already loaded
    if (teachersState.teachers.length === 0) {
        loadTeachersList();
    }
}

// Event listeners for tabs
if (teachersEls.conversationsTab) {
    teachersEls.conversationsTab.addEventListener('click', switchToConversationsTabFromTeachers);
}

if (teachersEls.teachersTab) {
    teachersEls.teachersTab.addEventListener('click', switchToTeachersTab);
}

// Event listener for teachers search
if (teachersEls.teachersSearch) {
    teachersEls.teachersSearch.addEventListener('input', function (e) {
        var query = e.target.value.trim();
        
        clearTimeout(teachersState.searchTimer);
        teachersState.searchTimer = setTimeout(function () {
            loadTeachersList(query);
        }, 300);
    });
}

    Object.assign(api, {
        escapeHtmlForTeacher: escapeHtmlForTeacher,
        getInitialsForTeacher: getInitialsForTeacher,
        handleMemberListAction: handleMemberListAction,
        isLivePresenceOnline: isLivePresenceOnline,
        loadTeachersList: loadTeachersList,
        memberActionButtonsHtml: memberActionButtonsHtml,
        membersUiCacheKey: membersUiCacheKey,
        openTeacherConversation: openTeacherConversation,
        readMembersUiCache: readMembersUiCache,
        renderTeachersList: renderTeachersList,
        switchToConversationsTabFromTeachers: switchToConversationsTabFromTeachers,
        switchToTeachersTab: switchToTeachersTab,
        writeMembersUiCache: writeMembersUiCache
    });

    ctx.teachersState = teachersState;
    ctx.teachersEls = teachersEls;
}
