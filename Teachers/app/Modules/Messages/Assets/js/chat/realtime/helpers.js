export function getRoot() {
    return document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
}

export function myUserId() {
    var root = getRoot();
    return root ? Number(root.dataset.currentUserId || 0) : 0;
}

export function myTypingIdentity() {
    var root = getRoot();
    var portal = root ? String(root.dataset.portalUserType || '').trim() : '';
    var name = root ? String(root.dataset.currentUserName || '').trim() : '';
    if (!name) {
        if (portal === 'kabataan' || portal === 'students' || portal === 'student') name = 'Student';
        else if (portal === 'sk_official' || portal === 'teachers' || portal === 'teacher') name = 'Teacher';
        else if (portal === 'sk_fed') name = 'Teacher';
        else name = 'Someone';
    }
    return {
        user_id: myUserId(),
        display_name: name,
        portal: portal
    };
}

export function myInboxName() {
    var root = getRoot();
    if (!root) return null;
    return 'comms-inbox-' + root.dataset.portalUserType + '-' + root.dataset.currentUserId;
}

export function peerInboxName(userType, userId) {
    if (!userType || userId == null || userId === '') return null;
    return 'comms-inbox-' + userType + '-' + userId;
}

export function unwrapBroadcast(raw) {
    var payload = raw;
    if (payload && payload.payload && (payload.event || payload.type === 'broadcast')) {
        payload = payload.payload;
    }
    if (payload && payload.payload && payload.payload.type && !payload.type) {
        payload = payload.payload;
    }
    return payload;
}

export function portalTypesMatchJs(a, b) {
    a = String(a || '').toLowerCase().trim();
    b = String(b || '').toLowerCase().trim();
    if (!a || !b) return false;
    if (a === b) return true;
    var students = { students: 1, student: 1, kabataan: 1, user: 1 };
    var teachers = { teachers: 1, teacher: 1, sk_official: 1 };
    return !!((students[a] && students[b]) || (teachers[a] && teachers[b]));
}

export function typeAliases(type) {
    var t = String(type || '').toLowerCase().trim();
    if (!t) return [];
    if (t === 'students' || t === 'student' || t === 'kabataan' || t === 'user') {
        return ['students', 'student', 'kabataan', 'user'];
    }
    if (t === 'teachers' || t === 'teacher' || t === 'sk_official') {
        return ['teachers', 'teacher', 'sk_official'];
    }
    return [t];
}

export function isConversationOpen(conversationId) {
    var cid = Number(conversationId || 0);
    if (!cid) return false;
    var pageCid = window.__COMMS_PAGE_ACTIVE_ID__;
    var headerCid = window.__COMMS_HEADER_ACTIVE_ID__;
    var chatId = (window.CommsChat && typeof window.CommsChat.getActiveId === 'function')
        ? window.CommsChat.getActiveId()
        : null;
    return Number(pageCid) === cid || Number(headerCid) === cid || Number(chatId) === cid;
}

export function bootRoutes() {
    var routes = (window.CommsChat && window.CommsChat.routes) || {};
    if (routes.presence) return routes;
    var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
    if (boot && boot.dataset && boot.dataset.routes) {
        try {
            return Object.assign({}, routes, JSON.parse(boot.dataset.routes));
        } catch (e) { /* ignore */ }
    }
    return routes;
}

export function initBootConfig() {
    var bootCfg = (typeof window !== 'undefined' && window.__COMMS_SUPABASE__) || {};
    return {
        url: String(bootCfg.url || import.meta.env.VITE_SUPABASE_URL || '').trim(),
        key: String(bootCfg.key || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
    };
}
