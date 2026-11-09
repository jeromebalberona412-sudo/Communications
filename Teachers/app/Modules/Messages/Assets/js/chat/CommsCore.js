'use strict';

export function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (ch) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[ch];
    });
}

/** Escape then turn http(s) URLs into safe clickable links. */
export function linkifyText(text, linkClass) {
    var cls = String(linkClass || 'comms-inline-link');
    var escaped = escapeHtml(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
        var href = url;
        var trailing = '';
        while (/[.,;:!?)]$/.test(href)) {
            trailing = href.slice(-1) + trailing;
            href = href.slice(0, -1);
        }
        if (!href) {
            return url;
        }
        return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="' + cls + '">' +
            href + '</a>' + trailing;
    });
}

export function defaultAvatar(name) {
    var label = encodeURIComponent(String(name || 'User').slice(0, 40));
    return 'https://ui-avatars.com/api/?name=' + label + '&background=0039A8&color=fff';
}

export function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function route(template, id) {
    return String(template || '').replace('__ID__', String(id));
}

var inflight = Object.create(null);
var rateLimitUntil = 0;

export function rateLimitedState() {
    return Date.now() < rateLimitUntil;
}

export function api(url, options) {
    options = options || {};
    var method = (options.method || 'GET').toUpperCase();
    var isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    var key = method + ':' + url + ':' + (isFormData ? '[formdata]' : (options.body || ''));
    if (options.dedupe !== false && inflight[key]) {
        return inflight[key];
    }

    var headers = Object.assign({
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrfToken()
    }, options.headers || {});

    if (options.body && !isFormData && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    if (isFormData && headers['Content-Type']) {
        delete headers['Content-Type'];
    }

    var promise = fetch(url, {
        method: method,
        headers: headers,
        credentials: 'same-origin',
        body: options.body || undefined,
        signal: options.signal || undefined
    }).then(async function (res) {
        var data = null;
        var text = await res.text();
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { message: text }; }
        if (!res.ok) {
            var msg = (data && (data.message || data.error)) || 'Request failed';
            if (data && data.errors) {
                var first = Object.keys(data.errors)[0];
                if (first && data.errors[first] && data.errors[first][0]) {
                    msg = data.errors[first][0];
                }
            }
            var err = new Error(msg);
            err.status = res.status;
            err.data = data;
            if (res.status === 429) {
                var retryAfter = Number(res.headers && res.headers.get
                    ? res.headers.get('Retry-After')
                    : 0);
                err.isRateLimited = true;
                err.retryAfter = isNaN(retryAfter) || retryAfter <= 0
                    ? 5
                    : Math.min(60, Math.max(1, retryAfter));
                rateLimitUntil = Date.now() + (err.retryAfter * 1000);
                window.__COMMS_RATE_LIMITED_UNTIL__ = rateLimitUntil;
            }
            throw err;
        }
        return data;
    }).finally(function () {
        delete inflight[key];
    });

    if (options.dedupe !== false) {
        inflight[key] = promise;
    }
    return promise;
}

export function debounce(fn, wait) {
    var timer = null;
    var delay = wait || 300;
    function wrapped() {
        var args = arguments;
        var self = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
            timer = null;
            fn.apply(self, args);
        }, delay);
    }
    wrapped.cancel = function () {
        if (timer) clearTimeout(timer);
        timer = null;
    };
    wrapped.pending = function () { return !!timer; };
    return wrapped;
}

export function showToast(message, type) {
    type = type || 'info';
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        window.showToast(message, type);
        return;
    }
    var existing = document.getElementById('commsToast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'commsToast';
    el.className = 'comms-app-toast' + (type === 'error' ? ' is-error' : ' is-success');
    el.setAttribute('role', 'status');
    el.textContent = message;
    el.style.cssText = 'position:fixed;z-index:4000;top:24px;left:50%;transform:translateX(-50%);' +
        'background:' + (type === 'error' ? '#ef4444' : '#22c55e') +
        ';color:#fff;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;' +
        'max-width:min(92vw,420px);box-shadow:0 8px 24px rgba(0,0,0,.2);text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
}

var REACTION_SOUND_URL = '/sounds/reactions_ux.mp3';
var reactionAudio = null;

export function ensureReactionAudio() {
    if (!reactionAudio) {
        reactionAudio = new Audio(REACTION_SOUND_URL);
        reactionAudio.preload = 'auto';
        reactionAudio.volume = 0.75;
        try { reactionAudio.load(); } catch (e) {}
    }
    return reactionAudio;
}

export function playReactionSound() {
    var audio = ensureReactionAudio();
    audio.muted = false;
    audio.volume = 0.75;
    try {
        if (audio.readyState >= 2) {
            try { audio.currentTime = 0; } catch (e) {}
        }
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch(function () {
                var oneShot = new Audio(REACTION_SOUND_URL);
                oneShot.volume = 0.75;
                oneShot.play().catch(function () {});
            });
        }
    } catch (e) {
        try {
            var fallback = new Audio(REACTION_SOUND_URL);
            fallback.volume = 0.75;
            fallback.play().catch(function () {});
        } catch (err) {}
    }
}

if (typeof document !== 'undefined') {
    ensureReactionAudio();
    document.addEventListener('pointerdown', ensureReactionAudio, { once: true, capture: true });
}

var THREAD_CACHE_PREFIX = 'comms:thread:';

export function readCacheEntry(key) {
    if (window.SkLocalCache && typeof window.SkLocalCache.get === 'function') {
        var entry = window.SkLocalCache.get(key);
        return entry && Object.prototype.hasOwnProperty.call(entry, 'payload') ? entry.payload : null;
    }
    try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'payload')) {
            return parsed.payload;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

export function writeCacheEntry(key, payload) {
    if (window.SkLocalCache && typeof window.SkLocalCache.set === 'function') {
        window.SkLocalCache.set(key, payload);
        return;
    }
    try {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), payload: payload }));
    } catch (e) {}
}

export function readThreadCache(conversationId) {
    if (!conversationId) return null;
    return readCacheEntry(THREAD_CACHE_PREFIX + String(conversationId));
}

export function writeThreadCache(conversationId, payload) {
    if (!conversationId || payload == null) return;
    writeCacheEntry(THREAD_CACHE_PREFIX + String(conversationId), payload);
}

function cacheUserId() {
    var root = document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
    return String((root && (root.getAttribute('data-current-user-id') || root.dataset.currentUserId)) || '0');
}

function inboxCacheKey() {
    return 'comms:inbox:' + cacheUserId();
}

export function readInboxCache() {
    var payload = readCacheEntry(inboxCacheKey());
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.conversations)) return payload.conversations;
    return null;
}

export function writeInboxCache(conversations) {
    if (!Array.isArray(conversations)) return;
    writeCacheEntry(inboxCacheKey(), conversations);
}

export function cloneReactions(reactions) {
    return (Array.isArray(reactions) ? reactions : []).map(function (r) {
        return {
            emoji: r.emoji,
            count: Number(r.count || 0),
            mine: !!r.mine,
            users: Array.isArray(r.users) ? r.users.map(function (u) {
                return {
                    id: Number(u.id || 0),
                    user_type: String(u.user_type || ''),
                    name: String(u.name || ''),
                    mine: !!u.mine
                };
            }) : []
        };
    });
}

function selfReactor(ctx) {
    ctx = ctx || {};
    return {
        id: Number(ctx.currentUserId || 0),
        user_type: String(ctx.portalUserType || ''),
        name: 'You',
        mine: true
    };
}

function usersWithoutSelf(users) {
    return (users || []).filter(function (u) { return !u.mine; });
}

export function optimisticToggleReactions(reactions, emoji, ctx) {
    var me = selfReactor(ctx);
    var list = cloneReactions(reactions).filter(function (r) { return r.count > 0; });
    var mineEntry = null;
    var target = null;
    list.forEach(function (r) {
        if (r.mine) mineEntry = r;
        if (r.emoji === emoji) target = r;
    });

    if (target && target.mine) {
        target.count -= 1;
        target.mine = false;
        target.users = usersWithoutSelf(target.users);
    } else {
        if (mineEntry && mineEntry !== target) {
            mineEntry.count -= 1;
            mineEntry.mine = false;
            mineEntry.users = usersWithoutSelf(mineEntry.users);
        }
        if (target) {
            target.count += 1;
            target.mine = true;
            target.users = [me].concat(usersWithoutSelf(target.users));
        } else {
            list.push({ emoji: emoji, count: 1, mine: true, users: [me] });
        }
    }

    return list.filter(function (r) { return Number(r.count) > 0; });
}

export function currentUserAvatarUrl() {
    var root = document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
    if (!root) return '';
    return String(root.getAttribute('data-current-user-avatar') || root.dataset.currentUserAvatar || '').trim();
}
