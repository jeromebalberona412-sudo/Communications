/**
 * Chat manager — reactions
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.pickerEl !== undefined) var pickerEl = ctx.pickerEl;
    if (ctx.reactBtnIcon !== undefined) var reactBtnIcon = ctx.reactBtnIcon;

function renderReactionChips(reactions, messageId) {
    var items = Array.isArray(reactions)
        ? reactions.filter(function (r) { return Number(r.count || 0) > 0; })
        : [];
    if (!items.length) return '';

    return '<div class="comms-reaction-chips" role="group" aria-label="Reactions">' +
        items.map(function (r) {
            return '<button type="button" class="comms-reaction-summary' + (r.mine ? ' is-mine' : '') + '"' +
                ' data-react-people="' + Number(messageId || 0) + '"' +
                ' data-react-people-emoji="' + Comms.escapeHtml(r.emoji) + '"' +
                ' aria-haspopup="dialog" aria-label="' + Comms.escapeHtml(r.emoji) + ' ' + Number(r.count || 0) + ' reactions">' +
                '<span class="comms-reaction-stack-btn" aria-hidden="true">' + Comms.escapeHtml(r.emoji) + '</span>' +
                '<span class="comms-reaction-count' + (Number(r.count || 0) <= 1 ? ' is-single' : '') + '" aria-hidden="true">' + Number(r.count || 0) + '</span>' +
                '</button>';
        }).join('') +
        '</div>';
}

// Reaction picker is a fixed-position singleton on <body> to escape overflow:hidden clip contexts.
var pickerEl = (function () {
    var el = document.createElement('div');
    el.className = 'comms-reaction-picker';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'Choose reaction');
    el.style.display = 'none';
    el.style.position = 'fixed';
    el.style.zIndex = '99999';
    document.body.appendChild(el);
    return el;
}());

function renderReactionPicker(messageId) {
    // Inline picker slot is no longer used; picker lives in pickerEl on body.
    return '';
}

function positionPicker(triggerBtn) {
    if (!triggerBtn) return;
    var rect = triggerBtn.getBoundingClientRect();
    var pickerW = pickerEl.offsetWidth || 240;
    var pickerH = pickerEl.offsetHeight || 48;
    var pad = 8;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var top = rect.top - pickerH - 8;
    var left = rect.left + (rect.width / 2) - (pickerW / 2);

    if (top < pad) {
        top = rect.bottom + 8;
    }
    left = Math.max(pad, Math.min(left, vw - pickerW - pad));
    top = Math.max(pad, Math.min(top, vh - pickerH - pad));

    pickerEl.style.top = top + 'px';
    pickerEl.style.left = left + 'px';
}

function showPickerFor(messageId, triggerBtn) {
    state.openReactionPickerId = Number(messageId) || null;
    if (!state.openReactionPickerId) { hideGlobalPicker(); return; }
    pickerEl.setAttribute('data-react-picker', messageId);
    pickerEl.innerHTML = state.reactionEmojis.map(function (emoji) {
        return '<button type="button" class="comms-reaction-pick" data-react-emoji="' +
            Comms.escapeHtml(emoji) + '" role="menuitem">' +
            Comms.escapeHtml(emoji) + '</button>';
    }).join('');
    pickerEl.style.display = 'inline-flex';
    positionPicker(triggerBtn);
    requestAnimationFrame(function () {
        positionPicker(triggerBtn);
    });
}

function hideGlobalPicker() {
    state.openReactionPickerId = null;
    pickerEl.style.display = 'none';
    pickerEl.innerHTML = '';
}

var reactBtnIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg>';
function closeReactionPickersDom() {
    hideGlobalPicker();
    if (!els.messages) return;
    els.messages.querySelectorAll('.comms-bubble-wrap.is-picker-open').forEach(function (el) {
        el.classList.remove('is-picker-open');
        var btn = el.querySelector('[data-react-toggle]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    });
}

function openReactionPickerInPlace(messageId, triggerBtn) {
    if (!els.messages) return;
    closeReactionPickersDom();
    var wrap = els.messages.querySelector('.comms-bubble-wrap[data-id="' + messageId + '"]');
    if (wrap) {
        wrap.classList.add('is-picker-open');
        if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
    }
    showPickerFor(messageId, triggerBtn || document.body);
}

function patchReactionChipsDom(messageId, reactions) {
    if (!els.messages) return false;
    var wrap = els.messages.querySelector('.comms-bubble-wrap[data-id="' + messageId + '"]');
    if (!wrap) return false;
    var chipsHtml = renderReactionChips(reactions, messageId);
    var existing = wrap.querySelector('.comms-reaction-chips');
    if (existing) {
        if (chipsHtml) existing.outerHTML = chipsHtml;
        else existing.remove();
    } else if (chipsHtml) {
        wrap.insertAdjacentHTML('beforeend', chipsHtml);
    }
    return true;
}

function cloneReactions(reactions) {
    return Comms.cloneReactions ? Comms.cloneReactions(reactions) : (Array.isArray(reactions) ? reactions.slice() : []);
}

function optimisticToggleReactions(reactions, emoji) {
    if (Comms.optimisticToggleReactions) {
        return Comms.optimisticToggleReactions(reactions, emoji, {
            currentUserId: state.currentUserId,
            portalUserType: state.portalUserType
        });
    }
    return reactions;
}

function applyMessageReactions(messageId, reactions, opts) {
    opts = opts || {};
    var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
    if (msg) {
        msg.reactions = Array.isArray(reactions) ? reactions : [];
    }
    if (opts.closePicker !== false) {
        state.openReactionPickerId = null;
        closeReactionPickersDom();
    }
    if (!patchReactionChipsDom(messageId, msg ? msg.reactions : reactions)) {
        api.renderMessages({ preserveScroll: true });
    }
    if (state.activeId) {
        api.saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
    }
}

function patchRemoteReaction(messageId, eventType, row) {
    var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
    if (!msg || !row) return false;
    var list = cloneReactions(msg.reactions);
    var emoji = String(row.emoji || '');
    if (!emoji) return false;
    var isMine = Number(row.user_id) === Number(state.currentUserId)
        && String(row.user_type || '') === String(state.portalUserType || '');
    // Ignore our own realtime echoes while a local toggle is in flight.
    if (isMine && state.reactSkipRealtime[String(messageId)]) return true;
    var entry = null;
    list.forEach(function (r) {
        if (r.emoji === emoji) entry = r;
    });

    if (eventType === 'DELETE') {
        if (!entry) return true;
        entry.count = Math.max(0, entry.count - 1);
        if (isMine) entry.mine = false;
        entry.users = (entry.users || []).filter(function (u) {
            return !(Number(u.id) === Number(row.user_id) && String(u.user_type || '') === String(row.user_type || ''));
        });
    } else if (eventType === 'INSERT') {
        var newUser = {
            id: Number(row.user_id || 0),
            user_type: String(row.user_type || ''),
            name: isMine ? 'You' : String((state.activeConversation && state.activeConversation.other_user && state.activeConversation.other_user.name) || 'Someone'),
            mine: isMine
        };
        if (entry) {
            entry.count += 1;
            if (isMine) entry.mine = true;
            entry.users = (entry.users || []).filter(function (u) {
                return !(Number(u.id) === newUser.id && String(u.user_type || '') === newUser.user_type);
            }).concat([newUser]);
        } else {
            list.push({ emoji: emoji, count: 1, mine: isMine, users: [newUser] });
        }
    } else if (eventType === 'UPDATE') {
        var oldEmoji = String((row._old_emoji) || '');
        if (!oldEmoji || oldEmoji === emoji) return false;
        var oldEntry = null;
        list.forEach(function (r) {
            if (r.emoji === oldEmoji) oldEntry = r;
        });
        if (oldEntry) {
            oldEntry.count = Math.max(0, oldEntry.count - 1);
            if (isMine) oldEntry.mine = false;
        }
        if (entry) {
            entry.count += 1;
            if (isMine) entry.mine = true;
        } else {
            list.push({ emoji: emoji, count: 1, mine: isMine });
        }
    } else {
        return false;
    }

    msg.reactions = list.filter(function (r) { return Number(r.count) > 0; });
    if (!patchReactionChipsDom(messageId, msg.reactions)) {
        api.renderMessages({ preserveScroll: true });
    }
    if (state.activeId) {
        api.saveMsgCache(state.activeId, state.messages, state.reactionEmojis);
    }
    return true;
}

function reactionsForMe(reactions) {
    var root = document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
    var myId = Number(root && root.dataset.currentUserId || 0);
    var myType = String(root && root.dataset.portalUserType || '').toLowerCase();
    return (reactions || []).map(function (group) {
        var users = Array.isArray(group.users) ? group.users : [];
        var mine = users.some(function (user) {
            if (Number(user.id) !== myId) return false;
            var type = String(user.user_type || '').toLowerCase();
            if (!type || !myType) return true;
            var student = type === 'student' || type === 'students' || type === 'kabataan' || type === 'user';
            var teacher = type === 'teacher' || type === 'teachers' || type === 'sk_official' || type === 'official';
            var meStudent = myType === 'student' || myType === 'students' || myType === 'kabataan' || myType === 'user';
            var meTeacher = myType === 'teacher' || myType === 'teachers' || myType === 'sk_official' || myType === 'official';
            return (student && meStudent) || (teacher && meTeacher) || type === myType;
        });
        return Object.assign({}, group, { mine: mine });
    });
}

function onReactionChange(messageId, meta) {
    if (!state.activeId || !messageId) return;
    if (!state.messages.some(function (m) { return Number(m.id) === Number(messageId); })) return;
    if (meta && Array.isArray(meta.reactions)) {
        applyMessageReactions(messageId, reactionsForMe(meta.reactions), { closePicker: false });
        return;
    }
    if (state.reactSkipRealtime[String(messageId)]) return;

    if (meta && meta.eventType && patchRemoteReaction(messageId, meta.eventType, meta.row)) {
        return;
    }

    var watchId = state.activeId;
    var watchSeq = state.reactSeq[String(messageId)] || 0;
    Comms.api(Comms.route(routes.messages, watchId), { dedupe: true }).then(function (data) {
        if (Number(state.activeId) !== Number(watchId)) return;
        if ((state.reactSeq[String(messageId)] || 0) !== watchSeq) return;
        if (state.reactSkipRealtime[String(messageId)]) return;
        var fresh = (data.messages || []).find(function (m) {
            return Number(m.id) === Number(messageId);
        });
        if (!fresh) return;
        applyMessageReactions(messageId, fresh.reactions || [], { closePicker: false });
    }).catch(function () { /* ignore */ });
}

function toggleReaction(messageId, emoji) {
    if (!routes.react || !messageId || !emoji) return;

    var msg = state.messages.find(function (m) { return Number(m.id) === Number(messageId); });
    if (!msg) return;

    var previous = cloneReactions(msg.reactions);
    var next = optimisticToggleReactions(previous, emoji);
    var added = next.some(function (r) { return r.emoji === emoji && r.mine; })
        && !previous.some(function (r) { return r.emoji === emoji && r.mine; });

    var key = String(messageId);
    var seq = (state.reactSeq[key] || 0) + 1;
    state.reactSeq[key] = seq;
    state.reactSkipRealtime[key] = true;

    if (added && typeof Comms.playReactionSound === 'function') {
        Comms.playReactionSound();
    }
    applyMessageReactions(messageId, next);

    Comms.api(Comms.route(routes.react, messageId), {
        method: 'POST',
        body: JSON.stringify({ emoji: emoji }),
        dedupe: false
    }).then(function (data) {
        // Stale response from an older click — keep the latest optimistic UI.
        if (state.reactSeq[key] !== seq) return;
        applyMessageReactions(data.message_id || messageId, data.reactions || next, { closePicker: false });
    }).catch(function (err) {
        if (state.reactSeq[key] !== seq) return;
        applyMessageReactions(messageId, previous, { closePicker: false });
        Comms.showToast(err.message || 'Unable to react.', 'error');
    }).finally(function () {
        if (state.reactSeq[key] !== seq) return;
        window.setTimeout(function () {
            if (state.reactSeq[key] !== seq) return;
            delete state.reactSkipRealtime[key];
        }, 500);
    });
}

    Object.assign(api, {
        applyMessageReactions: applyMessageReactions,
        cloneReactions: cloneReactions,
        closeReactionPickersDom: closeReactionPickersDom,
        hideGlobalPicker: hideGlobalPicker,
        onReactionChange: onReactionChange,
        openReactionPickerInPlace: openReactionPickerInPlace,
        optimisticToggleReactions: optimisticToggleReactions,
        patchReactionChipsDom: patchReactionChipsDom,
        patchRemoteReaction: patchRemoteReaction,
        positionPicker: positionPicker,
        renderReactionChips: renderReactionChips,
        renderReactionPicker: renderReactionPicker,
        showPickerFor: showPickerFor,
        toggleReaction: toggleReaction
    });

    ctx.pickerEl = pickerEl;
    ctx.reactBtnIcon = reactBtnIcon;
}
