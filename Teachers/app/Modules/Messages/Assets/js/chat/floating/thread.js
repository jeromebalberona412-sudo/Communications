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

    ctx.floatReactionEmojis = ctx.floatReactionEmojis || ['👍', '❤️', '😆', '😮', '😢', '🙏'];

    ctx.reactionChipsHtml = function (message) {
        var items = Array.isArray(message && message.reactions) ? message.reactions : [];
        items = items.filter(function (item) { return Number(item && item.count || 0) > 0; });
        if (!items.length || !message || message.id == null) return '';
        return '<div class="comms-reaction-chips" role="group" aria-label="Reactions">' +
            items.map(function (item) {
                var count = Number(item.count || 0);
                var mine = Array.isArray(item.users)
                    ? item.users.some(function (user) { return Number(user.id) === Number(ctx.currentUserId) && user.mine; })
                    : !!item.mine;
                return '<button type="button" class="comms-reaction-summary' + (mine ? ' is-mine' : '') + '"' +
                    ' data-react-people="' + Number(message.id) + '"' +
                    ' data-react-people-emoji="' + ctx.escapeHtml(item.emoji || '') + '"' +
                    ' aria-label="' + ctx.escapeHtml(item.emoji || '') + ' ' + count + ' reactions">' +
                    '<span class="comms-reaction-stack-btn" aria-hidden="true">' + ctx.escapeHtml(item.emoji || '') + '</span>' +
                    '<span class="comms-reaction-count' + (count <= 1 ? ' is-single' : '') + '" aria-hidden="true">' + count + '</span>' +
                    '</button>';
            }).join('') +
            '</div>';
    };

    ctx.floatReactButtonHtml = function (message) {
        if (!message || message.id == null) return '';
        var id = String(message.id);
        if (id.indexOf('temp') === 0 || id.indexOf('local-') === 0) return '';
        if (message.message_type === 'deleted' || message.deleted_for_all) return '';
        return '<button type="button" class="comms-react-btn" data-float-react="' + ctx.escapeHtml(id) + '" aria-label="Add reaction" title="React">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg>' +
            '</button>';
    };

    ctx.sendFloatingReaction = function (conversationId, messageId, emoji) {
        var route = ctx.routes && ctx.routes.react;
        if (!route || !messageId || !emoji || !window.Comms || typeof window.Comms.api !== 'function') return;
        window.Comms.api(window.Comms.route(route, messageId), {
            method: 'POST',
            body: JSON.stringify({ emoji: emoji }),
            dedupe: false
        }).then(function (data) {
            ctx.applyFloatingReaction(messageId, (data && data.reactions) || []);
        }).catch(function (err) {
            if (window.Comms.showToast) {
                window.Comms.showToast((err && err.message) || 'Unable to react.', 'error');
            }
        });
    };

    ctx.applyFloatingReaction = function (messageId, reactions) {
        var id = String(messageId);
        Object.keys(ctx.threadMessages || {}).forEach(function (cid) {
            (ctx.threadMessages[cid] || []).forEach(function (row) {
                if (String(row.id) === id) row.reactions = reactions;
            });
        });
        Object.keys(ctx.openWindows || {}).forEach(function (cid) {
            var w = ctx.openWindows[cid];
            var rowEl = w && w.el ? w.el.querySelector('[data-message-id="' + id + '"]') : null;
            if (!rowEl) return;
            var old = rowEl.querySelector('.comms-reaction-chips');
            if (old) old.remove();
            var html = ctx.reactionChipsHtml({ id: messageId, reactions: reactions });
            if (html) rowEl.insertAdjacentHTML('beforeend', html);
        });
    };

    ctx.messageActionsHtml = function (message, mine) {
        if (!message || message.id == null) return '';
        var id = String(message.id);
        if (id.indexOf('temp') === 0 || id.indexOf('local-') === 0) return '';
        if (String(id).indexOf('temp-') === 0) return '';
        var deleted = message.message_type === 'deleted' || message.deleted_for_all;
        var canEdit = !deleted && !!mine && message.message_type === 'text';
        return '<div class="floating-chat-msg-actions">' +
            '<button type="button" class="floating-chat-more" data-float-more="' + ctx.escapeHtml(id) + '" aria-label="Message options">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="5" r="1.7" fill="currentColor"></circle><circle cx="12" cy="12" r="1.7" fill="currentColor"></circle><circle cx="12" cy="19" r="1.7" fill="currentColor"></circle></svg>' +
            '</button>' +
            '<div class="floating-chat-menu" data-float-menu="' + ctx.escapeHtml(id) + '" hidden>' +
            (canEdit ? '<button type="button" data-float-edit="' + ctx.escapeHtml(id) + '">Edit</button>' : '') +
            '<button type="button" data-float-delete="' + ctx.escapeHtml(id) + '" data-float-mine="' + (mine ? '1' : '0') + '">Delete</button>' +
            '</div></div>';
    };

    ctx.applyFloatingDelete = function (conversationId, messageId, scope, message) {
        var w = ctx.openWindows[String(conversationId)];
        var bodyEl = w && w.el ? w.el.querySelector('.floating-chat-body') : null;
        var row = bodyEl ? bodyEl.querySelector('[data-message-id="' + messageId + '"]') : null;
        if (row) {
            if (scope === 'me') {
                row.parentNode.removeChild(row);
            } else {
                var text = (message && message.body) || 'This message was deleted';
                var bubble = row.querySelector('.floating-chat-msg-body');
                if (bubble) bubble.textContent = text;
                var actions = row.querySelector('.floating-chat-msg-actions');
                if (actions) actions.parentNode.removeChild(actions);
                row.classList.add('is-deleted');
            }
        }
        var key = ctx.messageCacheKey(conversationId);
        var cached = ctx.readMessageCache(key) || [];
        if (scope === 'me') {
            cached = cached.filter(function (item) { return String(item.id) !== String(messageId); });
        } else {
            cached = cached.map(function (item) {
                if (String(item.id) !== String(messageId)) return item;
                return Object.assign({}, item, message || {}, {
                    body: (message && message.body) || 'This message was deleted',
                    message_type: 'deleted',
                    deleted_for_all: true
                });
            });
        }
        ctx.writeMessageCache(key, cached);
    };

    ctx.saveFloatingEdit = function (conversationId, messageId, body) {
        var route = ctx.routes && ctx.routes.updateMessage;
        if (!route || !window.Comms || typeof window.Comms.api !== 'function') return;
        var text = String(body || '').trim();
        if (!text) return;
        window.Comms.api(window.Comms.route(route, messageId), {
            method: 'PATCH',
            body: JSON.stringify({ body: text }),
            dedupe: false
        }).then(function (data) {
            var message = data && data.message;
            var w = ctx.openWindows[String(conversationId)];
            var row = w && w.el ? w.el.querySelector('[data-message-id="' + messageId + '"]') : null;
            var bubble = row ? row.querySelector('.floating-chat-msg-body') : null;
            if (bubble) bubble.textContent = (message && message.body) || text;
            var key = ctx.messageCacheKey(conversationId);
            var cached = ctx.readMessageCache(key) || [];
            ctx.writeMessageCache(key, cached.map(function (item) {
                if (String(item.id) !== String(messageId)) return item;
                return Object.assign({}, item, message || {}, { body: (message && message.body) || text, edited: true });
            }));
            if (window.CommsChat && message && typeof window.CommsChat.onMessageChange === 'function') {
                window.CommsChat.onMessageChange(message);
            }
        }).catch(function (err) {
            if (window.Comms && window.Comms.showToast) {
                window.Comms.showToast((err && err.message) || 'Unable to edit message.', 'error');
            }
        });
    };

    ctx.deleteFloatingMessage = function (conversationId, messageId, mine) {
        var route = ctx.routes && ctx.routes.deleteMessage;
        if (!route || !window.Comms || typeof window.Comms.api !== 'function') return;
        var canDeleteAll = !!mine;
        var ask = typeof window.Comms.openDeleteMessageDialog === 'function'
            ? window.Comms.openDeleteMessageDialog({ canDeleteAll: canDeleteAll })
            : Promise.resolve(canDeleteAll ? 'all' : 'me');
        ask.then(function (scope) {
            if (!scope) return null;
            return window.Comms.api(window.Comms.route(route, messageId) + '?scope=' + encodeURIComponent(scope), {
                method: 'DELETE',
                body: JSON.stringify({ scope: scope }),
                dedupe: false
            }).then(function (data) {
                var applied = (data && data.scope) || scope;
                ctx.applyFloatingDelete(conversationId, messageId, applied, data && data.message);
                if (window.CommsChat && data && data.message && typeof window.CommsChat.onMessageChange === 'function') {
                    window.CommsChat.onMessageChange(data.message);
                } else if (applied === 'me' && window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
                    window.CommsChat.reloadActiveMessages();
                }
                if (window.Comms.showToast) {
                    window.Comms.showToast(applied === 'me' ? 'Message deleted for you.' : 'Message deleted for everyone.', 'success');
                }
            }).catch(function (err) {
                if (window.Comms.showToast) {
                    window.Comms.showToast((err && err.message) || 'Unable to delete message.', 'error');
                }
            });
        });
    };

    ctx.threadMessages = ctx.threadMessages || {};

    function messageOrder(message) {
        var raw = String(message && message.id != null ? message.id : '');
        if (raw.indexOf('temp-') === 0) return Number.MAX_SAFE_INTEGER;
        var id = Number(raw);
        return isFinite(id) ? id : Number.MAX_SAFE_INTEGER - 1;
    }

    function mergeThreadMessages(current, incoming) {
        var byId = Object.create(null);
        (current || []).concat(incoming || []).forEach(function (message) {
            if (!message || message.id == null) return;
            byId[String(message.id)] = message;
        });
        var list = Object.keys(byId).map(function (key) { return byId[key]; });
        list.sort(function (a, b) { return messageOrder(a) - messageOrder(b); });
        var savedBody = Object.create(null);
        list.forEach(function (message) {
            if (String(message.id).indexOf('temp-') === 0) return;
            savedBody[String(message.body || '') + '|' + String(message.message_type || '')] = true;
        });
        return list.filter(function (message) {
            if (String(message.id).indexOf('temp-') !== 0) return true;
            return !savedBody[String(message.body || '') + '|' + String(message.message_type || '')];
        });
    }

    ctx.rememberThread = function (conversationId, messages) {
        var key = String(conversationId);
        ctx.threadMessages[key] = mergeThreadMessages(ctx.threadMessages[key], messages);
        return ctx.threadMessages[key];
    };

    ctx.renderMessages = function (bodyEl, messages) {
        if (!bodyEl) return;
        var rows = Array.isArray(messages) ? messages : [];
        if (!rows.length) {
            bodyEl.innerHTML = '<div class="floating-chat-empty">No messages yet</div>';
            return;
        }
        var html = rows.map(function (m) {
            var mine = Number(m.sender_id) === Number(ctx.currentUserId);
            var time = ctx.formatTime(m.created_at);
            var body = ctx.escapeHtml(m.body || '');
            if (m.message_type === 'call' || m.message_type === 'system') {
                return '<div class="' + ctx.callStatusClass(m.body) + (mine ? ' is-mine' : ' is-theirs') + '" data-message-id="' + ctx.escapeHtml(String(m.id)) + '">' +
                    '<div class="floating-chat-msg-row">' +
                    '<div class="floating-chat-msg-main"><div class="floating-chat-msg-body comms-call-text">' + body + '</div></div>' +
                    ctx.messageActionsHtml(m, mine) +
                    '</div></div>';
            }
            return '<div class="floating-chat-msg ' + (mine ? 'is-mine' : 'is-theirs') + '" data-message-id="' + ctx.escapeHtml(String(m.id)) + '">' +
                '<div class="floating-chat-msg-row">' +
                '<div class="floating-chat-msg-main">' +
                ctx.renderAttachmentHtml(m.attachments) +
                (body ? '<div class="floating-chat-msg-body">' + body + '</div>' : '') +
                '<div class="floating-chat-msg-time">' + time + '</div>' +
                '</div>' +
                ctx.floatReactButtonHtml(m) +
                ctx.messageActionsHtml(m, mine) +
                '</div>' +
                ctx.reactionChipsHtml(m) +
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
            msgEl.className = ctx.callStatusClass(message.body) + (mine ? ' is-mine' : ' is-theirs');
            msgEl.innerHTML = '<div class="floating-chat-msg-row">' +
                '<div class="floating-chat-msg-main"><div class="floating-chat-msg-body comms-call-text">' + body + '</div></div>' +
                ctx.messageActionsHtml(message, mine) +
                '</div>';
            msgEl.dataset.messageId = message.id;
            bodyEl.appendChild(msgEl);
        } else {
            var msgEl2 = document.createElement('div');
            msgEl2.className = 'floating-chat-msg ' + (mine ? 'is-mine' : 'is-theirs');
            msgEl2.dataset.messageId = message.id;
            msgEl2.innerHTML = '<div class="floating-chat-msg-row">' +
                '<div class="floating-chat-msg-main">' +
                ctx.renderAttachmentHtml(message.attachments) +
                (body ? '<div class="floating-chat-msg-body">' + body + '</div>' : '') +
                '<div class="floating-chat-msg-time">' + time + '</div>' +
                '</div>' +
                ctx.floatReactButtonHtml(message) +
                ctx.messageActionsHtml(message, mine) +
                '</div>' +
                ctx.reactionChipsHtml(message);
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
        var bucket = ctx.threadMessages && ctx.threadMessages[String(conversationId)];
        if (bucket) {
            bucket.forEach(function (row) {
                if (String(row.id) === String(tempId)) Object.assign(row, realMessage);
            });
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
        var instant = ctx.rememberThread(conversationId, (cached && cached.length) ? cached : (sharedMessages || []));
        if (instant.length) {
            ctx.renderMessages(bodyEl, instant);
        } else if (!bodyEl.childNodes.length) {
            bodyEl.innerHTML = '';
        }

        window.Comms.api(url, { dedupe: false }).then(function (data) {
            var messages = (data && data.messages) || [];
            var merged = ctx.rememberThread(conversationId, messages);
            if (!merged.length) {
                if (!instant.length) {
                    bodyEl.innerHTML = '<div class="floating-chat-empty">No messages yet</div>';
                }
                return;
            }

            ctx.writeMessageCache(cacheKey, merged);
            if (window.Comms.writeThreadCache) {
                window.Comms.writeThreadCache(conversationId, {
                    messages: merged,
                    reactionEmojis: (data && data.reaction_emojis) || [],
                    ts: Date.now()
                });
            }
            if (data && Array.isArray(data.reaction_emojis) && data.reaction_emojis.length) {
                ctx.floatReactionEmojis = data.reaction_emojis;
            }
            ctx.renderMessages(bodyEl, merged);
        }).catch(function () {
            if (!instant.length) {
                bodyEl.innerHTML = '<div class="floating-chat-empty">Unable to load messages</div>';
            }
        });
    };

    ctx.sendMessage = function (conversationId, body) {
        if (!body || !window.Comms) return Promise.reject(new Error('No message'));

        var url = ctx.routes.messages ? ctx.routes.messages.replace('__ID__', conversationId) : null;
        if (!url) return Promise.reject(new Error('No URL'));

        var tempId = 'temp-' + Date.now();
        ctx.rememberThread(conversationId, [{
            id: tempId,
            body: body,
            sender_id: ctx.currentUserId,
            mine: true,
            created_at: new Date().toISOString(),
            message_type: 'text'
        }]);
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
        if (!message || message.id == null) return;

        ctx.rememberThread(cid, [message]);
        var w = ctx.openWindows[cid];
        var bodyEl = w && w.el ? w.el.querySelector('.floating-chat-body') : null;
        if (bodyEl && bodyEl.querySelector('[data-message-id="' + String(message.id).replace(/"/g, '') + '"]')) {
            return;
        }

        ctx.appendMessageToWindow(cid, message);

        if (!ctx.openWindows[cid].minimized && document.visibilityState !== 'hidden') {
            ctx.markConversationRead(cid);
        }
    };
}
