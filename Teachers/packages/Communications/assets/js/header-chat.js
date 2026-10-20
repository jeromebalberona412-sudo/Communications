/**
 * Header messages button → inbox dropdown only (no page redirect).
 * "See all messages" at the bottom navigates to the full Messages page.
 */
(function () {
    'use strict';

    if (window.CommsHeaderChat && window.CommsHeaderChat.__booted) return;

    var btn = document.getElementById('commsHeaderMsgBtn');
    var modal = document.getElementById('commsChatModal');
    if (!btn || !modal || !window.Comms) return;

    var listEl = document.getElementById('commsChatFsList');
    var emptyEl = document.getElementById('commsChatFsListEmpty');
    var sidebar = document.getElementById('commsChatFsSidebar');
    var threadEmpty = document.getElementById('commsChatFsEmpty');
    var threadActive = document.getElementById('commsChatFsActive');
    var searchInput = document.getElementById('commsChatFsSearch');
    var loading = false;
    var allItems = [];
    var filterMode = 'all';

    function bootRoutes() {
        var routes = (window.CommsChat && window.CommsChat.routes) || {};
        var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
        if (boot && boot.dataset && boot.dataset.routes) {
            try {
                routes = Object.assign({}, routes, JSON.parse(boot.dataset.routes));
            } catch (e) { /* ignore */ }
        }
        return routes;
    }

    function messagesPageUrl(conversationId) {
        var routes = bootRoutes();
        var base = routes.messagesPage || '/messages';
        if (conversationId) {
            return base + (base.indexOf('?') === -1 ? '?' : '&') + 'conversation=' + encodeURIComponent(conversationId);
        }
        return base;
    }

    function isOpen() {
        return modal.classList.contains('is-open') && !modal.hidden;
    }

    function openModal() {
        modal.hidden = false;
        modal.removeAttribute('hidden');
        modal.classList.add('is-open');
        if (sidebar) {
            sidebar.hidden = false;
            sidebar.removeAttribute('hidden');
        }
        if (threadActive) threadActive.hidden = true;
        if (threadEmpty) threadEmpty.hidden = true;
        document.body.classList.add('comms-header-chat-open');
        btn.setAttribute('aria-expanded', 'true');
        loadInbox();
        if (searchInput) {
            window.setTimeout(function () { searchInput.focus(); }, 40);
        }
    }

    function closeModal() {
        modal.hidden = true;
        modal.setAttribute('hidden', '');
        modal.classList.remove('is-open');
        document.body.classList.remove('comms-header-chat-open');
        btn.setAttribute('aria-expanded', 'false');
        if (searchInput) searchInput.value = '';
        filterMode = 'all';
        syncFilterTabs();
    }

    function escapeHtml(value) {
        return window.Comms.escapeHtml ? window.Comms.escapeHtml(value) : String(value || '');
    }

    function formatTime(iso) {
        if (window.Comms && typeof window.Comms.formatTime === 'function') {
            return window.Comms.formatTime(iso);
        }
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function avatarUrl(peer, name) {
        if (peer && peer.profile_image_url) return peer.profile_image_url;
        if (window.Comms && typeof window.Comms.defaultAvatar === 'function') {
            return window.Comms.defaultAvatar(name);
        }
        return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=0039A8&color=fff';
    }

    function filteredItems() {
        var q = searchInput ? String(searchInput.value || '').trim().toLowerCase() : '';
        return allItems.filter(function (c) {
            if (filterMode === 'unread' && Number(c.unread_count || 0) < 1) return false;
            if (!q) return true;
            var peer = c.other_user || {};
            var name = String(peer.name || c.name || '').toLowerCase();
            var preview = String((c.last_message && c.last_message.body) || '').toLowerCase();
            return name.indexOf(q) !== -1 || preview.indexOf(q) !== -1;
        });
    }

    function syncFilterTabs() {
        modal.querySelectorAll('[data-fs-filter]').forEach(function (tab) {
            var on = tab.getAttribute('data-fs-filter') === filterMode;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    function renderList() {
        if (!listEl) return;
        var items = filteredItems();
        if (!items.length) {
            listEl.innerHTML = '';
            if (emptyEl) {
                emptyEl.hidden = false;
                emptyEl.removeAttribute('hidden');
                var p = emptyEl.querySelector('p');
                if (p) {
                    p.textContent = filterMode === 'unread'
                        ? 'No unread messages'
                        : (allItems.length ? 'No matches' : 'No conversations yet');
                }
            }
            return;
        }
        if (emptyEl) {
            emptyEl.hidden = true;
            emptyEl.setAttribute('hidden', '');
        }
        listEl.innerHTML = items.map(function (c) {
            var peer = c.other_user || {};
            var name = peer.name || c.name || 'Chat';
            var preview = (c.last_message && c.last_message.body) || 'No messages yet';
            var unread = Number(c.unread_count || 0);
            var time = formatTime(c.last_message && c.last_message.created_at);
            var href = messagesPageUrl(c.id);
            var online = String(peer.online_status || '').toLowerCase() === 'online'
                || !!(window.__COMMS_PRESENCE_ONLINE_IDS__ || {})[Number(peer.id || 0)];
            return '<a class="comms-chat-fs-item' + (unread > 0 ? ' is-unread' : '') + '" href="' + href + '" data-conversation-id="' + Number(c.id) + '">' +
                '<span class="comms-chat-fs-avatar-wrap">' +
                '<img class="comms-chat-fs-avatar" src="' + escapeHtml(avatarUrl(peer, name)) + '" alt="" width="40" height="40">' +
                (online ? '<span class="comms-chat-fs-online" title="Online"></span>' : '') +
                '</span>' +
                '<span class="comms-chat-fs-item-main">' +
                '<span class="comms-chat-fs-item-row">' +
                '<span class="comms-chat-fs-item-name">' + escapeHtml(name) + '</span>' +
                (time ? '<span class="comms-chat-fs-item-time">' + escapeHtml(time) + '</span>' : '') +
                '</span>' +
                '<span class="comms-chat-fs-item-row">' +
                '<span class="comms-chat-fs-item-preview">' + escapeHtml(preview) + '</span>' +
                (unread > 0 ? '<span class="comms-chat-fs-unread">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
                '</span></span></a>';
        }).join('');
    }

    function applyUnreadFromList(items) {
        var total = 0;
        (items || []).forEach(function (c) {
            total += Number(c.unread_count || 0);
        });
        if (window.CommsRealtime && typeof window.CommsRealtime.updateHeaderBadge === 'function') {
            window.CommsRealtime.updateHeaderBadge(total);
        } else {
            var badge = document.getElementById('commsMsgBadge');
            if (!badge) return;
            if (total <= 0) {
                badge.hidden = true;
                badge.setAttribute('hidden', '');
                badge.textContent = '0';
            } else {
                badge.hidden = false;
                badge.removeAttribute('hidden');
                badge.style.display = '';
                badge.textContent = total > 99 ? '99+' : String(total);
            }
        }
    }

    function loadInbox() {
        if (loading) return;
        var routes = bootRoutes();
        if (!routes.conversations) return;
        loading = true;
        if (listEl && !allItems.length) {
            listEl.innerHTML = '<p class="comms-chat-fs-loading">Loading chats…</p>';
        }
        window.Comms.api(routes.conversations, { dedupe: true }).then(function (data) {
            allItems = (data && data.conversations) || [];
            applyUnreadFromList(allItems);
            renderList();
        }).catch(function () {
            if (listEl) listEl.innerHTML = '<p class="comms-chat-fs-loading">Unable to load chats.</p>';
        }).finally(function () {
            loading = false;
        });
    }

    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen()) closeModal();
        else openModal();
    });

    modal.addEventListener('click', function (e) {
        var close = e.target && e.target.closest('[data-comms-chat-close]');
        if (close) {
            e.preventDefault();
            closeModal();
            return;
        }
        var filter = e.target && e.target.closest('[data-fs-filter]');
        if (filter) {
            e.preventDefault();
            filterMode = filter.getAttribute('data-fs-filter') || 'all';
            syncFilterTabs();
            renderList();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            renderList();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) closeModal();
    });

    // Keep See All link pointing at /messages
    var seeAll = modal.querySelector('.comms-msg-see-all-link');
    if (seeAll) {
        seeAll.setAttribute('href', messagesPageUrl());
        seeAll.textContent = 'See all messages';
    }

    window.CommsHeaderChat = {
        __booted: true,
        open: openModal,
        close: closeModal,
        reload: loadInbox
    };

    window.onCommsHeaderMessageInsert = function () {
        loadInbox();
    };
    window.onCommsHeaderPresence = function () {
        if (isOpen()) renderList();
    };

    // Initial badge hydrate without waiting for a full page composer query.
    loadInbox();
})();
