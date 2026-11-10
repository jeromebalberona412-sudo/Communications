/**
 * Message load/send/render, attachments, scroll, realtime for floating chat.
 */
export function attachThread(ctx) {
    ctx.messageCacheKey = function (conversationId) {
        return 'commsFloatMsgs.' + ctx.currentUserId + '.' + conversationId;
    };

    ctx.readMessageCache = function (key) {
        try {
            var raw = sessionStorage.getItem(key);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return parsed && Array.isArray(parsed.messages) ? parsed.messages : null;
        } catch (e) {
            return null;
        }
    };

    ctx.writeMessageCache = function (key, messages) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ messages: messages, ts: Date.now() }));
        } catch (e) { /* ignore */ }
    };

    ctx.callStatusClass = function (body) {
        var text = String(body || '').toLowerCase();
        var base = 'floating-chat-msg is-system comms-bubble--call';
        if (text.indexOf('declined') !== -1) return base + ' comms-bubble--call-declined';
        if (text.indexOf('cancelled') !== -1 || text.indexOf('canceled') !== -1) return base + ' comms-bubble--call-cancelled';
        if (text.indexOf('missed') !== -1 || text.indexOf('no pickup') !== -1) return base + ' comms-bubble--call-missed';
        if (text.indexOf('ended') !== -1) return base + ' comms-bubble--call-ended';
        if (text.indexOf('answered') !== -1) return base + ' comms-bubble--call-answered';
        if (text.indexOf('ringing') !== -1) return base + ' comms-bubble--call-ringing';
        if (text.indexOf('started') !== -1) return base + ' comms-bubble--call-started';
        return base;
    };

    ctx.renderAttachmentHtml = function (attachments) {
        if (!attachments || !attachments.length) return '';
        return attachments.map(function (a) {
            var url = a.url || a.download_url || '';
            var name = a.file_name || 'File';
            var isImg = a.file_type === 'image' || String(a.mime_type || '').indexOf('image/') === 0;
            if (isImg && url) {
                return '<a class="floating-chat-img-link" href="' + ctx.escapeHtml(url) + '" target="_blank" rel="noopener">' +
                    '<img class="floating-chat-img" src="' + ctx.escapeHtml(url) + '" alt="' + ctx.escapeHtml(name) + '"></a>';
            }
            return '<a class="floating-chat-file" href="' + ctx.escapeHtml(url) + '" target="_blank" rel="noopener">' + ctx.escapeHtml(name) + '</a>';
        }).join('');
    };

    ctx.isNearBottom = function (el) {
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    };

    ctx.syncJumpButton = function (w) {
        if (!w || !w.el) return;
        var bodyEl = w.el.querySelector('.floating-chat-body');
        var jumpBtn = w.el.querySelector('.floating-chat-jump');
        if (!jumpBtn || !bodyEl) return;
        jumpBtn.hidden = ctx.isNearBottom(bodyEl);
    };

    ctx.stickFloatingBody = function (bodyEl) {
        if (!bodyEl) return;
        var wrap = bodyEl.closest('.floating-chat-window');
        var cid = wrap ? wrap.getAttribute('data-conversation-id') : '';
        var w = cid ? ctx.openWindows[String(cid)] : null;
        if (!w || w.stickBottom !== false) {
            bodyEl.scrollTop = bodyEl.scrollHeight;
            if (w) w.stickBottom = true;
        }
        if (w) ctx.syncJumpButton(w);
    };

    ctx.renderMessages = function (bodyEl, messages) {
        if (!bodyEl) return;
        if (!messages.length) {
            bodyEl.innerHTML = '<div class="floating-chat-empty">No messages yet</div>';
            return;
        }
        var rows = messages.slice().reverse();
        var html = rows.map(function (m) {
            var mine = Number(m.sender_id) === Number(ctx.currentUserId);
            var time = ctx.formatTime(m.created_at);
            var body = ctx.escapeHtml(m.body || '');
            if (m.message_type === 'call' || m.message_type === 'system') {
                return '<div class="' + ctx.callStatusClass(m.body) + '">' +
                    '<div class="floating-chat-msg-body comms-call-text">' + body + '</div>' +
                    '</div>';
            }
            return '<div class="floating-chat-msg ' + (mine ? 'is-mine' : 'is-theirs') + '">' +
                ctx.renderAttachmentHtml(m.attachments) +
                (body ? '<div class="floating-chat-msg-body">' + body + '</div>' : '') +
                '<div class="floating-chat-msg-time">' + time + '</div>' +
                '</div>';
        }).join('');
        bodyEl.innerHTML = html;
        ctx.stickFloatingBody(bodyEl);
    };

    ctx.appendMessageToWindow = function (conversationId, message) {
        var w = ctx.openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var mine = message.mine || Number(message.sender_id) === Number(ctx.currentUserId);
        var time = ctx.formatTime(message.created_at);
        var body = ctx.escapeHtml(message.body || '');

        if (message.message_type === 'call' || message.message_type === 'system') {
            var msgEl = document.createElement('div');
            msgEl.className = ctx.callStatusClass(message.body);
            msgEl.innerHTML = '<div class="floating-chat-msg-body comms-call-text">' + body + '</div>';
            msgEl.dataset.messageId = message.id;
            bodyEl.appendChild(msgEl);
        } else {
            var msgEl2 = document.createElement('div');
            msgEl2.className = 'floating-chat-msg ' + (mine ? 'is-mine' : 'is-theirs');
            msgEl2.dataset.messageId = message.id;
            msgEl2.innerHTML = ctx.renderAttachmentHtml(message.attachments) +
                (body ? '<div class="floating-chat-msg-body">' + body + '</div>' : '') +
                '<div class="floating-chat-msg-time">' + time + '</div>';
            bodyEl.appendChild(msgEl2);
        }

        ctx.stickFloatingBody(bodyEl);
    };

    ctx.replaceMessageInWindow = function (conversationId, tempId, realMessage) {
        var w = ctx.openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var tempEl = bodyEl.querySelector('[data-message-id="' + tempId + '"]');
        if (tempEl) {
            tempEl.dataset.messageId = realMessage.id;
            tempEl.classList.remove('is-sending');
        }
    };

    ctx.markMessageFailed = function (conversationId, messageId) {
        var w = ctx.openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var msgEl = bodyEl.querySelector('[data-message-id="' + messageId + '"]');
        if (msgEl) {
            msgEl.classList.add('is-failed');
        }
    };

    ctx.loadMessages = function (conversationId) {
        var w = ctx.openWindows[String(conversationId)];
        if (!w || !w.el) return;

        var bodyEl = w.el.querySelector('.floating-chat-body');
        if (!bodyEl) return;

        var url = ctx.routes.messages ? ctx.routes.messages.replace('__ID__', conversationId) : null;
        if (!url || !window.Comms) return;

        var cacheKey = ctx.messageCacheKey(conversationId);
        var cached = ctx.readMessageCache(cacheKey);
        var shared = window.Comms.readThreadCache ? window.Comms.readThreadCache(conversationId) : null;
        var sharedMessages = shared && Array.isArray(shared.messages) ? shared.messages : null;
        var instant = (cached && cached.length) ? cached : sharedMessages;
        if (instant && instant.length) {
            ctx.renderMessages(bodyEl, instant);
        } else if (!bodyEl.childNodes.length) {
            bodyEl.innerHTML = '';
        }

        window.Comms.api(url + '?per_page=20', { dedupe: true }).then(function (data) {
            var messages = (data && data.messages) || [];
            if (!messages.length) {
                if (!instant || !instant.length) {
                    bodyEl.innerHTML = '<div class="floating-chat-empty">No messages yet</div>';
                }
                return;
            }

            ctx.writeMessageCache(cacheKey, messages);
            if (window.Comms.writeThreadCache) {
                window.Comms.writeThreadCache(conversationId, {
                    messages: messages,
                    reactionEmojis: (data && data.reaction_emojis) || [],
                    ts: Date.now()
                });
            }
            ctx.renderMessages(bodyEl, messages);
        }).catch(function () {
            if (!instant || !instant.length) {
                bodyEl.innerHTML = '<div class="floating-chat-empty">Unable to load messages</div>';
            }
        });
    };

    ctx.sendMessage = function (conversationId, body) {
        if (!body || !window.Comms) return Promise.reject(new Error('No message'));

        var url = ctx.routes.messages ? ctx.routes.messages.replace('__ID__', conversationId) : null;
        if (!url) return Promise.reject(new Error('No URL'));

        var tempId = 'temp-' + Date.now();
        ctx.appendMessageToWindow(conversationId, {
            id: tempId,
            body: body,
            sender_id: ctx.currentUserId,
            mine: true,
            created_at: new Date().toISOString(),
            message_type: 'text'
        });

        return window.Comms.api(url, {
            method: 'POST',
            body: JSON.stringify({ body: body, message_type: 'text' })
        }).then(function (data) {
            var msg = (data && data.message) || {};
            ctx.replaceMessageInWindow(conversationId, tempId, msg);
            return msg;
        }).catch(function (err) {
            ctx.markMessageFailed(conversationId, tempId);
            throw err;
        });
    };

    ctx.sendFiles = function (conversationId, fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length || !window.Comms) return;
        var url = ctx.routes.messages ? ctx.routes.messages.replace('__ID__', conversationId) : null;
        if (!url) return;
        files.forEach(function (file) {
            var isImage = String(file.type || '').indexOf('image/') === 0;
            var blobUrl = isImage ? URL.createObjectURL(file) : '';
            var tempId = 'temp-att-' + Date.now() + '-' + Math.random().toString(16).slice(2);
            ctx.appendMessageToWindow(conversationId, {
                id: tempId,
                body: '',
                sender_id: ctx.currentUserId,
                mine: true,
                created_at: new Date().toISOString(),
                message_type: isImage ? 'image' : 'file',
                attachments: [{
                    file_name: file.name,
                    file_type: isImage ? 'image' : 'file',
                    mime_type: file.type,
                    url: blobUrl || '',
                    download_url: blobUrl || '#'
                }]
            });
            var form = new FormData();
            form.append('attachment', file, file.name);
            window.Comms.api(url, { method: 'POST', body: form, dedupe: false }).then(function (data) {
                var msg = (data && data.message) || {};
                ctx.replaceMessageInWindow(conversationId, tempId, msg);
            }).catch(function (err) {
                ctx.markMessageFailed(conversationId, tempId);
                if (window.Comms && typeof window.Comms.showToast === 'function') {
                    window.Comms.showToast((err && err.message) || 'Failed to send file', 'error');
                }
            });
        });
    };

    ctx.markConversationRead = function (conversationId) {
        if (!ctx.routes.read || !window.Comms) return;

        var url = ctx.routes.read.replace('__ID__', conversationId);
        window.Comms.api(url, { method: 'POST', body: '{}', dedupe: true }).then(function () {
            if (window.CommsRealtime && typeof window.CommsRealtime.zeroConversationUnread === 'function') {
                window.CommsRealtime.zeroConversationUnread(conversationId);
            }
            if (window.CommsRealtime && typeof window.CommsRealtime.refreshUnread === 'function') {
                window.CommsRealtime.refreshUnread();
            }
        }).catch(function () { /* ignore */ });
    };

    ctx.subscribeRealtime = function (conversationId) {
        if (window.CommsRealtime && typeof window.CommsRealtime.subscribeConversation === 'function') {
            window.CommsRealtime.subscribeConversation(conversationId);
        }
    };

    ctx.handleRealtimeMessage = function (message) {
        var cid = String(message.conversation_id);
        if (!ctx.openWindows[cid]) return;

        if (Number(message.sender_id) === Number(ctx.currentUserId)) return;

        ctx.appendMessageToWindow(cid, message);

        if (!ctx.openWindows[cid].minimized && document.visibilityState !== 'hidden') {
            ctx.markConversationRead(cid);
        }
    };
}
