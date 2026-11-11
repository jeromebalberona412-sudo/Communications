/**
 * Chat manager — events
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;
    if (ctx.markAllBtn !== undefined) var markAllBtn = ctx.markAllBtn;
    if (ctx.markAllBusy !== undefined) var markAllBusy = ctx.markAllBusy;
    if (ctx.pickerEl !== undefined) var pickerEl = ctx.pickerEl;
    if (ctx.reactBtnIcon !== undefined) var reactBtnIcon = ctx.reactBtnIcon;
    if (ctx.callPhoneIcon !== undefined) var callPhoneIcon = ctx.callPhoneIcon;

var markAllBtn = document.getElementById('commsMarkAllRead');
var markAllBusy = false;
if (markAllBtn) {
    markAllBtn.addEventListener('click', function () {
        if (markAllBusy || !routes.markAllRead) return;
        var label = markAllBtn.querySelector('.comms-mark-all-read-label');
        markAllBusy = true;
        markAllBtn.disabled = true;
        markAllBtn.setAttribute('aria-busy', 'true');
        if (label) label.textContent = 'Marking...';
        window.__COMMS_INBOX_EPOCH__ = (Number(window.__COMMS_INBOX_EPOCH__) || 0) + 1;
        Comms.api(routes.markAllRead, { method: 'POST', body: '{}', dedupe: true }).then(function (data) {
            (state.conversations || []).forEach(function (c) { c.unread_count = 0; });
            if (Comms.writeInboxCache) Comms.writeInboxCache(state.conversations);
            api.renderConversations(els.convFilter ? els.convFilter.value : '');
            if (data && typeof data.unread_count === 'number' && window.CommsRealtime && typeof window.CommsRealtime.updateHeaderBadge === 'function') {
                window.CommsRealtime.updateHeaderBadge(data.unread_count);
            }
            return api.loadConversations();
        }).catch(function (err) {
            Comms.showToast((err && err.message) || 'Could not mark messages as read. Please try again.', 'error');
            api.loadConversations();
            if (window.CommsRealtime && typeof window.CommsRealtime.refreshUnread === 'function') {
                window.CommsRealtime.refreshUnread();
            }
        }).finally(function () {
            markAllBusy = false;
            markAllBtn.disabled = false;
            markAllBtn.removeAttribute('aria-busy');
            if (label) label.textContent = 'Mark All as Read';
        });
    });
}

if (els.convList) els.convList.addEventListener('click', function (e) {
    var btn = e.target.closest('.comms-conv-item');
    if (!btn) return;
    // Instant header paint from list row while API loads.
    if (btn.dataset.peerName) {
        var instantGroup = btn.dataset.isGroup === '1';
        api.updatePeerHeader({
            id: btn.dataset.id,
            conversation_type: instantGroup ? 'group' : 'private',
            is_default_group: false,
            name: btn.dataset.peerName,
            member_count: Number(btn.dataset.memberCount || 0),
            avatar_url: btn.dataset.peerAvatar || '',
            other_user: {
                name: btn.dataset.peerName,
                profile_image_url: btn.dataset.peerAvatar || '',
                online_status: btn.dataset.peerStatus || 'offline',
                is_group: instantGroup
            }
        });
    }
    api.openConversation(btn.dataset.id);
});

if (els.messages) {
    els.messages.addEventListener('click', function (e) {
        var retryBtn = e.target.closest('[data-retry-send]');
        if (retryBtn) {
            e.preventDefault();
            e.stopPropagation();
            api.retryFailedMessage(retryBtn.getAttribute('data-retry-send'));
            return;
        }
        var peopleBtn = e.target.closest('[data-react-people]');
        if (peopleBtn) {
            e.preventDefault();
            e.stopPropagation();
            var pid = Number(peopleBtn.getAttribute('data-react-people'));
            var pmsg = state.messages.find(function (m) { return Number(m.id) === pid; });
            var emojiEl = e.target.closest('[data-react-people-emoji]');
            var filterEmoji = emojiEl ? (emojiEl.getAttribute('data-react-people-emoji') || '') : '';
            if (Comms.openReactionModal) {
                Comms.openReactionModal(pmsg ? pmsg.reactions : [], filterEmoji);
            } else if (Comms.toggleReactionPeople) {
                Comms.toggleReactionPeople(peopleBtn, pmsg ? pmsg.reactions : [], {
                    pinned: true,
                    emoji: filterEmoji
                });
            }
            return;
        }
        var toggle = e.target.closest('[data-react-toggle]');
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            var tid = Number(toggle.getAttribute('data-react-toggle'));
            if (Number(state.openReactionPickerId) === tid) {
                api.closeReactionPickersDom();
            } else {
                api.openReactionPickerInPlace(tid, toggle);
            }
            return;
        }
        var emojiBtn = e.target.closest('[data-react-emoji]');
        if (emojiBtn && !emojiBtn.closest('.comms-reaction-picker')) {
            e.preventDefault();
            e.stopPropagation();
            var wrap = emojiBtn.closest('.comms-bubble-wrap');
            var mid = wrap ? Number(wrap.getAttribute('data-id')) : 0;
            var emoji = emojiBtn.getAttribute('data-react-emoji');
            if (mid && emoji) api.toggleReaction(mid, emoji);
            return;
        }
        var editBtn = e.target.closest('[data-msg-edit]');
        if (editBtn) {
            e.preventDefault();
            api.closeMessageMenus();
            state.editingId = Number(editBtn.getAttribute('data-msg-edit'));
            api.renderMessages({ preserveScroll: true });
            var editor = els.messages.querySelector('[data-edit-input="' + state.editingId + '"]');
            if (editor && !editor.dataset.limitWired) {
                editor.removeAttribute('maxlength');
                editor.addEventListener('keydown', function (ev) {
                    var current = api.normalizeMessageBody(editor.value || '');
                    if (ev.key === 'Enter' && !(ev.ctrlKey || ev.metaKey)) {
                        if (api.messageCharCount(current + '\n') > state.messageMaxLength) {
                            ev.preventDefault();
                            api.toastMessageCharLimit();
                        }
                        return;
                    }
                    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                        if (api.messageCharCount(current + ev.key) > state.messageMaxLength) {
                            ev.preventDefault();
                            api.toastMessageCharLimit();
                        }
                    }
                });
                editor.addEventListener('paste', function (ev) {
                    var paste = (ev.clipboardData || window.clipboardData);
                    if (!paste) return;
                    var incoming = paste.getData('text');
                    if (incoming == null) return;
                    ev.preventDefault();
                    var start = editor.selectionStart || 0;
                    var end = editor.selectionEnd || 0;
                    var value = editor.value || '';
                    var raw = value.slice(0, start) + incoming + value.slice(end);
                    var next = api.clampMessageToMaxChars(raw);
                    editor.value = next;
                    if (next !== api.normalizeMessageBody(raw)) api.toastMessageCharLimit();
                    if (Comms.resizeGrowTextarea) {
                        Comms.resizeGrowTextarea(editor, 6, 2);
                    }
                });
                editor.addEventListener('input', function () {
                    var next = api.clampMessageToMaxChars(editor.value || '');
                    if (next !== api.normalizeMessageBody(editor.value || '')) {
                        editor.value = next;
                        api.toastMessageCharLimit();
                    }
                    if (api.countMessageLines(editor.value) > api.messageMaxLines()) {
                        editor.value = api.clampMessageToMaxLines(editor.value);
                        Comms.showToast('Message cannot exceed ' + api.messageMaxLines() + ' lines.', 'error');
                    }
                    if (Comms.resizeGrowTextarea) {
                        Comms.resizeGrowTextarea(editor, 6, 2);
                    }
                });
                editor.dataset.limitWired = '1';
            }
            if (editor) {
                editor.focus();
            }
            return;
        }
        var saveBtn = e.target.closest('[data-edit-save]');
        if (saveBtn) {
            e.preventDefault();
            api.saveEditedMessage(Number(saveBtn.getAttribute('data-edit-save')));
            return;
        }
        var cancelBtn = e.target.closest('[data-edit-cancel]');
        if (cancelBtn) {
            e.preventDefault();
            state.editingId = null;
            api.renderMessages({ preserveScroll: true });
            return;
        }
        var deleteChoice = e.target.closest('[data-msg-delete]');
        if (deleteChoice) {
            e.preventDefault();
            api.closeMessageMenus();
            api.openDeletePrompt(Number(deleteChoice.getAttribute('data-msg-delete')));
            return;
        }
        var moreBtn = e.target.closest('[data-msg-more]');
        if (moreBtn) {
            e.preventDefault();
            e.stopPropagation();
            var wrapMore = moreBtn.closest('.comms-bubble-wrap');
            var menu = wrapMore ? wrapMore.querySelector('[data-msg-menu]') : null;
            var opening = menu && menu.hidden;
            api.closeMessageMenus();
            if (opening && menu) {
                menu.hidden = false;
                moreBtn.setAttribute('aria-expanded', 'true');
                if (wrapMore) wrapMore.classList.add('is-menu-open');
            }
        }
    });
    els.messages.addEventListener('pointerover', function (e) {
        var peopleBtn = e.target.closest('[data-react-people]');
        if (!peopleBtn || !els.messages.contains(peopleBtn)) return;
        var pid = Number(peopleBtn.getAttribute('data-react-people'));
        var pmsg = state.messages.find(function (m) { return Number(m.id) === pid; });
        var emojiEl = e.target.closest('[data-react-people-emoji]');
        if (Comms.showReactionPeople) {
            Comms.showReactionPeople(peopleBtn, pmsg ? pmsg.reactions : [], {
                pinned: false,
                emoji: emojiEl ? (emojiEl.getAttribute('data-react-people-emoji') || '') : ''
            });
        }
    });
    els.messages.addEventListener('pointerout', function (e) {
        var peopleBtn = e.target.closest('[data-react-people]');
        if (!peopleBtn) return;
        var related = e.relatedTarget;
        if (related && (peopleBtn.contains(related) || (related.closest && related.closest('#commsReactionPeople')))) {
            return;
        }
        if (Comms.scheduleHideReactionPeople) Comms.scheduleHideReactionPeople();
    });
}
pickerEl.addEventListener('click', function (e) {
    var emojiBtn = e.target.closest('[data-react-emoji]');
    if (!emojiBtn) return;
    e.preventDefault();
    e.stopPropagation();
    var mid = Number(state.openReactionPickerId);
    var emoji = emojiBtn.getAttribute('data-react-emoji');
    if (mid && emoji) {
        api.toggleReaction(mid, emoji);
    }
    api.closeReactionPickersDom();
});

document.addEventListener('click', function (e) {
    if (els.messages && !e.target.closest('[data-msg-more]') && !e.target.closest('[data-msg-menu]')) {
        api.closeMessageMenus();
    }
    if (!state.openReactionPickerId) return;
    if (e.target.closest('.comms-reaction-picker') || e.target.closest('[data-react-toggle]')) return;
    api.closeReactionPickersDom();
});

// Reposition picker on scroll/resize so it tracks the button
if (els.messages) {
    els.messages.addEventListener('scroll', function () {
        if (state.openReactionPickerId) { api.hideGlobalPicker(); }
        api.closeMessageMenus();
        api.syncScrollBottomBtn();
        if (els.messages.scrollTop <= 48) {
            api.loadOlderMessages();
        }
    }, { passive: true });
}
if (els.scrollBottom) {
    els.scrollBottom.addEventListener('click', function (e) {
        e.preventDefault();
        api.jumpToLatestMessages();
    });
}
window.addEventListener('resize', function () {
    if (state.openReactionPickerId) { api.hideGlobalPicker(); }
    api.syncScrollBottomBtn();
}, { passive: true });

if (els.directoryList) {
    els.directoryList.addEventListener('click', function (e) {
        var callBtn = e.target.closest('[data-dir-call]');
        if (callBtn) {
            api.openOrCallUser(callBtn.dataset.userId, callBtn.dataset.dirCall);
            return;
        }
        var openBtn = e.target.closest('[data-user-id]');
        if (openBtn) {
            api.openOrCallUser(openBtn.dataset.userId, null);
        }
    });
}

if (els.filterBar) {
    els.filterBar.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filter]');
        if (!btn) return;
        els.filterBar.querySelectorAll('.comms-filter-btn').forEach(function (el) {
            el.classList.toggle('is-active', el === btn);
        });
        var filter = btn.dataset.filter;
        if (filter === 'conversations') {
            api.setListMode('conversations');
            api.loadConversations();
            return;
        }
        state.directoryFilter = filter;
        api.setListMode(filter);
        api.loadDirectory();
    });
}

if (els.barangayFilter) {
    els.barangayFilter.addEventListener('change', function () {
        state.barangayId = els.barangayFilter.value || '';
        if (state.listMode !== 'conversations') {
            api.loadDirectory();
        }
    });
}

if (els.searchResults) {
    els.searchResults.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-user-id]');
        if (!btn) return;
        api.startConversationWithUser(btn.dataset.userId);
    });
}

if (els.convFilter) {
    els.convFilter.addEventListener('input', function () {
        clearTimeout(state.filterTimer);
        clearTimeout(state.searchTimer);
        var q = els.convFilter.value.trim();
        state.filterTimer = setTimeout(function () {
            if (state.listMode === 'conversations') {
                api.renderConversations(q);
            } else {
                api.filterDirectoryLocal(q);
            }
        }, 120);
        state.searchTimer = setTimeout(function () {
            api.searchUsers(q);
        }, 250);
    });
}

els.composer.addEventListener('submit', function (e) {
    e.preventDefault();
    api.sendMessage(els.input.value);
});

if (els.attachBtn && els.attachMenu && els.photoInput && els.fileInput) {
    els.attachMenu.hidden = true;
    els.attachBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        els.attachMenu.hidden = !els.attachMenu.hidden;
    });
    if (els.pickCameraBtn) {
        els.pickCameraBtn.addEventListener('click', function () {
            els.attachMenu.hidden = true;
            var isPhone = window.matchMedia('(max-width: 768px)').matches;
            if (!isPhone) {
                if (window.CommsLiveCamera && typeof window.CommsLiveCamera.close === 'function') {
                    window.CommsLiveCamera.close();
                }
                if (els.photoInput) {
                    els.photoInput.click();
                    return;
                }
            }
            if (window.CommsLiveCamera && typeof window.CommsLiveCamera.open === 'function') {
                var pendingImg = (state.pendingAttachments || []).filter(function (f) { return api.isImageFile(f); }).length;
                if (pendingImg >= (state.maxImageCount || 3)) {
                    Comms.showToast('Max 3 images per upload. Selection was not added.', 'error');
                    return;
                }
                window.CommsLiveCamera.open(function (file) {
                    if (file) api.pushPendingFiles([file], 'image');
                });
                return;
            }
            if (els.cameraInput) {
                if (!isPhone) els.cameraInput.removeAttribute('capture');
                els.cameraInput.click();
            }
        });
    }
    if (els.pickPhotosBtn) {
        els.pickPhotosBtn.addEventListener('click', function () {
            els.attachMenu.hidden = true;
            if (window.CommsLiveCamera && typeof window.CommsLiveCamera.close === 'function') {
                window.CommsLiveCamera.close();
            }
            els.photoInput.click();
        });
    }
    if (els.pickFilesBtn) {
        els.pickFilesBtn.addEventListener('click', function () {
            els.attachMenu.hidden = true;
            els.fileInput.click();
        });
    }
    if (els.cameraInput) {
        els.cameraInput.addEventListener('change', function () {
            api.pushPendingFiles(els.cameraInput.files, 'image');
            els.cameraInput.value = '';
        });
    }
    els.photoInput.addEventListener('change', function () {
        api.pushPendingFiles(els.photoInput.files, 'image');
        els.photoInput.value = '';
    });
    els.fileInput.addEventListener('change', function () {
        api.pushPendingFiles(els.fileInput.files, 'file');
        els.fileInput.value = '';
    });
}
if (els.attachClear) {
    els.attachClear.addEventListener('click', function () {
        api.clearPendingAttachment();
    });
}

els.input.addEventListener('input', function () {
    var next = api.clampMessageToMaxChars(els.input.value || '');
    if (next !== api.normalizeMessageBody(els.input.value || '')) {
        els.input.value = next;
        api.toastMessageCharLimit();
    }
    if (api.countMessageLines(els.input.value) > api.messageMaxLines()) {
        els.input.value = api.clampMessageToMaxLines(els.input.value);
        Comms.showToast('Message cannot exceed ' + api.messageMaxLines() + ' lines.', 'error');
    }
    els.input.classList.toggle('is-line-limit', api.countMessageLines(els.input.value) >= api.messageMaxLines());
    api.resizeComposer();
    api.syncComposerEndControls();
    api.notifyComposerTyping(els.input.value);
});

els.input.addEventListener('paste', function (e) {
    var paste = (e.clipboardData || window.clipboardData);
    if (!paste) return;
    var incoming = paste.getData('text');
    if (incoming == null) return;
    e.preventDefault();
    var start = els.input.selectionStart || 0;
    var end = els.input.selectionEnd || 0;
    var value = els.input.value || '';
    var raw = value.slice(0, start) + incoming + value.slice(end);
    var next = api.clampMessageToMaxChars(api.clampMessageToMaxLines(raw));
    els.input.value = next;
    if (next !== api.normalizeMessageBody(raw)) {
        api.toastMessageCharLimit();
    }
    els.input.classList.toggle('is-line-limit', api.countMessageLines(els.input.value) >= api.messageMaxLines());
    api.resizeComposer();
    api.syncComposerEndControls();
    api.notifyComposerTyping(els.input.value);
});

els.input.addEventListener('keydown', function (e) {
    // Enter = new line only. Ctrl/Cmd+Enter sends.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        api.sendMessage(els.input.value);
        return;
    }
    var current = api.normalizeMessageBody(els.input.value || '');
    if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
        if (api.messageCharCount(current + '\n') > state.messageMaxLength) {
            e.preventDefault();
            api.toastMessageCharLimit();
        }
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (api.messageCharCount(current + e.key) > state.messageMaxLength) {
            e.preventDefault();
            api.toastMessageCharLimit();
        }
    }
});

els.backBtn.addEventListener('click', function () {
    api.stopLocalTyping();
    api.setThreadOpen(false);
    state.activeId = null;
    window.__COMMS_PAGE_ACTIVE_ID__ = null;
    if (els.typing) {
        els.typing.hidden = true;
        els.typing.textContent = '';
    }
    els.threadActive.hidden = true;
    els.threadEmpty.hidden = false;
    api.renderConversations(els.convFilter.value);
});

function unlockOutgoingRingGesture() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
        if (!window.__commsRingCtx) window.__commsRingCtx = new AC();
        var ctx = window.__commsRingCtx;
        if (ctx.state === 'suspended') ctx.resume();
        if (!ctx._commsUnlocked) {
            var buffer = ctx.createBuffer(1, 1, 22050);
            var src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(ctx.destination);
            src.start(0);
            ctx._commsUnlocked = true;
        }
    } catch (err) { /* autoplay unlock is best-effort */ }
    if (state.activeId && window.CommsWebRTC && typeof window.CommsWebRTC.primeOutgoingRingtone === 'function') {
        window.CommsWebRTC.primeOutgoingRingtone();
    }
}

els.voiceBtn.addEventListener('click', function () {
    unlockOutgoingRingGesture();
    api.beginGroupOrDirectCall('voice');
});

els.videoBtn.addEventListener('click', function () {
    unlockOutgoingRingGesture();
    api.beginGroupOrDirectCall('video');
});

if (els.threadMenuBtn) {
    els.threadMenuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!els.threadMenu) return;
        var open = els.threadMenu.hidden;
        els.threadMenu.hidden = !open;
        els.threadMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
}
if (els.renameGroupBtn) {
    els.renameGroupBtn.addEventListener('click', function () {
        api.closeGroupModals();
        if (!state.activeConversation || !state.activeConversation.can_rename || !els.renameModal) return;
        if (els.renameInput) {
            els.renameInput.value = state.activeConversation.name
                || (state.activeConversation.other_user && state.activeConversation.other_user.name)
                || '';
        }
        els.renameModal.hidden = false;
        if (els.renameInput) els.renameInput.focus();
    });
}
if ((els.changeGroupPhotoBtn || els.groupPhotoBtn) && els.groupAvatarInput) {
    function openGroupPhotoPicker() {
        if (!state.activeConversation || !state.activeConversation.can_change_avatar) return;
        els.groupAvatarInput.value = '';
        els.groupAvatarInput.click();
    }
    if (els.changeGroupPhotoBtn) {
        els.changeGroupPhotoBtn.addEventListener('click', function () {
            api.closeGroupModals();
            openGroupPhotoPicker();
        });
    }
    if (els.groupPhotoBtn) {
        els.groupPhotoBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openGroupPhotoPicker();
        });
    }
    els.groupAvatarInput.addEventListener('change', function () {
        var file = els.groupAvatarInput.files && els.groupAvatarInput.files[0];
        if (!file || !state.activeId || !routes.conversationAvatar) return;
        if (file.size > 10 * 1024 * 1024) {
            Comms.showToast('Group photo must be 10 MB or smaller.', 'error');
            return;
        }
        var fd = new FormData();
        fd.append('avatar', file);
        Comms.showToast('Uploading group photo…', 'info');
        fetch(Comms.route(routes.conversationAvatar, state.activeId), {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin',
            body: fd
        })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error((data && (data.message || (data.errors && data.errors.avatar && data.errors.avatar[0]))) || 'Upload failed.');
                    return data;
                });
            })
            .then(function (data) {
                if (data && data.conversation) {
                    state.activeConversation = data.conversation;
                    api.updatePeerHeader(data.conversation);
                    api.loadConversations();
                }
                Comms.showToast('Group photo updated.', 'success');
            })
            .catch(function (err) {
                Comms.showToast(err.message || 'Unable to update group photo.', 'error');
            })
            .finally(function () {
                els.groupAvatarInput.value = '';
            });
    });
}
if (els.viewMembersBtn) {
    els.viewMembersBtn.addEventListener('click', function () {
        api.closeGroupModals();
        api.openGroupInfoModal('members');
    });
}
if (els.groupInfoBtn) {
    els.groupInfoBtn.addEventListener('click', function () {
        api.closeGroupModals();
        api.openGroupInfoModal('info');
    });
}
if (els.peerMeta) {
    els.peerMeta.addEventListener('click', function () {
        if (!api.isGroupConversation(state.activeConversation)) return;
        api.openGroupInfoModal('members');
    });
    els.peerMeta.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (!api.isGroupConversation(state.activeConversation)) return;
        e.preventDefault();
        api.openGroupInfoModal('members');
    });
}
if (els.peerAvatarWrap) {
    els.peerAvatarWrap.addEventListener('click', function () {
        if (!api.isGroupConversation(state.activeConversation)) return;
        api.openGroupInfoModal('info');
    });
}
// Students/Teachers: the shared "Capstone 2" group is the only group.
// There is no create-group UI and no code path that can create one.
if (els.renameForm) {
    els.renameForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!state.activeId || !routes.renameConversation || !els.renameInput) return;
        if (els.renameSubmit && els.renameSubmit.disabled) return;
        var name = String(els.renameInput.value || '').trim();
        if (!name) {
            Comms.showToast('Group name is required.', 'error');
            return;
        }
        if (els.renameSubmit) {
            els.renameSubmit.disabled = true;
            els.renameSubmit.textContent = 'Saving...';
        }
        if (els.renameInput) els.renameInput.disabled = true;
        Comms.api(Comms.route(routes.renameConversation, state.activeId), {
            method: 'PATCH',
            body: JSON.stringify({ name: name }),
            dedupe: false
        }).then(function (data) {
            if (data && data.conversation) {
                state.activeConversation = data.conversation;
                api.updatePeerHeader(data.conversation);
                api.loadConversations();
            }
            api.closeGroupModals();
            Comms.showToast('Group renamed.', 'success');
        }).catch(function (err) {
            Comms.showToast(err.message || 'Unable to rename group.', 'error');
        }).finally(function () {
            if (els.renameSubmit) {
                els.renameSubmit.disabled = false;
                els.renameSubmit.textContent = 'Save';
            }
            if (els.renameInput) els.renameInput.disabled = false;
        });
    });
}
document.querySelectorAll('[data-comms-group-close]').forEach(function (el) {
    el.addEventListener('click', function () { api.closeGroupModals(); });
});
document.querySelectorAll('[data-comms-rename-close]').forEach(function (el) {
    el.addEventListener('click', function () { api.closeGroupModals(); });
});
if (els.groupModalBody) {
    els.groupModalBody.addEventListener('click', function (e) {
        // Handle call buttons (existing functionality)
        var btn = e.target.closest('.comms-group-call-btn');
        if (btn && state.activeId) {
            var uid = Number(btn.getAttribute('data-user-id') || 0);
            var callType = btn.getAttribute('data-call-type') || 'voice';
            if (uid) {
                api.closeGroupModals();
                ctx.withWebrtc(function (api) {
                    api.startCall(state.activeId, callType, state.activeConversation, uid);
                });
            }
            return;
        }

        // Handle Message button
        var messageBtn = e.target.closest('.comms-member-message-btn');
        if (messageBtn) {
            var userId = Number(messageBtn.getAttribute('data-user-id') || 0);
            if (!userId) return;
            
            api.closeGroupModals();
            
            // Create or find private conversation with this member
            var url = routes.storeConversation || '/api/communications/conversations';
            window.Comms.api(url, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId }),
                dedupe: false
            })
            .then(function (data) {
                if (data && data.conversation) {
                    api.loadConversation(data.conversation.id);
                }
            })
            .catch(function (err) {
                console.error('Failed to create conversation:', err);
                window.Comms.showToast('Failed to start conversation.', 'error');
            });
            return;
        }

        // Handle Call button
        var callBtn = e.target.closest('.comms-member-call-btn');
        if (callBtn) {
            var userId = Number(callBtn.getAttribute('data-user-id') || 0);
            if (!userId) return;
            
            api.closeGroupModals();
            
            // Create conversation first, then start call
            var url = routes.storeConversation || '/api/communications/conversations';
            window.Comms.api(url, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId }),
                dedupe: false
            })
            .then(function (data) {
                if (data && data.conversation) {
                    ctx.withWebrtc(function (api) {
                        api.startCall(data.conversation.id, 'video', data.conversation);
                    });
                }
            })
            .catch(function (err) {
                console.error('Failed to start call:', err);
                window.Comms.showToast('Failed to start call.', 'error');
            });
            return;
        }
    });
}

document.addEventListener('click', function (e) {
    if (els.searchResults && !els.searchResults.contains(e.target) && e.target !== els.convFilter) {
        els.searchResults.hidden = true;
    }
    if (els.attachMenu && !els.attachMenu.hidden && !e.target.closest('.comms-attach-menu-wrap')) {
        els.attachMenu.hidden = true;
    }
    if (els.threadMenu && !els.threadMenu.hidden && !e.target.closest('.comms-thread-menu-wrap')) {
        els.threadMenu.hidden = true;
        if (els.threadMenuBtn) els.threadMenuBtn.setAttribute('aria-expanded', 'false');
    }
});
document.addEventListener('click', function (e) {
    var joinBtn = e.target.closest('[data-join-group-call]');
    if (!joinBtn) return;
    e.preventDefault();
    var joinId = joinBtn.getAttribute('data-join-group-call') || state.activeId;
    ctx.withWebrtc(function (api) {
        if (typeof api.joinActiveGroupCall === 'function') {
            api.joinActiveGroupCall(joinId);
        }
    });
});

// =========================================================================

    Object.assign(api, {

    });

    ctx.markAllBtn = markAllBtn;
    ctx.markAllBusy = markAllBusy;
    ctx.pickerEl = pickerEl;
    ctx.reactBtnIcon = reactBtnIcon;
    ctx.callPhoneIcon = callPhoneIcon;
}
