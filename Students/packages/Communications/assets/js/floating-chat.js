/**
 * Floating Messenger-Style Chat Windows
 * Opens conversations as docked windows at bottom-right, like Facebook Messenger.
 * Works on ALL pages, persists across navigation within the same tab session.
 */
(function () {
    'use strict';

    if (window.CommsFloatingChat && window.CommsFloatingChat.__booted) return;

    var MAX_WINDOWS = 3;
    var WINDOW_WIDTH = 328;
    var WINDOW_HEIGHT_DESKTOP = 450;
    var WINDOW_GAP = 16;
    var openWindows = {}; // conversationId → window state
    var windowOrder = []; // Order of opening (for stacking)
    var currentUserId = null;
    var portalUserType = null;
    var routes = {};

    // State persistence
    function storageKey() {
        if (!currentUserId) return null;
        return 'commsFloatingChats.' + currentUserId;
    }

    function saveState() {
        var key = storageKey();
        if (!key) return;
        try {
            var state = {
                windows: windowOrder.map(function (cid) {
                    var w = openWindows[cid];
                    return {
                        conversationId: cid,
                        minimized: w.minimized,
                        peerName: w.peerName,
                        peerAvatar: w.peerAvatar,
                        isGroup: w.isGroup,
                        memberCount: w.memberCount
                    };
                }),
                ts: Date.now()
            };
            sessionStorage.setItem(key, JSON.stringify(state));
        } catch (e) { /* ignore */ }
    }

    function loadState() {
        var key = storageKey();
        if (!key) return null;
        try {
            var raw = sessionStorage.getItem(key);
            if (!raw) return null;
            var state = JSON.parse(raw);
            if (!state || !Array.isArray(state.windows)) return null;
            // Only restore if less than 1 hour old
            if (Date.now() - (state.ts || 0) > 3600000) {
                sessionStorage.removeItem(key);
                return null;
            }
            return state;
        } catch (e) {
            return null;
        }
    }

    function clearState() {
        var key = storageKey();
        if (key) {
            try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
        }
    }

    function escapeHtml(text) {
        if (window.Comms && typeof window.Comms.escapeHtml === 'function') {
            return window.Comms.escapeHtml(text);
        }
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function defaultAvatar(name) {
        if (window.Comms && typeof window.Comms.defaultAvatar === 'function') {
            return window.Comms.defaultAvatar(name);
        }
        return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=0039A8&color=fff';
    }

    function formatTime(iso) {
        if (window.Comms && typeof window.Comms.formatTime === 'function') {
            return window.Comms.formatTime(iso);
        }
        if (!iso) return '';
        try {
            var d = new Date(iso);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    // Check if we're on the full Messages page
    function isOnMessagesPage() {
        return window.location.pathname.indexOf('/messages') !== -1
            || window.location.pathname.indexOf('/communications') !== -1
            || document.getElementById('commsApp') !== null;
    }

    // Create window markup
    function createWindowMarkup(conversationId, opts) {
        opts = opts || {};
        var peerName = opts.peerName || 'Chat';
        var peerAvatar = opts.peerAvatar || defaultAvatar(peerName);
        var online = opts.online || false;
        var isGroup = opts.isGroup || false;
        var memberCount = opts.memberCount || 0;
        var statusText = isGroup
            ? (memberCount > 0 ? memberCount + ' members' : 'Group')
            : (online ? 'Online' : '');

        var html = '<div class="floating-chat-window" id="floatingChat' + conversationId + '" data-conversation-id="' + conversationId + '">' +
            '<div class="floating-chat-header">' +
            '<div class="floating-chat-peer">' +
            '<img class="floating-chat-avatar" src="' + escapeHtml(peerAvatar) + '" alt="" width="32" height="32" ' +
            'onerror="this.onerror=null;this.src=\'' + escapeHtml(defaultAvatar(peerName)) + '\'">' +
            '<div class="floating-chat-peer-info">' +
            '<div class="floating-chat-peer-name" title="' + escapeHtml(peerName) + '">' + escapeHtml(peerName) + '</div>' +
            (statusText ? '<div class="floating-chat-peer-status">' + escapeHtml(statusText) + '</div>' : '') +
            '</div></div>' +
            '<div class="floating-chat-actions">' +
            (!isGroup ? '<button type="button" class="floating-chat-btn" data-action="voice" title="Voice call" aria-label="Voice call">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>' +
            '</button>' : '') +
            (!isGroup ? '<button type="button" class="floating-chat-btn" data-action="video" title="Video call" aria-label="Video call">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' +
            '</button>' : '') +
            '<button type="button" class="floating-chat-btn" data-action="minimize" title="Minimize" aria-label="Minimize">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h12"/></svg>' +
            '</button>' +
            '<button type="button" class="floating-chat-btn" data-action="expand" title="Open in Messages" aria-label="Open in Messages">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>' +
            '</button>' +
            '<button type="button" class="floating-chat-btn" data-action="close" title="Close" aria-label="Close">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>' +
            '</button>' +
            '</div></div>' +
            '<div class="floating-chat-body" id="floatingChatBody' + conversationId + '">' +
            '<div class="floating-chat-loading">Loading messages...</div>' +
            '</div>' +
            '<div class="floating-chat-typing" id="floatingChatTyping' + conversationId + '" hidden></div>' +
            '<form class="floating-chat-composer" id="floatingChatForm' + conversationId + '" autocomplete="off">' +
            '<button type="button" class="floating-chat-attach-btn" title="Attach" aria-label="Attach">' +
            '<span aria-hidden="true">+</span>' +
            '</button>' +
            '<textarea class="floating-chat-input" id="floatingChatInput' + conversationId + '" rows="1" placeholder="Type a message" aria-label="Type a message"></textarea>' +
            '<button type="submit" class="floating-chat-send-btn" title="Send" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '</button>' +
            '</form>' +
            '</div>';

        return html;
    }

    // Create minimized bubble
    function createBubbleMarkup(conversationId, opts) {
        opts = opts || {};
        var peerName = opts.peerName || 'Chat';
        var peerAvatar = opts.peerAvatar || defaultAvatar(peerName);
        var unread = opts.unread || 0;

        return '<button type="button" class="floating-chat-bubble" id="floatingBubble' + conversationId + '" ' +
            'data-conversation-id="' + conversationId + '" title="' + escapeHtml(peerName) + '" aria-label="' + escapeHtml(peerName) + '">' +
            '<img src="' + escapeHtml(peerAvatar) + '" alt="" width="48" height="48" ' +
            'onerror="this.onerror=null;this.src=\'' + escapeHtml(defaultAvatar(peerName)) + '\'">' +
            (unread > 0 ? '<span class="floating-chat-bubble-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
            '</button>';
    }

    // Position windows
    function positionWindows() {
        var container = document.getElementById('floatingChatContainer');
        if (!container) return;

        var isMobile = window.innerWidth < 768;
        if (isMobile) {
            // Mobile: single full-screen window
            windowOrder.forEach(function (cid) {
                var w = openWindows[cid];
                if (!w || !w.el) return;
                w.el.classList.add('is-mobile');
                w.el.style.right = '0';
                w.el.style.bottom = '0';
                w.el.style.width = '100%';
                w.el.style.height = '100dvh';
            });
            return;
        }

        // Desktop: stack side-by-side from right
        var visibleWindows = windowOrder.filter(function (cid) {
            return openWindows[cid] && !openWindows[cid].minimized;
        });
        var visibleBubbles = windowOrder.filter(function (cid) {
            return openWindows[cid] && openWindows[cid].minimized;
        });

        visibleWindows.forEach(function (cid, index) {
            var w = openWindows[cid];
            if (!w || !w.el) return;
            w.el.classList.remove('is-mobile', 'is-minimized');
            w.el.style.right = (WINDOW_GAP + index * (WINDOW_WIDTH + WINDOW_GAP)) + 'px';
            w.el.style.bottom = WINDOW_GAP + 'px';
            w.el.style.width = WINDOW_WIDTH + 'px';
            w.el.style.height = WINDOW_HEIGHT_DESKTOP + 'px';
        });

        visibleBubbles.forEach(function (cid, index) {
            var w = openWindows[cid];
            if (!w || !w.bubble) return;
            w.bubble.style.right = (WINDOW_GAP + (visibleWindows.length + index) * (56 + 12)) + 'px';
            w.bubble.style.bottom = WINDOW_GAP + 'px';
        });
    }

    // Focus window (bring to front in z-index order)
    function focusWindow(conversationId) {
        var cid = String(conversationId);
        var index = windowOrder.indexOf(cid);
        if (index === -1) return;

        // Move to end of array (top of stack)
        windowOrder.splice(index, 1);
        windowOrder.push(cid);

        // Update z-index
        windowOrder.forEach(function (id, i) {
            var w = openWindows[id];
            if (w && w.el) {
                w.el.style.zIndex = String(10000 + i);
            }
        });

        saveState();
    }

    // Load messages for a window
    function loadMessages(conversationId) {
        var w = openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var url = routes.messages ? routes.messages.replace('__ID__', conversationId) : null;
        if (!url || !window.Comms) return;

        bodyEl.innerHTML = '<div class="floating-chat-loading">Loading...</div>';

        window.Comms.api(url + '?per_page=20', { dedupe: true }).then(function (data) {
            var messages = (data && data.messages) || [];
            if (!messages.length) {
                bodyEl.innerHTML = '<div class="floating-chat-empty">No messages yet</div>';
                return;
            }

            // Render messages (newest first, then reverse for display)
            var html = messages.reverse().map(function (m) {
                var mine = Number(m.sender_id) === Number(currentUserId);
                var time = formatTime(m.created_at);
                var body = escapeHtml(m.body || '');
                
                if (m.message_type === 'call' || m.message_type === 'system') {
                    return '<div class="floating-chat-msg is-system">' +
                        '<div class="floating-chat-msg-body">' + body + '</div>' +
                        '</div>';
                }

                return '<div class="floating-chat-msg ' + (mine ? 'is-mine' : 'is-theirs') + '">' +
                    '<div class="floating-chat-msg-body">' + body + '</div>' +
                    '<div class="floating-chat-msg-time">' + time + '</div>' +
                    '</div>';
            }).join('');

            bodyEl.innerHTML = html;
            bodyEl.scrollTop = bodyEl.scrollHeight;
        }).catch(function (err) {
            bodyEl.innerHTML = '<div class="floating-chat-empty">Unable to load messages</div>';
        });
    }

    // Send message
    function sendMessage(conversationId, body) {
        if (!body || !window.Comms) return Promise.reject(new Error('No message'));

        var url = routes.messages ? routes.messages.replace('__ID__', conversationId) : null;
        if (!url) return Promise.reject(new Error('No URL'));

        var tempId = 'temp-' + Date.now();
        appendMessageToWindow(conversationId, {
            id: tempId,
            body: body,
            sender_id: currentUserId,
            mine: true,
            created_at: new Date().toISOString(),
            message_type: 'text'
        });

        return window.Comms.api(url, {
            method: 'POST',
            body: JSON.stringify({ body: body, message_type: 'text' })
        }).then(function (data) {
            var msg = (data && data.message) || {};
            replaceMessageInWindow(conversationId, tempId, msg);
            return msg;
        }).catch(function (err) {
            markMessageFailed(conversationId, tempId);
            throw err;
        });
    }

    // Append message to window
    function appendMessageToWindow(conversationId, message) {
        var w = openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var mine = message.mine || Number(message.sender_id) === Number(currentUserId);
        var time = formatTime(message.created_at);
        var body = escapeHtml(message.body || '');

        if (message.message_type === 'call' || message.message_type === 'system') {
            var msgEl = document.createElement('div');
            msgEl.className = 'floating-chat-msg is-system';
            msgEl.innerHTML = '<div class="floating-chat-msg-body">' + body + '</div>';
            msgEl.dataset.messageId = message.id;
            bodyEl.appendChild(msgEl);
        } else {
            var msgEl = document.createElement('div');
            msgEl.className = 'floating-chat-msg ' + (mine ? 'is-mine' : 'is-theirs');
            msgEl.dataset.messageId = message.id;
            msgEl.innerHTML = '<div class="floating-chat-msg-body">' + body + '</div>' +
                '<div class="floating-chat-msg-time">' + time + '</div>';
            bodyEl.appendChild(msgEl);
        }

        bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    function replaceMessageInWindow(conversationId, tempId, realMessage) {
        var w = openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var tempEl = bodyEl.querySelector('[data-message-id="' + tempId + '"]');
        if (tempEl) {
            tempEl.dataset.messageId = realMessage.id;
            tempEl.classList.remove('is-sending');
        }
    }

    function markMessageFailed(conversationId, messageId) {
        var w = openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var msgEl = bodyEl.querySelector('[data-message-id="' + messageId + '"]');
        if (msgEl) {
            msgEl.classList.add('is-failed');
        }
    }

    // Handle realtime messages
    function handleRealtimeMessage(message) {
        var cid = String(message.conversation_id);
        if (!openWindows[cid]) return;

        // Don't duplicate own messages
        if (Number(message.sender_id) === Number(currentUserId)) return;

        appendMessageToWindow(cid, message);

        // Mark read if window is visible and not minimized
        if (!openWindows[cid].minimized && document.visibilityState !== 'hidden') {
            markConversationRead(cid);
        }
    }

    // Mark conversation as read
    function markConversationRead(conversationId) {
        if (!routes.read || !window.Comms) return;

        var url = routes.read.replace('__ID__', conversationId);
        window.Comms.api(url, { method: 'POST', body: '{}', dedupe: true }).then(function () {
            // Update unread counts
            if (window.CommsRealtime && typeof window.CommsRealtime.zeroConversationUnread === 'function') {
                window.CommsRealtime.zeroConversationUnread(conversationId);
            }
            if (window.CommsRealtime && typeof window.CommsRealtime.refreshUnread === 'function') {
                window.CommsRealtime.refreshUnread();
            }
        }).catch(function () { /* ignore */ });
    }

    // Subscribe to realtime for conversation
    function subscribeRealtime(conversationId) {
        if (window.CommsRealtime && typeof window.CommsRealtime.subscribeConversation === 'function') {
            window.CommsRealtime.subscribeConversation(conversationId);
        }
    }

    // Open a chat window
    function openChatWindow(conversationId, opts) {
        opts = opts || {};

        // If on Messages page, navigate there instead
        if (isOnMessagesPage()) {
            var url = routes.messagesPage || '/messages';
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'conversation=' + conversationId;
            window.location.href = url;
            return;
        }

        var cid = String(conversationId);

        // If already open, just focus it
        if (openWindows[cid]) {
            if (openWindows[cid].minimized) {
                restoreWindow(cid);
            } else {
                focusWindow(cid);
            }
            return;
        }

        // Close panel if open
        if (window.CommsHeaderChat && typeof window.CommsHeaderChat.close === 'function') {
            window.CommsHeaderChat.close();
        }

        // Close oldest window if at max
        if (windowOrder.length >= MAX_WINDOWS) {
            var oldest = windowOrder[0];
            closeWindow(oldest);
        }

        // Create window
        var container = document.getElementById('floatingChatContainer');
        if (!container) return;

        var wrapper = document.createElement('div');
        wrapper.innerHTML = createWindowMarkup(cid, opts);
        var el = wrapper.firstChild;
        container.appendChild(el);

        openWindows[cid] = {
            conversationId: cid,
            el: el,
            bubble: null,
            minimized: false,
            peerName: opts.peerName || 'Chat',
            peerAvatar: opts.peerAvatar || defaultAvatar(opts.peerName || 'Chat'),
            isGroup: opts.isGroup || false,
            memberCount: opts.memberCount || 0,
            online: opts.online || false
        };

        windowOrder.push(cid);

        // Bind events
        bindWindowEvents(cid);

        // Position and animate
        positionWindows();
        setTimeout(function () {
            if (el) el.classList.add('is-visible');
        }, 10);

        // Load messages and subscribe to realtime
        loadMessages(cid);
        subscribeRealtime(cid);
        markConversationRead(cid);

        // Focus input
        var input = el.querySelector('.floating-chat-input');
        if (input) {
            setTimeout(function () { input.focus(); }, 100);
        }

        saveState();
    }

    // Close window
    function closeWindow(conversationId) {
        var cid = String(conversationId);
        var w = openWindows[cid];
        if (!w) return;

        if (w.el) {
            w.el.classList.remove('is-visible');
            setTimeout(function () {
                if (w.el && w.el.parentNode) {
                    w.el.parentNode.removeChild(w.el);
                }
            }, 200);
        }

        if (w.bubble && w.bubble.parentNode) {
            w.bubble.parentNode.removeChild(w.bubble);
        }

        delete openWindows[cid];
        var index = windowOrder.indexOf(cid);
        if (index !== -1) {
            windowOrder.splice(index, 1);
        }

        positionWindows();
        saveState();
    }

    // Minimize window
    function minimizeWindow(conversationId) {
        var cid = String(conversationId);
        var w = openWindows[cid];
        if (!w || !w.el) return;

        w.el.classList.add('is-minimized');
        w.minimized = true;

        // Create bubble
        var container = document.getElementById('floatingChatContainer');
        if (!container) return;

        var wrapper = document.createElement('div');
        wrapper.innerHTML = createBubbleMarkup(cid, {
            peerName: w.peerName,
            peerAvatar: w.peerAvatar,
            unread: 0
        });
        w.bubble = wrapper.firstChild;
        container.appendChild(w.bubble);

        w.bubble.addEventListener('click', function () {
            restoreWindow(cid);
        });

        positionWindows();
        saveState();
    }

    // Restore window
    function restoreWindow(conversationId) {
        var cid = String(conversationId);
        var w = openWindows[cid];
        if (!w) return;

        w.el.classList.remove('is-minimized');
        w.minimized = false;

        if (w.bubble && w.bubble.parentNode) {
            w.bubble.parentNode.removeChild(w.bubble);
        }
        w.bubble = null;

        positionWindows();
        focusWindow(cid);
        saveState();

        var input = w.el.querySelector('.floating-chat-input');
        if (input) input.focus();
    }

    // Expand to Messages page
    function expandWindow(conversationId) {
        var url = routes.messagesPage || '/messages';
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'conversation=' + conversationId;
        window.location.href = url;
    }

    // Bind window events
    function bindWindowEvents(conversationId) {
        var cid = String(conversationId);
        var w = openWindows[cid];
        if (!w || !w.el) return;

        // Action buttons
        w.el.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');
            e.preventDefault();

            if (action === 'close') closeWindow(cid);
            else if (action === 'minimize') minimizeWindow(cid);
            else if (action === 'expand') expandWindow(cid);
            else if (action === 'voice') startCall(cid, 'audio');
            else if (action === 'video') startCall(cid, 'video');
        });

        // Form submit
        var form = w.el.querySelector('.floating-chat-composer');
        var input = w.el.querySelector('.floating-chat-input');

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!input) return;

                var body = input.value.trim();
                if (!body) return;

                sendMessage(cid, body).then(function () {
                    input.value = '';
                    input.style.height = 'auto';
                }).catch(function (err) {
                    if (window.Comms && typeof window.Comms.showToast === 'function') {
                        window.Comms.showToast(err.message || 'Failed to send', 'error');
                    }
                });
            });
        }

        // Auto-grow textarea
        if (input) {
            input.addEventListener('input', function () {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 100) + 'px';
            });

            // Enter to send, Shift+Enter for new line
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    form.dispatchEvent(new Event('submit'));
                }
            });

            // Typing indicator
            var typingTimer = null;
            input.addEventListener('input', function () {
                if (window.CommsRealtime && typeof window.CommsRealtime.broadcastTyping === 'function') {
                    clearTimeout(typingTimer);
                    window.CommsRealtime.broadcastTyping(cid);
                    typingTimer = setTimeout(function () {
                        window.CommsRealtime.broadcastTyping(cid, { stop: true });
                    }, 1000);
                }
            });
        }

        // Focus window on click
        w.el.addEventListener('mousedown', function () {
            focusWindow(cid);
        });
    }

    // Start a call
    function startCall(conversationId, callType) {
        if (window.CommsWebRTC && typeof window.CommsWebRTC.startCall === 'function') {
            window.CommsWebRTC.startCall(conversationId, callType);
        }
    }

    // Initialize
    function init() {
        var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
        if (!boot) return;

        currentUserId = Number(boot.dataset.currentUserId || 0);
        portalUserType = boot.dataset.portalUserType || '';

        if (!currentUserId) return;

        // Parse routes
        try {
            routes = JSON.parse(boot.dataset.routes || '{}');
        } catch (e) {
            routes = {};
        }

        // Create container
        var container = document.createElement('div');
        container.id = 'floatingChatContainer';
        container.className = 'floating-chat-container';
        document.body.appendChild(container);

        // Restore state
        var state = loadState();
        if (state && state.windows) {
            state.windows.forEach(function (w) {
                openChatWindow(w.conversationId, {
                    peerName: w.peerName,
                    peerAvatar: w.peerAvatar,
                    isGroup: w.isGroup,
                    memberCount: w.memberCount
                });
                if (w.minimized) {
                    minimizeWindow(w.conversationId);
                }
            });
        }

        // Listen for window resize
        window.addEventListener('resize', positionWindows);

        // Listen for realtime messages
        if (window.onCommsHeaderMessageInsert) {
            var original = window.onCommsHeaderMessageInsert;
            window.onCommsHeaderMessageInsert = function (message) {
                handleRealtimeMessage(message);
                if (typeof original === 'function') original(message);
            };
        } else {
            window.onCommsHeaderMessageInsert = handleRealtimeMessage;
        }

        // Clear state on logout
        document.addEventListener('click', function (e) {
            var logout = e.target.closest('a[href*="logout"], button[href*="logout"]');
            if (logout) {
                clearState();
            }
        });
    }

    // Boot when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export API
    window.CommsFloatingChat = {
        __booted: true,
        open: openChatWindow,
        close: closeWindow,
        minimize: minimizeWindow,
        restore: restoreWindow
    };

    // Make openChatWindow globally accessible
    window.openChatWindow = openChatWindow;
})();
