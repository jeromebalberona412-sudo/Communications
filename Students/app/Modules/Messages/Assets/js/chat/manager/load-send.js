/**
 * Chat manager — load-send
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.searchAbort !== undefined) var searchAbort = ctx.searchAbort;
    if (ctx.searchCache !== undefined) var searchCache = ctx.searchCache;

function saveMsgCache(id, messages, emojis) {
    var payload = {
        messages: messages,
        reactionEmojis: emojis,
        ts: Date.now()
    };
    state.messageCache[String(id)] = payload;
    if (Comms.writeThreadCache) Comms.writeThreadCache(id, payload);
}

function loadMsgCache(id) {
    if (state.messageCache[String(id)]) return state.messageCache[String(id)];
    var stored = Comms.readThreadCache ? Comms.readThreadCache(id) : null;
    if (stored) {
        state.messageCache[String(id)] = stored;
        return stored;
    }
    return null;
}

function applyMessages(messages, emojis, opts) {
    state.messages = messages || [];
    if (Array.isArray(emojis) && emojis.length) {
        state.reactionEmojis = emojis;
    }
    if (opts && opts.hasMore != null) {
        state.messagesHasMore = !!opts.hasMore;
    }
    api.renderMessages(opts);
}

function loadOlderMessages() {
    if (state.loadingOlder || !state.activeId || !state.messagesHasMore) return Promise.resolve();
    if (!state.messages.length || !els.messages) return Promise.resolve();
    var oldest = state.messages[0];
    var beforeId = oldest && oldest.id;
    if (!beforeId || String(beforeId).indexOf('local-') === 0) return Promise.resolve();

    state.loadingOlder = true;
    var cid = state.activeId;
    var prevHeight = els.messages.scrollHeight;
    var url = Comms.route(routes.messages, cid) + '?before_id=' + encodeURIComponent(beforeId);

    return Comms.api(url, { dedupe: true }).then(function (data) {
        if (Number(state.activeId) !== Number(cid)) return;
        var older = data.messages || [];
        var perPage = 40;
        if (!older.length) {
            state.messagesHasMore = false;
            return;
        }
        if (older.length < perPage) {
            state.messagesHasMore = false;
        }
        var existingIds = {};
        state.messages.forEach(function (m) { existingIds[String(m.id)] = true; });
        var prepend = older.filter(function (m) { return !existingIds[String(m.id)]; });
        if (!prepend.length) {
            state.messagesHasMore = false;
            return;
        }
        state.messages = prepend.concat(state.messages);
        if (Array.isArray(data.reaction_emojis) && data.reaction_emojis.length) {
            state.reactionEmojis = data.reaction_emojis;
        }
        saveMsgCache(cid, state.messages, state.reactionEmojis);
        api.renderMessages({ restoreScrollHeight: prevHeight });
    }).catch(function () { /* ignore */ }).finally(function () {
        state.loadingOlder = false;
    });
}

function stopLocalTyping() {
    if (!state.activeId || !window.CommsRealtime) return;
    if (typeof window.CommsRealtime.stopTyping === 'function') {
        window.CommsRealtime.stopTyping(state.activeId);
    } else if (typeof window.CommsRealtime.broadcastTyping === 'function') {
        window.CommsRealtime.broadcastTyping(state.activeId, { stop: true });
    }
}

function notifyComposerTyping(rawValue) {
    if (!state.activeId || !window.CommsRealtime || typeof window.CommsRealtime.broadcastTyping !== 'function') {
        return;
    }
    var hasText = !!String(rawValue == null ? '' : rawValue).replace(/\s/g, '');
    if (!hasText) {
        stopLocalTyping();
        return;
    }
    window.CommsRealtime.broadcastTyping(state.activeId);
}

function openConversation(id, opts) {
    opts = opts || {};
    if (state.activeId && Number(state.activeId) !== Number(id)) {
        stopLocalTyping();
    }
    state.activeId = Number(id);
    window.__COMMS_PAGE_ACTIVE_ID__ = state.activeId;
    state.messagesHasMore = true;
    state.loadingOlder = false;
    api.setThreadOpen(true);
    els.threadEmpty.hidden = true;
    els.threadActive.hidden = false;
    if (els.typing) {
        els.typing.hidden = true;
        els.typing.textContent = '';
    }
    api.renderConversations(els.convFilter ? els.convFilter.value : '');
    if (typeof window.syncFederationsMessagesPageHeaderBtn === 'function') {
        window.syncFederationsMessagesPageHeaderBtn();
    } else {
        var msgBtn = document.getElementById('commsMsgBtn');
        if (msgBtn && document.body.classList.contains('comms-messages-layout')) {
            msgBtn.title = 'Minimize to chat';
            msgBtn.setAttribute('aria-label', 'Minimize to chat');
        }
    }

    if (window.CommsRealtime && typeof window.CommsRealtime.subscribeConversation === 'function') {
        window.CommsRealtime.subscribeConversation(state.activeId);
    }

    // Instant header: list row → SkLocalCache → then API refresh.
    var listConv = state.conversations.find(function (c) {
        return Number(c.id) === Number(id);
    });
    if (listConv && listConv.other_user) {
        api.updatePeerHeader(listConv);
    } else {
        api.applyCachedPeerHeader(id);
    }
    if (state.activeConversation && Number(state.activeConversation.id) === Number(id)) {
        api.updatePeerHeader(state.activeConversation);
    }

    // Show cached messages immediately so the thread appears instantly
    var cached = loadMsgCache(id);
    if (cached && Array.isArray(cached.messages) && cached.messages.length) {
        state.messages = cached.messages;
        if (Array.isArray(cached.reactionEmojis) && cached.reactionEmojis.length) {
            state.reactionEmojis = cached.reactionEmojis;
        }
        api.renderMessages({ stickBottom: true });
    }

    // Load conversation header and fresh messages in parallel
    var convPromise = Comms.api(Comms.route(routes.showConversation, id));
    var msgPromise = Comms.api(Comms.route(routes.messages, id));

    convPromise.then(function (data) {
        if (!data || !data.conversation) return;
        if (Number(state.activeId) !== Number(id)) return;
        var conv = data.conversation;
        var peer = conv.other_user || {};
        // Keep a working list/cache avatar if API returns empty/broken placeholder.
        if (listConv && listConv.other_user && listConv.other_user.profile_image_url) {
            var apiAvatar = String(peer.profile_image_url || '').trim();
            if (!apiAvatar) {
                peer.profile_image_url = listConv.other_user.profile_image_url;
                conv.other_user = peer;
            }
        }
        state.activeConversation = conv;
        api.updatePeerHeader(conv);
    }).catch(function () { /* non-fatal */ });

    return msgPromise.then(function (data) {
        var freshMessages = data.messages || [];
        var freshEmojis = Array.isArray(data.reaction_emojis) ? data.reaction_emojis : [];

        // Only re-render if conversation is still active
        if (Number(state.activeId) === Number(id)) {
            state.messagesHasMore = freshMessages.length >= 40;
            applyMessages(freshMessages, freshEmojis, { stickBottom: !cached, hasMore: state.messagesHasMore });
        }

        saveMsgCache(id, freshMessages, freshEmojis);

        if (document.visibilityState === 'hidden') return null;
        window.__COMMS_INBOX_EPOCH__ = (Number(window.__COMMS_INBOX_EPOCH__) || 0) + 1;
        if (listConv) {
            listConv.unread_count = 0;
            api.renderConversations(els.convFilter ? els.convFilter.value : '');
        }
        return Comms.api(Comms.route(routes.read, id), { method: 'POST', body: '{}' });
    }).then(function (data) {
        if (data && typeof data.unread_count === 'number' && window.CommsRealtime && typeof window.CommsRealtime.updateHeaderBadge === 'function') {
            window.CommsRealtime.updateHeaderBadge(data.unread_count);
        } else if (window.CommsRealtime && typeof window.CommsRealtime.refreshUnread === 'function') {
            window.CommsRealtime.refreshUnread();
        }
        if (!opts.skipReloadList) {
            return api.loadConversations();
        }
    }).catch(function (err) {
        Comms.showToast(err.message || 'Unable to open conversation.', 'error');
    });
}

function appendMessage(message) {
    if (!message || Number(message.conversation_id) !== Number(state.activeId)) return;
    if (state.messages.some(function (m) { return String(m.id) === String(message.id); })) return;

    // Drop optimistic local bubbles when the real message arrives (stops stuck "Sending...").
    if (message.mine && message.id != null && String(message.id).indexOf('local-') !== 0) {
        var body = String(message.body || '');
        state.messages = state.messages.filter(function (m) {
            var id = String(m.id || '');
            if (id.indexOf('local-') !== 0) return true;
            if (body && String(m.body || '') === body) return false;
            if (!body && (message.message_type === 'image' || message.message_type === 'file')
                && (m.message_type === 'image' || m.message_type === 'file')) {
                return false;
            }
            return true;
        });
    }

    state.messages.push(Object.assign({}, message, message.mine ? { send_status: message.send_status || 'sent' } : {}));
    saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
    api.renderMessages({ stickBottom: true });
}

function reloadActiveMessages() {
    if (!state.activeId) return Promise.resolve();
    var cid = state.activeId;
    return Comms.api(Comms.route(routes.messages, cid)).then(function (data) {
        var msgs = data.messages || [];
        var emojis = Array.isArray(data.reaction_emojis) ? data.reaction_emojis : [];
        saveMsgCache(cid, msgs, emojis);
        if (Number(state.activeId) === Number(cid)) {
            applyMessages(msgs, emojis, { stickBottom: true });
        }
        api.loadConversations();
    }).catch(function () { /* ignore */ });
}

function resizeComposer() {
    if (!els.input) return;
    if (Comms.resizeGrowTextarea) {
        Comms.resizeGrowTextarea(els.input, 4, 1);
    } else {
        els.input.style.height = 'auto';
        var next = Math.min(Math.max(els.input.scrollHeight, 72), 180);
        els.input.style.height = next + 'px';
    }
}

function publishSentMessage(sent, extraPeers) {
    if (!sent || !window.CommsRealtime || typeof window.CommsRealtime.broadcastMessage !== 'function') return;
    var conv = state.activeConversation;
    var peer = conv && conv.other_user;
    var peers = Array.isArray(extraPeers) ? extraPeers : [];
    if (!peers.length && conv && Array.isArray(conv.members)) peers = conv.members;
    window.CommsRealtime.broadcastMessage(sent.conversation_id || state.activeId, sent, {
        peerId: peer && !peer.is_group ? (peer.id || peer.user_id) : null,
        peerType: peer && !peer.is_group ? (peer.user_type || peer.type || peer.portal_user_type) : null,
        peers: peers
    });
}

function sendMessage(body) {
    if (!state.activeId) return;
    var files = (state.pendingAttachments || []).slice();
    var text = normalizeMessageBody(body);
    text = api.clampMessageToMaxLines(text);
    if (text.trim() === '' && !files.length) {
        if (String(body || '').length > 0) {
            Comms.showToast('Message cannot be only spaces.', 'error');
        }
        return;
    }
    if (text.trim() !== '') {
        var validated = api.validateMessageBody(text);
        if (validated == null) return;
        text = validated;
    } else {
        text = '';
    }
    if (state.sendInFlight && files.length) return;

    stopLocalTyping();
    els.input.value = '';
    resizeComposer();
    var previewUrls = (state.pendingPreviewUrls || []).slice();
    // Keep blob URLs for optimistic bubbles; clearPendingAttachment would revoke them.
    state.pendingPreviewUrls = [];
    api.clearPendingAttachment();
    api.syncComposerEndControls();

    var tempId = 'local-' + Date.now();
    if (text) {
        appendMessage({
            id: tempId,
            conversation_id: state.activeId,
            body: text,
            message_type: 'text',
            mine: true,
            send_status: 'sending',
            created_at: new Date().toISOString(),
            reactions: [],
            attachments: []
        });
    }

    var jobs = [];
    if (text) {
        jobs.push(Comms.api(Comms.route(routes.messages, state.activeId), {
            method: 'POST',
            body: JSON.stringify({ body: text }),
            dedupe: false
        }).then(function (data) {
            if (!data || !data.message) return;
            var sent = Object.assign({}, data.message, { send_status: 'sent', mine: true, _sentAt: Date.now() });
            publishSentMessage(sent);
            var realIdx = state.messages.findIndex(function (m) { return Number(m.id) === Number(sent.id); });
            var tempIdx = state.messages.findIndex(function (m) { return String(m.id) === tempId; });
            if (realIdx !== -1 && tempIdx !== -1) {
                state.messages[realIdx] = Object.assign({}, state.messages[realIdx], { send_status: 'sent', mine: true, _sentAt: Date.now() });
                state.messages.splice(tempIdx, 1);
            } else if (tempIdx !== -1) {
                state.messages[tempIdx] = sent;
            } else {
                appendMessage(sent);
                return;
            }
            saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
            api.renderMessages({ stickBottom: true });
            window.setTimeout(function () { api.renderMessages({ stickBottom: false, preserveScroll: true }); }, 2600);
        }));
    }

    if (files.length) {
        state.sendInFlight = true;
        if (els.sendBtn) els.sendBtn.disabled = true;
        if (els.attachBtn) els.attachBtn.disabled = true;
        api.setUploadProgress(20, false);
        files.forEach(function (file, i) {
            var fileTempId = 'local-att-' + Date.now() + '-' + i;
            var isImage = api.isImageFile(file);
            var blobUrl = previewUrls[i] || (isImage ? URL.createObjectURL(file) : null);
            appendMessage({
                id: fileTempId,
                conversation_id: state.activeId,
                body: '',
                message_type: isImage ? 'image' : 'file',
                mine: true,
                send_status: 'sending',
                created_at: new Date().toISOString(),
                reactions: [],
                attachments: [{
                    id: 0,
                    file_name: file.name,
                    file_type: isImage ? 'image' : 'file',
                    mime_type: file.type || null,
                    file_size: file.size || null,
                    storage_provider: 'local',
                    url: blobUrl,
                    download_url: blobUrl || '#'
                }]
            });
            var form = new FormData();
            form.append('attachment', file, file.name);
            jobs.push(Comms.api(Comms.route(routes.messages, state.activeId), {
                method: 'POST',
                body: form,
                dedupe: false
            }).then(function (data) {
                api.setUploadProgress(100, false);
                if (!data || !data.message) return;
                var sent = Object.assign({}, data.message, { send_status: 'sent', mine: true });
                publishSentMessage(sent);
                var realIdx = state.messages.findIndex(function (m) { return Number(m.id) === Number(sent.id); });
                var tempIdx = state.messages.findIndex(function (m) { return String(m.id) === fileTempId; });
                if (tempIdx !== -1) {
                    var prevAtt = state.messages[tempIdx].attachments || [];
                    prevAtt.forEach(function (a) {
                        if (a && a.url && String(a.url).indexOf('blob:') === 0) {
                            try { URL.revokeObjectURL(a.url); } catch (e) { /* ignore */ }
                        }
                    });
                }
                if (realIdx !== -1 && tempIdx !== -1) {
                    state.messages[realIdx] = Object.assign({}, state.messages[realIdx], { send_status: 'sent', mine: true });
                    state.messages.splice(tempIdx, 1);
                } else if (tempIdx !== -1) {
                    state.messages[tempIdx] = sent;
                } else {
                    appendMessage(sent);
                    return;
                }
                saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
                api.renderMessages({ stickBottom: true });
            }));
        });
    }

    // Don't block the UI on slow inbox reloads — mark send done as soon as POSTs finish.
    Promise.all(jobs).then(function () {
        api.loadConversations();
    }).catch(function (err) {
        state.messages.forEach(function (m) {
            var id = String(m.id || '');
            if (id === tempId || id.indexOf('local-att-') === 0) {
                m.send_status = 'failed';
            }
        });
        api.renderMessages({ stickBottom: true });
        Comms.showToast(err.message || 'Failed to send message.', 'error');
    }).finally(function () {
        state.sendInFlight = false;
        if (els.sendBtn) els.sendBtn.disabled = false;
        if (els.attachBtn) els.attachBtn.disabled = false;
        window.setTimeout(function () { api.setUploadProgress(0, true); }, 400);
        api.syncComposerEndControls();
        if (els.input) els.input.focus();
    });

    // Safety: never leave "Sending..." forever if the request hangs.
    window.setTimeout(function () {
        var stuck = false;
        state.messages.forEach(function (m) {
            if (String(m.id) === tempId && m.send_status === 'sending') {
                m.send_status = 'failed';
                stuck = true;
            }
        });
        if (stuck) api.renderMessages({ stickBottom: false, preserveScroll: true });
    }, 20000);
}

function retryFailedMessage(tempId) {
    var idx = state.messages.findIndex(function (m) { return String(m.id) === String(tempId); });
    if (idx === -1) return;
    var msg = state.messages[idx];
    if (!msg || msg.send_status !== 'failed') return;
    var body = String(msg.body || '');
    state.messages.splice(idx, 1);
    api.renderMessages({ stickBottom: true });
    if (body) sendMessage(body);
}

function startConversationWithUser(userId) {
    return Comms.api(routes.storeConversation, {
        method: 'POST',
        body: JSON.stringify({ user_id: Number(userId) }),
        dedupe: false
    }).then(function (data) {
        if (els.searchResults) els.searchResults.hidden = true;
        if (els.convFilter) els.convFilter.value = '';
        return api.loadConversations().then(function () {
            return openConversation(data.conversation.id);
        });
    }).catch(function (err) {
        Comms.showToast(err.message || 'Unable to start conversation.', 'error');
    });
}

var searchAbort = null;
var searchCache = Object.create(null);

/**
 * Keystroke-driven search.
 *
 * Requests are debounced upstream, aborted when a newer keystroke
 * arrives, cached for a short window and skipped entirely while the API
 * is rate limited. This keeps the search endpoint far below its
 * throttle and removes the "429 Too Many Attempts" errors.
 */
function searchUsers(q) {
    if (!els.searchResults) return;
    var query = String(q || '').trim();
    if (query.length < 2) {
        els.searchResults.hidden = true;
        els.searchResults.innerHTML = '';
        return;
    }
    if (Comms.rateLimitedState && Comms.rateLimitedState()) {
        return;
    }

    var key = query.toLowerCase();
    var cached = searchCache[key];
    if (cached && (Date.now() - cached.at) < 30000) {
        renderUserSearchResults(cached.users);
        return;
    }

    if (searchAbort) {
        try { searchAbort.abort(); } catch (e) {}
        searchAbort = null;
    }
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    searchAbort = controller;

    Comms.api(routes.searchUsers + '?q=' + encodeURIComponent(query), {
        method: 'GET',
        dedupe: false,
        signal: controller ? controller.signal : undefined
    }).then(function (data) {
        if (searchAbort === controller) searchAbort = null;
        var users = data.users || [];
        searchCache[key] = { at: Date.now(), users: users };
        renderUserSearchResults(users);
    }).catch(function (err) {
        if (searchAbort === controller) searchAbort = null;
        if (err && (err.name === 'AbortError' || err.code === 20)) return;
        if (err && err.isRateLimited) {
            Comms.showToast('Too many requests. Please wait a moment and try again.', 'error');
            return;
        }
        Comms.showToast(err.message || 'Search failed.', 'error');
    });
}

function renderUserSearchResults(users) {
    if (!els.searchResults) return;
    if (!users || !users.length) {
        els.searchResults.innerHTML = '<div class="comms-search-item"><span>No users found</span></div>';
        els.searchResults.hidden = false;
        return;
    }
    els.searchResults.innerHTML = users.map(function (u) {
        return '<button type="button" class="comms-search-item" data-user-id="' + u.id + '">' +
            '<strong>' + Comms.escapeHtml(u.name) + '</strong>' +
            '<span>' + Comms.escapeHtml(u.user_type_label || u.role) + '</span></button>';
    }).join('');
    els.searchResults.hidden = false;
}


    Object.assign(api, {
        appendMessage: appendMessage,
        applyMessages: applyMessages,
        loadMsgCache: loadMsgCache,
        loadOlderMessages: loadOlderMessages,
        notifyComposerTyping: notifyComposerTyping,
        openConversation: openConversation,
        publishSentMessage: publishSentMessage,
        reloadActiveMessages: reloadActiveMessages,
        renderUserSearchResults: renderUserSearchResults,
        resizeComposer: resizeComposer,
        retryFailedMessage: retryFailedMessage,
        saveMsgCache: saveMsgCache,
        searchUsers: searchUsers,
        sendMessage: sendMessage,
        startConversationWithUser: startConversationWithUser,
        stopLocalTyping: stopLocalTyping
    });

    ctx.searchAbort = searchAbort;
    ctx.searchCache = searchCache;
}
