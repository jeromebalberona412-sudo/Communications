'use strict';

import {
    escapeHtml,
    cloneReactions,
    defaultAvatar,
    currentUserAvatarUrl
} from './CommsCore.js';

var reactionPeopleEl = null;
var reactionPeoplePinned = false;
var reactionPeopleHideTimer = null;
var reactionModalEl = null;
var reactionModalState = { reactions: [], filterEmoji: '' };

function reactorDisplayName(user) {
    if (!user) return 'Someone';
    if (user.mine) return 'You';
    var name = String(user.name || '').trim();
    return name !== '' ? name : 'Someone';
}

export function ensureReactionPeopleStyles() {
    if (document.getElementById('commsReactionPeopleStyles')) return;
    var style = document.createElement('style');
    style.id = 'commsReactionPeopleStyles';
    style.textContent =
        '.comms-reaction-people{position:fixed;z-index:100100;min-width:148px;max-width:min(260px,calc(100vw - 16px));background:#1c1e21;color:#fff;border-radius:10px;padding:8px 10px;box-shadow:0 12px 28px rgba(15,23,42,.32);font-size:12px;line-height:1.35;}' +
        '.comms-reaction-people[hidden]{display:none!important;}' +
        '.comms-reaction-people-group{display:flex;gap:8px;align-items:flex-start;}' +
        '.comms-reaction-people-group+.comms-reaction-people-group{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12);}' +
        '.comms-reaction-people-emoji{font-size:1.05rem;line-height:1.2;flex:0 0 auto;}' +
        '.comms-reaction-people-list{margin:0;padding:0;list-style:none;}' +
        '.comms-reaction-people-list li{font-weight:600;word-break:break-word;}' +
        'button.comms-reaction-summary{cursor:pointer;font:inherit;color:inherit;}' +
        '.comms-reaction-modal{position:fixed;inset:0;z-index:100120;display:flex;align-items:center;justify-content:center;padding:12px;}' +
        '.comms-reaction-modal[hidden]{display:none!important;}' +
        '.comms-reaction-modal-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);}' +
        '.comms-reaction-modal-panel{position:relative;z-index:1;width:min(420px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:min(84vh,calc(100vh - 24px));background:#fff;border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.28);display:flex;flex-direction:column;overflow:hidden;}' +
        '.comms-reaction-modal-header{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:0;padding:12px 14px;border-bottom:1px solid #e8eef5;background:#f8fafc;box-sizing:border-box;position:relative;}' +
        '.comms-reaction-modal-title{margin:0;font-size:15px;font-weight:700;color:#111827;text-align:left;flex:1;min-width:0;}' +
        '.comms-reaction-modal-close{position:static;transform:none;width:34px;height:34px;border:0;border-radius:999px;background:#e2e8f0;color:#334155;font-size:1rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}' +
        '.comms-reaction-modal-close:hover{background:#fecaca;color:#b42318;}' +
        '.comms-reaction-modal-tabs{display:flex;gap:.15rem;overflow-x:auto;padding:.55rem .75rem;border-bottom:1px solid #eef2f7;justify-content:flex-start;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}' +
        '.comms-reaction-modal-tab{border:0;background:transparent;color:#6b7280;font-weight:700;font-size:.88rem;padding:.4rem .65rem;border-bottom:2px solid transparent;white-space:nowrap;cursor:pointer;flex:0 0 auto;}' +
        '.comms-reaction-modal-tab.is-active{color:#0450a8;border-bottom-color:#0450a8;}' +
        '.comms-reaction-modal-list{overflow:auto;padding:.35rem 0;flex:1;min-height:0;-webkit-overflow-scrolling:touch;}' +
        '.comms-reaction-modal-row{display:flex;align-items:center;gap:.75rem;padding:.7rem 1rem;min-width:0;}' +
        '.comms-reaction-modal-avatar{width:40px;height:40px;border-radius:999px;background:#e8f1fb;color:#0450a8;display:inline-flex;align-items:center;justify-content:center;font-weight:750;flex:0 0 auto;overflow:hidden;}' +
        '.comms-reaction-modal-avatar img{width:100%;height:100%;object-fit:cover;display:block;}' +
        '.comms-reaction-modal-meta{flex:1;min-width:0;}' +
        '.comms-reaction-modal-name{font-weight:700;color:#111827;overflow-wrap:anywhere;word-break:break-word;}' +
        '.comms-reaction-modal-hint{font-size:.78rem;color:#6b7280;margin-top:.1rem;}' +
        '.comms-reaction-modal-emoji{font-size:1.25rem;flex:0 0 auto;}' +
        '.comms-reaction-modal-empty{padding:1.5rem 1rem;text-align:center;color:#6b7280;font-weight:600;}' +
        'body.comms-reaction-modal-open{overflow:hidden;}' +
        '.comms-image-lightbox{position:fixed;inset:0;z-index:100200;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;pointer-events:auto;}' +
        '.comms-image-lightbox[hidden]{display:none!important;pointer-events:none!important;visibility:hidden!important;}' +
        'body.comms-image-lightbox-open{overflow:hidden;}' +
        '.comms-image-lightbox-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.92);}' +
        '.comms-image-lightbox-toolbar{display:none!important;}' +
        '.comms-image-lightbox-tool,.comms-image-lightbox-zoom-label{display:none!important;}' +
        '.comms-image-lightbox-close{position:fixed;top:max(.65rem,env(safe-area-inset-top));left:max(.65rem,env(safe-area-inset-left));z-index:3;width:42px;height:42px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:1.6rem;line-height:1;cursor:pointer;}' +
        '.comms-image-lightbox-nav{display:none!important;}' +
        '.comms-image-lightbox-stage{position:relative;z-index:1;flex:1;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4.5rem 1rem 6.5rem;touch-action:pan-y;cursor:grab;}' +
        '.comms-image-lightbox-img{max-width:min(96vw,1200px);max-height:calc(100vh - 11rem);width:auto;height:auto;object-fit:contain;border-radius:8px;transform-origin:center center;transition:transform .12s ease;user-select:none;-webkit-user-drag:none;}' +
        '.comms-image-lightbox-counter{position:fixed;top:max(.85rem,env(safe-area-inset-top));right:max(.85rem,env(safe-area-inset-right));z-index:3;color:#e2e8f0;font-size:.85rem;font-weight:700;background:rgba(0,0,0,.35);padding:.35rem .65rem;border-radius:999px;}' +
        '.comms-image-lightbox-thumbs{position:fixed;left:50%;bottom:max(.75rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3;display:flex;gap:.45rem;max-width:min(96vw,920px);overflow-x:auto;padding:.45rem .55rem;border-radius:14px;background:rgba(0,0,0,.42);-webkit-overflow-scrolling:touch;scrollbar-width:thin;}' +
        '.comms-image-lightbox-thumbs[hidden]{display:none!important;}' +
        '.comms-image-lightbox-thumb-wrap{position:relative;flex:0 0 auto;width:56px;height:56px;}' +
        '.comms-image-lightbox-thumb{display:block;width:56px;height:56px;padding:0;border:2px solid transparent;border-radius:8px;overflow:hidden;background:#0f172a;cursor:pointer;opacity:.72;}' +
        '.comms-image-lightbox-thumb.is-active,.comms-image-lightbox-thumb-wrap.is-active .comms-image-lightbox-thumb{border-color:#fff;opacity:1;}' +
        '.comms-image-lightbox-thumb img{display:block;width:100%;height:100%;object-fit:cover;}' +
        '.comms-image-lightbox-thumb-remove{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border:0;border-radius:999px;background:#ef4444;color:#fff;font-size:.95rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);}' +
        '.comms-image-lightbox-thumb-remove:hover,.comms-image-lightbox-thumb-remove:focus-visible{background:#dc2626;outline:none;}' +
        '.comms-image-lightbox-nav:disabled{opacity:.35;cursor:default;}';
    document.head.appendChild(style);
}

function ensureReactionPeopleEl() {
    ensureReactionPeopleStyles();
    if (reactionPeopleEl) return reactionPeopleEl;
    reactionPeopleEl = document.createElement('div');
    reactionPeopleEl.id = 'commsReactionPeople';
    reactionPeopleEl.className = 'comms-reaction-people';
    reactionPeopleEl.hidden = true;
    reactionPeopleEl.setAttribute('role', 'tooltip');
    document.body.appendChild(reactionPeopleEl);
    reactionPeopleEl.addEventListener('pointerenter', function () {
        if (reactionPeopleHideTimer) {
            window.clearTimeout(reactionPeopleHideTimer);
            reactionPeopleHideTimer = null;
        }
    });
    reactionPeopleEl.addEventListener('pointerleave', function () {
        if (!reactionPeoplePinned) hideReactionPeople();
    });
    document.addEventListener('click', function (e) {
        if (!reactionPeopleEl || reactionPeopleEl.hidden) return;
        if (e.target.closest('#commsReactionPeople') || e.target.closest('[data-react-people]')) return;
        hideReactionPeople();
    });
    return reactionPeopleEl;
}

export function hideReactionPeople() {
    reactionPeoplePinned = false;
    if (reactionPeopleHideTimer) {
        window.clearTimeout(reactionPeopleHideTimer);
        reactionPeopleHideTimer = null;
    }
    if (reactionPeopleEl) reactionPeopleEl.hidden = true;
}

function positionReactionPeople(anchor) {
    var el = ensureReactionPeopleEl();
    if (!anchor) return;
    var rect = anchor.getBoundingClientRect();
    var pad = 8;
    var w = el.offsetWidth || 180;
    var h = el.offsetHeight || 48;
    var top = rect.top - h - 8;
    var left = rect.left + (rect.width / 2) - (w / 2);
    if (top < pad) top = rect.bottom + 8;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
}

function renderReactionPeopleHtml(reactions, filterEmoji) {
    var items = cloneReactions(reactions).filter(function (r) {
        if (Number(r.count || 0) <= 0) return false;
        if (filterEmoji && r.emoji !== filterEmoji) return false;
        return true;
    });
    if (!items.length) {
        return '<div class="comms-reaction-people-group"><ul class="comms-reaction-people-list"><li>No reactions yet</li></ul></div>';
    }
    return items.map(function (r) {
        var names = (r.users && r.users.length)
            ? r.users.map(reactorDisplayName)
            : (r.mine ? ['You'] : []);
        if (!names.length) {
            names = [String(r.count) + (Number(r.count) === 1 ? ' reaction' : ' reactions')];
        }
        return '<div class="comms-reaction-people-group">' +
            '<span class="comms-reaction-people-emoji">' + escapeHtml(r.emoji) + '</span>' +
            '<ul class="comms-reaction-people-list">' +
            names.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') +
            '</ul></div>';
    }).join('');
}

export function showReactionPeople(anchor, reactions, options) {
    options = options || {};
    if (!anchor) return;
    var el = ensureReactionPeopleEl();
    if (reactionPeopleHideTimer) {
        window.clearTimeout(reactionPeopleHideTimer);
        reactionPeopleHideTimer = null;
    }
    reactionPeoplePinned = !!options.pinned;
    el.innerHTML = renderReactionPeopleHtml(reactions, options.emoji || '');
    el.hidden = false;
    positionReactionPeople(anchor);
    requestAnimationFrame(function () { positionReactionPeople(anchor); });
}

export function toggleReactionPeople(anchor, reactions, options) {
    options = options || {};
    openReactionModal(reactions, options.emoji || '');
}

export function scheduleHideReactionPeople() {
    if (reactionPeoplePinned) return;
    if (reactionPeopleHideTimer) window.clearTimeout(reactionPeopleHideTimer);
    reactionPeopleHideTimer = window.setTimeout(hideReactionPeople, 160);
}

function ensureReactionModal() {
    ensureReactionPeopleStyles();
    if (reactionModalEl) return reactionModalEl;
    reactionModalEl = document.createElement('div');
    reactionModalEl.id = 'commsReactionModal';
    reactionModalEl.className = 'comms-reaction-modal';
    reactionModalEl.hidden = true;
    reactionModalEl.setAttribute('role', 'dialog');
    reactionModalEl.setAttribute('aria-modal', 'true');
    reactionModalEl.setAttribute('aria-labelledby', 'commsReactionModalTitle');
    reactionModalEl.innerHTML =
        '<div class="comms-reaction-modal-backdrop" data-reaction-modal-close tabindex="-1"></div>' +
        '<div class="comms-reaction-modal-panel">' +
        '<div class="comms-reaction-modal-header">' +
        '<h3 class="comms-reaction-modal-title" id="commsReactionModalTitle">Message reactions</h3>' +
        '<button type="button" class="comms-reaction-modal-close" data-reaction-modal-close aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="comms-reaction-modal-tabs" id="commsReactionModalTabs" role="tablist"></div>' +
        '<div class="comms-reaction-modal-list" id="commsReactionModalList"></div>' +
        '</div>';
    document.body.appendChild(reactionModalEl);
    reactionModalEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-reaction-modal-close]')) {
            closeReactionModal();
            return;
        }
        var tab = e.target.closest('[data-reaction-tab]');
        if (tab) {
            reactionModalState.filterEmoji = tab.getAttribute('data-reaction-tab') || '';
            renderReactionModalBody();
        }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && reactionModalEl && !reactionModalEl.hidden) {
            closeReactionModal();
        }
    });
    return reactionModalEl;
}

function renderReactionModalBody() {
    var tabs = document.getElementById('commsReactionModalTabs');
    var list = document.getElementById('commsReactionModalList');
    if (!tabs || !list) return;
    var items = cloneReactions(reactionModalState.reactions).filter(function (r) {
        return Number(r.count || 0) > 0;
    });
    var total = 0;
    items.forEach(function (r) { total += Number(r.count || 0); });
    var filter = reactionModalState.filterEmoji || '';
    tabs.innerHTML =
        '<button type="button" class="comms-reaction-modal-tab' + (filter === '' ? ' is-active' : '') + '" data-reaction-tab="" role="tab">All ' + total + '</button>' +
        items.map(function (r) {
            return '<button type="button" class="comms-reaction-modal-tab' + (filter === r.emoji ? ' is-active' : '') + '" data-reaction-tab="' +
                escapeHtml(r.emoji) + '" role="tab">' + escapeHtml(r.emoji) + ' ' + Number(r.count || 0) + '</button>';
        }).join('');

    var rows = [];
    items.forEach(function (r) {
        if (filter && r.emoji !== filter) return;
        var users = (r.users && r.users.length) ? r.users : [];
        if (!users.length && r.mine) {
            users = [{ name: 'You', mine: true }];
        }
        if (!users.length) {
            rows.push('<div class="comms-reaction-modal-row"><div class="comms-reaction-modal-meta"><div class="comms-reaction-modal-name">' +
                Number(r.count || 0) + ' reaction' + (Number(r.count) === 1 ? '' : 's') +
                '</div></div><span class="comms-reaction-modal-emoji">' + escapeHtml(r.emoji) + '</span></div>');
            return;
        }
        users.forEach(function (u) {
            var name = reactorDisplayName(u);
            var avatarUrl = String(u.profile_image_url || '').trim();
            if (!avatarUrl && u.mine) avatarUrl = currentUserAvatarUrl();
            if (!avatarUrl) avatarUrl = defaultAvatar(name);
            rows.push(
                '<div class="comms-reaction-modal-row">' +
                '<span class="comms-reaction-modal-avatar" aria-hidden="true">' +
                '<img src="' + escapeHtml(avatarUrl) + '" alt="">' +
                '</span>' +
                '<div class="comms-reaction-modal-meta">' +
                '<div class="comms-reaction-modal-name">' + escapeHtml(name) + '</div>' +
                '</div>' +
                '<span class="comms-reaction-modal-emoji">' + escapeHtml(r.emoji) + '</span>' +
                '</div>'
            );
        });
    });
    list.innerHTML = rows.length ? rows.join('') : '<p class="comms-reaction-modal-empty">No reactions yet</p>';
}

export function openReactionModal(reactions, filterEmoji) {
    hideReactionPeople();
    ensureReactionModal();
    reactionModalState.reactions = cloneReactions(reactions);
    reactionModalState.filterEmoji = filterEmoji || '';
    renderReactionModalBody();
    reactionModalEl.hidden = false;
    document.body.classList.add('comms-reaction-modal-open');
}

export function closeReactionModal() {
    if (!reactionModalEl) return;
    reactionModalEl.hidden = true;
    document.body.classList.remove('comms-reaction-modal-open');
}
