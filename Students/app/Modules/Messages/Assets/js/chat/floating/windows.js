/**
 * Floating chat window markup, positioning, open/close/focus, event binding.
 */
import { loadWebrtc } from '../../webrtc/load.js';

export function attachWindows(ctx) {
    ctx.createWindowMarkup = function (conversationId, opts) {
        opts = opts || {};
        var peerName = opts.peerName || 'Chat';
        var peerAvatar = opts.peerAvatar || ctx.defaultAvatar(peerName);
        var online = opts.online || false;
        var isGroup = opts.isGroup || false;
        var memberCount = opts.memberCount || 0;
        var statusText = isGroup
            ? (memberCount > 0 ? memberCount + ' members' : 'Group')
            : (online ? 'Online' : '');

        var statusInner = isGroup
            ? ctx.escapeHtml(statusText)
            : (online ? '<span class="floating-chat-presence-dot" aria-hidden="true"></span> Active now' : '');

        var html = '<div class="floating-chat-window" id="floatingChat' + conversationId + '" data-conversation-id="' + conversationId + '">' +
            '<div class="floating-chat-header">' +
            '<button type="button" class="floating-chat-btn floating-chat-back" data-action="back" title="Back" aria-label="Back">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' +
            '</button>' +
            '<div class="floating-chat-peer">' +
            '<img class="floating-chat-avatar" src="' + ctx.escapeHtml(peerAvatar) + '" alt="" width="32" height="32" ' +
            'onerror="this.onerror=null;this.src=\'' + ctx.escapeHtml(ctx.defaultAvatar(peerName)) + '\'">' +
            '<div class="floating-chat-peer-info">' +
            '<div class="floating-chat-peer-name" title="' + ctx.escapeHtml(peerName) + '">' + ctx.escapeHtml(peerName) + '</div>' +
            (statusInner ? '<div class="floating-chat-peer-status">' + statusInner + '</div>' : '') +
            '</div></div>' +
            '<div class="floating-chat-actions">' +
            '<button type="button" class="floating-chat-btn" data-action="voice" title="Voice call" aria-label="Voice call">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>' +
            '</button>' +
            '<button type="button" class="floating-chat-btn" data-action="video" title="Video call" aria-label="Video call">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' +
            '</button>' +
            '<button type="button" class="floating-chat-btn" data-action="close" title="Close" aria-label="Close">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>' +
            '</button>' +
            '</div></div>' +
            '<div class="floating-chat-body-wrap">' +
            '<div class="floating-chat-body" id="floatingChatBody' + conversationId + '"></div>' +
            '<button type="button" class="floating-chat-jump" hidden title="Latest messages" aria-label="Jump to latest messages">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
            '</button></div>' +
            '<div class="floating-chat-typing" id="floatingChatTyping' + conversationId + '" hidden></div>' +
            '<form class="floating-chat-composer" id="floatingChatForm' + conversationId + '" autocomplete="off">' +
            '<input type="file" class="floating-chat-visually-hidden floating-chat-camera-input" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">' +
            '<input type="file" class="floating-chat-visually-hidden floating-chat-photo-input" accept="image/jpeg,image/png,image/webp,image/gif" multiple tabindex="-1" aria-hidden="true">' +
            '<input type="file" class="floating-chat-visually-hidden floating-chat-file-input" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,image/*" multiple tabindex="-1" aria-hidden="true">' +
            '<div class="floating-chat-attach-wrap">' +
            '<button type="button" class="floating-chat-attach-btn" data-action="attach" title="Attach" aria-label="Attach" aria-expanded="false">' +
            '<span aria-hidden="true">+</span>' +
            '</button>' +
            '<div class="floating-chat-attach-menu" hidden>' +
            '<button type="button" data-action="camera">Camera</button>' +
            '<button type="button" data-action="photos">Photos</button>' +
            '<button type="button" data-action="files">Files</button>' +
            '</div></div>' +
            '<textarea class="floating-chat-input" id="floatingChatInput' + conversationId + '" rows="1" placeholder="Type a message" aria-label="Type a message"></textarea>' +
            '<button type="submit" class="floating-chat-send-btn" title="Send" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '</button>' +
            '</form>' +
            '</div>';

        return html;
    };

    ctx.createBubbleMarkup = function (conversationId, opts) {
        opts = opts || {};
        var peerName = opts.peerName || 'Chat';
        var peerAvatar = opts.peerAvatar || ctx.defaultAvatar(peerName);
        var unread = opts.unread || 0;

        return '<button type="button" class="floating-chat-bubble" id="floatingBubble' + conversationId + '" ' +
            'data-conversation-id="' + conversationId + '" title="' + ctx.escapeHtml(peerName) + '" aria-label="' + ctx.escapeHtml(peerName) + '">' +
            '<img src="' + ctx.escapeHtml(peerAvatar) + '" alt="" width="48" height="48" ' +
            'onerror="this.onerror=null;this.src=\'' + ctx.escapeHtml(ctx.defaultAvatar(peerName)) + '\'">' +
            (unread > 0 ? '<span class="floating-chat-bubble-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
            '</button>';
    };

    ctx.positionWindows = function () {
        var container = document.getElementById('floatingChatContainer');
        if (!container) return;

        var isMobile = window.innerWidth < 768;
        if (isMobile) {
            ctx.windowOrder.forEach(function (cid) {
                var w = ctx.openWindows[cid];
                if (!w || !w.el) return;
                w.el.classList.add('is-mobile');
                w.el.style.right = '0';
                w.el.style.bottom = '0';
                w.el.style.width = '100%';
                w.el.style.height = '100dvh';
            });
            return;
        }

        var visibleWindows = ctx.windowOrder.filter(function (cid) {
            return ctx.openWindows[cid] && !ctx.openWindows[cid].minimized;
        });
        var visibleBubbles = ctx.windowOrder.filter(function (cid) {
            return ctx.openWindows[cid] && ctx.openWindows[cid].minimized;
        });

        visibleWindows.forEach(function (cid, index) {
            var w = ctx.openWindows[cid];
            if (!w || !w.el) return;
            w.el.classList.remove('is-mobile', 'is-minimized');
            w.el.style.right = (ctx.WINDOW_GAP + index * (ctx.WINDOW_WIDTH + ctx.WINDOW_GAP)) + 'px';
            w.el.style.top = '64px';
            w.el.style.bottom = 'auto';
            w.el.style.width = ctx.WINDOW_WIDTH + 'px';
            w.el.style.height = ctx.WINDOW_HEIGHT_DESKTOP + 'px';
        });

        visibleBubbles.forEach(function (cid, index) {
            var w = ctx.openWindows[cid];
            if (!w || !w.bubble) return;
            w.bubble.style.right = (ctx.WINDOW_GAP + (visibleWindows.length + index) * (56 + 12)) + 'px';
            w.bubble.style.bottom = ctx.WINDOW_GAP + 'px';
        });
    };

    ctx.focusWindow = function (conversationId) {
        var cid = String(conversationId);
        var index = ctx.windowOrder.indexOf(cid);
        if (index === -1) return;

        ctx.windowOrder.splice(index, 1);
        ctx.windowOrder.push(cid);

        ctx.windowOrder.forEach(function (id, i) {
            var w = ctx.openWindows[id];
            if (w && w.el) {
                w.el.style.zIndex = String(10000 + i);
            }
        });

        ctx.saveState();
    };

    ctx.hideAttachMenu = function (el) {
        if (!el) return;
        var menu = el.querySelector('.floating-chat-attach-menu');
        var btn = el.querySelector('[data-action="attach"]');
        if (menu) menu.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
    };

    ctx.isCallActive = function () {
        var inCall = document.getElementById('commsInCall');
        if (inCall && !inCall.hidden) return true;
        return !!(window.CommsWebRTC && typeof window.CommsWebRTC.__meshActive === 'function' && window.CommsWebRTC.__meshActive());
    };

    ctx.goBackToList = function (conversationId) {
        ctx.closeWindow(conversationId);
        if (window.CommsHeaderChat && typeof window.CommsHeaderChat.open === 'function') {
            window.CommsHeaderChat.open();
        }
    };

    ctx.startCall = function (conversationId, callType) {
        if (ctx.isCallActive()) return;
        var type = callType === 'audio' ? 'voice' : callType;
        var w = ctx.openWindows[String(conversationId)];
        var conversation = w && w.isGroup
            ? { id: Number(conversationId), conversation_type: 'group', is_default_group: true }
            : null;
        loadWebrtc().then(function (api) {
            if (api && typeof api.startCall === 'function') {
                api.startCall(conversationId, type, conversation);
            }
        }).catch(function (err) {
            if (window.Comms && typeof window.Comms.showToast === 'function') {
                window.Comms.showToast((err && err.message) || 'Unable to start call', 'error');
            }
        });
    };

    ctx.expandWindow = function (conversationId) {
        var url = ctx.routes.messagesPage || '/messages';
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'conversation=' + conversationId;
        window.location.href = url;
    };

    ctx.closeWindow = function (conversationId) {
        var cid = String(conversationId);
        var w = ctx.openWindows[cid];
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

        delete ctx.openWindows[cid];
        var index = ctx.windowOrder.indexOf(cid);
        if (index !== -1) {
            ctx.windowOrder.splice(index, 1);
        }

        ctx.positionWindows();
        ctx.saveState();
    };

    ctx.minimizeWindow = function (conversationId) {
        var cid = String(conversationId);
        var w = ctx.openWindows[cid];
        if (!w || !w.el) return;

        w.el.classList.add('is-minimized');
        w.minimized = true;

        var container = document.getElementById('floatingChatContainer');
        if (!container) return;

        var wrapper = document.createElement('div');
        wrapper.innerHTML = ctx.createBubbleMarkup(cid, {
            peerName: w.peerName,
            peerAvatar: w.peerAvatar,
            unread: 0
        });
        w.bubble = wrapper.firstChild;
        container.appendChild(w.bubble);

        w.bubble.addEventListener('click', function () {
            ctx.restoreWindow(cid);
        });

        ctx.positionWindows();
        ctx.saveState();
    };

    ctx.restoreWindow = function (conversationId) {
        var cid = String(conversationId);
        var w = ctx.openWindows[cid];
        if (!w) return;

        w.el.classList.remove('is-minimized');
        w.minimized = false;

        if (w.bubble && w.bubble.parentNode) {
            w.bubble.parentNode.removeChild(w.bubble);
        }
        w.bubble = null;

        ctx.positionWindows();
        ctx.focusWindow(cid);
        ctx.saveState();

        var input = w.el.querySelector('.floating-chat-input');
        if (input) input.focus();
    };

    ctx.bindWindowEvents = function (conversationId) {
        var cid = String(conversationId);
        var w = ctx.openWindows[cid];
        if (!w || !w.el) return;

        w.el.addEventListener('click', function (e) {
            var more = e.target.closest('[data-float-more]');
            if (more) {
                e.preventDefault();
                e.stopPropagation();
                var menuId = more.getAttribute('data-float-more');
                var menu = w.el.querySelector('[data-float-menu="' + menuId + '"]');
                w.el.querySelectorAll('[data-float-menu]').forEach(function (item) {
                    if (item !== menu) item.hidden = true;
                });
                if (menu) menu.hidden = !menu.hidden;
                return;
            }
            var del = e.target.closest('[data-float-delete]');
            if (del) {
                e.preventDefault();
                e.stopPropagation();
                w.el.querySelectorAll('[data-float-menu]').forEach(function (item) { item.hidden = true; });
                ctx.deleteFloatingMessage(cid, del.getAttribute('data-float-delete'), del.getAttribute('data-float-mine') === '1');
                return;
            }
            var btn = e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');
            e.preventDefault();

            if (action === 'close') ctx.closeWindow(cid);
            else if (action === 'back') ctx.goBackToList(cid);
            else if (action === 'minimize') ctx.minimizeWindow(cid);
            else if (action === 'expand') ctx.expandWindow(cid);
            else if (action === 'voice') ctx.startCall(cid, 'voice');
            else if (action === 'video') ctx.startCall(cid, 'video');
            else if (action === 'attach') {
                var menu = w.el.querySelector('.floating-chat-attach-menu');
                if (menu) {
                    menu.hidden = !menu.hidden;
                    btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
                }
            } else if (action === 'camera') {
                ctx.hideAttachMenu(w.el);
                var cam = w.el.querySelector('.floating-chat-camera-input');
                if (cam) cam.click();
            } else if (action === 'photos') {
                ctx.hideAttachMenu(w.el);
                var photos = w.el.querySelector('.floating-chat-photo-input');
                if (photos) photos.click();
            }             else if (action === 'files') {
                ctx.hideAttachMenu(w.el);
                var files = w.el.querySelector('.floating-chat-file-input');
                if (files) files.click();
            }
        });

        document.addEventListener('click', function (ev) {
            if (!w.el || ev.target.closest('[data-float-more]') || ev.target.closest('[data-float-menu]')) return;
            w.el.querySelectorAll('[data-float-menu]').forEach(function (item) { item.hidden = true; });
        });

        var cameraInput = w.el.querySelector('.floating-chat-camera-input');
        var photoInput = w.el.querySelector('.floating-chat-photo-input');
        var fileInput = w.el.querySelector('.floating-chat-file-input');
        if (cameraInput) {
            cameraInput.addEventListener('change', function () {
                ctx.sendFiles(cid, cameraInput.files);
                cameraInput.value = '';
            });
        }
        if (photoInput) {
            photoInput.addEventListener('change', function () {
                ctx.sendFiles(cid, photoInput.files);
                photoInput.value = '';
            });
        }
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                ctx.sendFiles(cid, fileInput.files);
                fileInput.value = '';
            });
        }

        var form = w.el.querySelector('.floating-chat-composer');
        var input = w.el.querySelector('.floating-chat-input');

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!input) return;

                var body = input.value.trim();
                if (!body || form.dataset.sending === '1') return;
                form.dataset.sending = '1';

                ctx.sendMessage(cid, body).then(function () {
                    if (input.value.trim() === body) {
                        input.value = '';
                        input.style.height = 'auto';
                    }
                }).catch(function (err) {
                    if (window.Comms && typeof window.Comms.showToast === 'function') {
                        window.Comms.showToast(err.message || 'Failed to send', 'error');
                    }
                }).finally(function () {
                    delete form.dataset.sending;
                });
            });
        }

        if (input) {
            input.addEventListener('input', function () {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 100) + 'px';
            });

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    form.dispatchEvent(new Event('submit'));
                }
            });

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

        var bodyEl = w.el.querySelector('.floating-chat-body');
        var jumpBtn = w.el.querySelector('.floating-chat-jump');
        if (bodyEl) {
            bodyEl.addEventListener('scroll', function () {
                w.stickBottom = ctx.isNearBottom(bodyEl);
                ctx.syncJumpButton(w);
            });
        }
        if (jumpBtn) {
            jumpBtn.addEventListener('click', function () {
                if (!bodyEl) return;
                bodyEl.scrollTo({ top: bodyEl.scrollHeight, behavior: 'smooth' });
                w.stickBottom = true;
                jumpBtn.hidden = true;
            });
        }

        w.el.addEventListener('mousedown', function () {
            ctx.focusWindow(cid);
        });
    };

    ctx.openChatWindow = function (conversationId, opts) {
        opts = opts || {};

        if (ctx.isOnMessagesPage()) {
            var navUrl = ctx.routes.messagesPage || '/messages';
            navUrl += (navUrl.indexOf('?') === -1 ? '?' : '&') + 'conversation=' + conversationId;
            window.location.href = navUrl;
            return;
        }

        var cid = String(conversationId);

        if (ctx.openWindows[cid]) {
            if (ctx.openWindows[cid].minimized) {
                ctx.restoreWindow(cid);
            } else {
                ctx.focusWindow(cid);
            }
            return;
        }

        if (window.CommsHeaderChat && typeof window.CommsHeaderChat.close === 'function') {
            window.CommsHeaderChat.close();
        }

        if (ctx.windowOrder.length >= ctx.MAX_WINDOWS) {
            var oldest = ctx.windowOrder[0];
            ctx.closeWindow(oldest);
        }

        var container = document.getElementById('floatingChatContainer');
        if (!container) return;

        var wrapper = document.createElement('div');
        wrapper.innerHTML = ctx.createWindowMarkup(cid, opts);
        var el = wrapper.firstChild;
        container.appendChild(el);

        ctx.openWindows[cid] = {
            conversationId: cid,
            el: el,
            bubble: null,
            minimized: false,
            peerName: opts.peerName || 'Chat',
            peerAvatar: opts.peerAvatar || ctx.defaultAvatar(opts.peerName || 'Chat'),
            isGroup: opts.isGroup || false,
            memberCount: opts.memberCount || 0,
            online: opts.online || false,
            stickBottom: true
        };

        ctx.windowOrder.push(cid);

        ctx.bindWindowEvents(cid);

        ctx.positionWindows();
        if (el) el.classList.add('is-visible');

        ctx.loadMessages(cid);
        ctx.subscribeRealtime(cid);
        ctx.markConversationRead(cid);

        var focusInput = el.querySelector('.floating-chat-input');
        if (focusInput) focusInput.focus();

        ctx.saveState();
    };
}
