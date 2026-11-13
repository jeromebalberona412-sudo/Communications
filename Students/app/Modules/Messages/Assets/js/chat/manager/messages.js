/**
 * Chat manager — messages
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.reactBtnIcon !== undefined) var reactBtnIcon = ctx.reactBtnIcon;
    var msgMoreIcon = ctx.msgMoreIcon || '';

function renderMessageActions(m, deleted) {
    var items = '';
    if (!deleted && m.mine && m.message_type === 'text') {
        items += '<button type="button" role="menuitem" data-msg-edit="' + m.id + '">Edit</button>';
    }
    items += '<button type="button" role="menuitem" data-msg-delete="' + m.id + '">Delete</button>';
    return '<div class="comms-msg-actions">' +
        '<button type="button" class="comms-msg-more" data-msg-more="' + m.id + '" aria-label="Message actions" aria-haspopup="menu" aria-expanded="false" title="More">' + msgMoreIcon + '</button>' +
        '<div class="comms-msg-menu" data-msg-menu="' + m.id + '" role="menu" hidden>' + items + '</div>' +
        '</div>';
}

function closeMessageMenus() {
    if (!els.messages) return;
    els.messages.querySelectorAll('[data-msg-menu]').forEach(function (menu) {
        menu.hidden = true;
    });
    els.messages.querySelectorAll('[data-msg-more]').forEach(function (btn) {
        btn.setAttribute('aria-expanded', 'false');
    });
    els.messages.querySelectorAll('.comms-bubble-wrap.is-menu-open').forEach(function (wrap) {
        wrap.classList.remove('is-menu-open');
    });
}

function replaceMessage(updated) {
    if (!updated) return;
    var idx = state.messages.findIndex(function (m) { return Number(m.id) === Number(updated.id); });
    if (idx === -1) return;
    state.messages[idx] = updated;
    api.saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
    renderMessages({ preserveScroll: true });
}

function removeMessageLocal(messageId) {
    state.messages = state.messages.filter(function (m) { return Number(m.id) !== Number(messageId); });
    api.saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
    renderMessages({ preserveScroll: true });
    api.loadConversations();
}

function saveEditedMessage(messageId) {
    var input = els.messages.querySelector('[data-edit-input="' + messageId + '"]');
    if (!input || !routes.updateMessage) return;
    var body = api.validateMessageBody(input.value, { el: input });
    if (body == null) return;
    state.msgChangeSkipToast[String(messageId)] = true;
    Comms.api(Comms.route(routes.updateMessage, messageId), {
        method: 'PATCH',
        body: JSON.stringify({ body: body }),
        dedupe: false
    }).then(function (data) {
        state.editingId = null;
        if (data && data.message) {
            replaceMessage(data.message);
        }
        Comms.showToast('Message saved.', 'success');
        window.setTimeout(function () { delete state.msgChangeSkipToast[String(messageId)]; }, 800);
    }).catch(function (err) {
        delete state.msgChangeSkipToast[String(messageId)];
        Comms.showToast(err.message || 'Unable to edit message.', 'error');
    });
}

function deleteMessage(messageId, scope) {
    if (!routes.deleteMessage) return;
    state.msgChangeSkipToast[String(messageId)] = true;
    Comms.api(Comms.route(routes.deleteMessage, messageId) + '?scope=' + encodeURIComponent(scope), {
        method: 'DELETE',
        body: JSON.stringify({ scope: scope }),
        dedupe: false
    }).then(function (data) {
        state.editingId = null;
        if (data && data.scope === 'me') {
            removeMessageLocal(messageId);
            Comms.showToast('Message deleted for you.', 'success');
            return;
        }
        if (data && data.message) {
            replaceMessage(data.message);
            api.loadConversations();
            Comms.showToast('Message deleted for everyone.', 'success');
        }
        window.setTimeout(function () { delete state.msgChangeSkipToast[String(messageId)]; }, 800);
    }).catch(function (err) {
        delete state.msgChangeSkipToast[String(messageId)];
        Comms.showToast(err.message || 'Unable to delete message.', 'error');
    });
}

function openDeletePrompt(messageId) {
    var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
    if (!msg) return;
    var deleted = msg.deleted_for_all || msg.message_type === 'deleted';
    var canDeleteAll = !!msg.mine && !deleted;
    if (typeof Comms.openDeleteMessageDialog !== 'function') {
        deleteMessage(messageId, canDeleteAll ? 'all' : 'me');
        return;
    }
    Comms.openDeleteMessageDialog({ canDeleteAll: canDeleteAll }).then(function (scope) {
        if (!scope) return;
        deleteMessage(messageId, scope);
    });
}

function latestMineMessageId(items) {
    for (var i = items.length - 1; i >= 0; i -= 1) {
        if (items[i] && items[i].mine && items[i].message_type !== 'call' && items[i].message_type !== 'system') {
            return String(items[i].id);
        }
    }
    return null;
}

function renderSendStatus(msg, isLatestMine) {
    if (!msg || !msg.mine) return '';
    var status = msg.send_status || '';
    if (!status && String(msg.id || '').indexOf('local-') === 0) status = 'sending';
    if (status === 'failed') {
        return '<div class="comms-send-status is-failed" role="status">Failed <button type="button" class="comms-retry-send" data-retry-send="' +
            Comms.escapeHtml(String(msg.id || '')) + '">Retry</button></div>';
    }
    if (!isLatestMine) return '';
    if (status !== 'sending' && status !== 'sent' && status !== 'delivered' && status !== 'read') return '';
    var label = status === 'sending' ? 'Sending...'
        : (status === 'delivered' ? 'Delivered' : (status === 'read' ? 'Read' : 'Sent'));
    return '<div class="comms-send-status is-' + status + '" role="status">' + label + '</div>';
}

function renderMessages(opts) {
    opts = opts || {};
    var prevScroll = els.messages ? els.messages.scrollTop : 0;
    var stickBottom = false;
    if (opts.stickBottom === true) {
        stickBottom = true;
    } else if (els.messages && opts.stickBottom !== false && !opts.preserveScroll) {
        stickBottom = els.messages.scrollTop + els.messages.clientHeight >= els.messages.scrollHeight - 48;
    }
    if (!els.messages) return;

    var items = state.messages || [];
    var parts = [];
    var prevCreatedAt = null;
    var latestIndex = items.length - 1;
    var latestMineId = latestMineMessageId(items);

    items.forEach(function (m, index) {
        var insertedSep = false;
        if (api.shouldInsertDateSeparator(prevCreatedAt, m.created_at)) {
            parts.push(api.renderDateSeparator(m.created_at));
            insertedSep = true;
        }
        if (index === latestIndex && !insertedSep) {
            parts.push(api.renderDateSeparator(m.created_at || prevCreatedAt));
        }

        var titleAttr = ' title="' + Comms.escapeHtml(api.formatFullDateTime(m.created_at)) + '"';

        if (m.message_type === 'call' || m.message_type === 'system') {
            parts.push(api.renderCallBubble(m));
            prevCreatedAt = m.created_at;
            return;
        }
        if (m.deleted_for_all || m.message_type === 'deleted') {
            parts.push('<div class="comms-bubble-wrap ' + (m.mine ? 'is-mine' : 'is-theirs') + '" data-id="' + m.id + '"' + titleAttr + '>' +
                api.renderGroupSenderMeta(m, !!m.mine, items[index - 1]) +
                '<div class="comms-bubble-row">' +
                '<div class="comms-bubble comms-bubble--deleted">' +
                '<div class="comms-bubble-text">This message was deleted</div>' +
                '</div>' +
                '<div class="comms-bubble-tools">' + renderMessageActions(m, true) + '</div>' +
                '</div></div>');
            prevCreatedAt = m.created_at;
            return;
        }

        var mine = !!m.mine;
        var pickerOpen = Number(state.openReactionPickerId) === Number(m.id);
        var editing = Number(state.editingId) === Number(m.id);
        var hasAttachments = (m.message_type === 'image' || m.message_type === 'file') ||
            (Array.isArray(m.attachments) && m.attachments.length > 0);
        var hasTextBody = !!String(m.body || '').trim() || editing;
        var attachmentOnly = hasAttachments && !hasTextBody;
        var splitAttachText = hasAttachments && hasTextBody && !editing;
        var showMsgActions = !editing;
        var showReact = !editing;
        var isAutomation = m.message_type === 'automation';
        var sideCls = mine ? 'comms-bubble--mine' : 'comms-bubble--theirs';
        var bubbleExtra = (hasAttachments ? ' has-attachment' : '') +
            (attachmentOnly ? ' has-attachment-only' : '') +
            (isAutomation ? ' comms-bubble--automation' : '');
        var attachHtml = api.renderAttachments(m.attachments);
        var bodyHtml = '';
        if (m.body && !editing) {
            bodyHtml = '<div class="comms-bubble-text">' + Comms.escapeHtml(m.body) +
                (m.edited ? ' <span class="comms-edited">edited</span>' : '') +
                '</div>';
        }

        var bubbleContent;
        if (editing) {
            bubbleContent =
                '<div class="comms-edit-panel" role="group" aria-label="Edit message">' +
                '<label class="visually-hidden" for="commsEditInput' + m.id + '">Edit message</label>' +
                '<textarea id="commsEditInput' + m.id + '" class="comms-edit-input" data-edit-input="' + m.id + '" rows="3" data-max-lines="500">' +
                Comms.escapeHtml(m.body || '') +
                '</textarea>' +
                '<div class="comms-edit-actions">' +
                '<button type="button" class="comms-edit-cancel" data-edit-cancel="' + m.id + '">Cancel</button>' +
                '<button type="button" class="comms-edit-save" data-edit-save="' + m.id + '">Save</button>' +
                '</div></div>';
        } else if (splitAttachText) {
            bubbleContent =
                '<div class="comms-bubble-cluster">' +
                '<div class="comms-bubble ' + sideCls + ' has-attachment has-attachment-only">' + attachHtml + '</div>' +
                '<div class="comms-bubble ' + sideCls + (isAutomation ? ' comms-bubble--automation' : '') + '">' +
                bodyHtml +
                api.renderReactionChips(m.reactions, m.id) +
                '</div></div>';
        } else {
            bubbleContent =
                '<div class="comms-bubble ' + sideCls + bubbleExtra + '">' +
                attachHtml +
                bodyHtml +
                api.renderReactionChips(m.reactions, m.id) +
                '</div>';
        }

        parts.push('<div class="comms-bubble-wrap ' + (mine ? 'is-mine' : 'is-theirs') + (pickerOpen ? ' is-picker-open' : '') + (isAutomation ? ' is-automation' : '') + '" data-id="' + m.id + '"' + titleAttr + '>' +
            api.renderGroupSenderMeta(m, mine, items[index - 1]) +
            '<div class="comms-bubble-row">' +
            bubbleContent +
            '<div class="comms-bubble-tools">' +
            (showMsgActions ? renderMessageActions(m, false) : '') +
            (showReact ? '<button type="button" class="comms-react-btn" data-react-toggle="' + m.id + '" aria-label="Add reaction" title="React" aria-expanded="' + (pickerOpen ? 'true' : 'false') + '">' + reactBtnIcon + '</button>' : '') +
            '</div>' +
            '</div>' +
            renderSendStatus(m, latestMineId != null && String(m.id) === latestMineId) +
            '</div>');
        prevCreatedAt = m.created_at;
    });

    els.messages.innerHTML = parts.join('');
    if (opts.preserveScroll) {
        els.messages.scrollTop = prevScroll;
    } else if (stickBottom || opts.stickBottom === true) {
        els.messages.scrollTop = els.messages.scrollHeight;
    } else {
        els.messages.scrollTop = prevScroll;
    }
    if (opts.restoreScrollHeight != null && Number.isFinite(opts.restoreScrollHeight)) {
        els.messages.scrollTop = els.messages.scrollHeight - opts.restoreScrollHeight;
    }
    api.syncScrollBottomBtn();
    if (window.Comms && typeof window.Comms.wireChatImageLightbox === 'function' && !els.messages.dataset.lightboxWired) {
        window.Comms.wireChatImageLightbox(els.messages);
        els.messages.dataset.lightboxWired = 'true';
    }
    if (window.Comms && typeof window.Comms.wireDocumentPreview === 'function' && !els.messages.dataset.docPreviewWired) {
        window.Comms.wireDocumentPreview(els.messages);
    }
    if (state.editingId && Comms.resizeGrowTextarea) {
        var editEl = els.messages.querySelector('[data-edit-input="' + state.editingId + '"]');
        if (editEl) {
            Comms.resizeGrowTextarea(editEl, 6, 2);
        }
    }
}


    Object.assign(api, {
        closeMessageMenus: closeMessageMenus,
        deleteMessage: deleteMessage,
        latestMineMessageId: latestMineMessageId,
        openDeletePrompt: openDeletePrompt,
        removeMessageLocal: removeMessageLocal,
        renderMessageActions: renderMessageActions,
        renderMessages: renderMessages,
        renderSendStatus: renderSendStatus,
        replaceMessage: replaceMessage,
        saveEditedMessage: saveEditedMessage
    });

    ctx.reactBtnIcon = reactBtnIcon;
}
