/**
 * Chat manager — attachments
 */
export function register(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var els = ctx.els;
    var routes = ctx.routes;
    var api = ctx.api;
    var withWebrtc = ctx.withWebrtc;
    var Comms = window.Comms;

function renderAttachments(attachments) {
    var items = Array.isArray(attachments) ? attachments : [];
    if (!items.length) return '';
    return items.map(function (att) {
        if (att.file_type === 'image' || att.storage_provider === 'cloudinary') {
            var src = att.url || att.download_url;
            return '<button type="button" class="comms-bubble-image" data-comms-lightbox-src="' + Comms.escapeHtml(src) + '" aria-label="View image">' +
                '<img src="' + Comms.escapeHtml(src) + '" alt="' + Comms.escapeHtml(att.file_name || 'Image') + '" loading="lazy">' +
                '</button>';
        }
        var kind = api.fileKindClass(att);
        var href = att.download_url || '';
        var name = att.file_name || 'Document';
        var sizeLabel = api.formatBytes(att.file_size);
        var metaHtml = '<span class="comms-bubble-file-ext" aria-hidden="true">' + api.fileDocIconSvg() + '</span>' +
            '<span class="comms-bubble-file-meta">' +
            '<span class="comms-bubble-file-name">' + Comms.escapeHtml(name) + '</span>' +
            (sizeLabel ? '<span class="comms-bubble-file-size">' + Comms.escapeHtml(sizeLabel) + '</span>' : '') +
            '</span>';
        if (kind.indexOf('is-pdf') !== -1 && href) {
            return '<a class="comms-bubble-file' + kind + '" href="' + Comms.escapeHtml(href) + '" download="' + Comms.escapeHtml(name) + '" target="_blank" rel="noopener noreferrer" title="' + Comms.escapeHtml(name) + '">' +
                metaHtml +
                '</a>';
        }
        return '<a class="comms-bubble-file' + kind + '" href="' + Comms.escapeHtml(href) + '" download="' + Comms.escapeHtml(name) + '" target="_blank" rel="noopener noreferrer" title="' + Comms.escapeHtml(name) + '">' +
            metaHtml +
            '</a>';
    }).join('');
}

function clearPendingAttachment() {
    state.pendingPreviewUrls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (e) {}
    });
    state.pendingAttachments = [];
    state.pendingPreviewUrls = [];
    state.pendingAttachment = null;
    state.pendingPreviewUrl = null;
    if (els.photoInput) els.photoInput.value = '';
    if (els.cameraInput) els.cameraInput.value = '';
    if (els.fileInput) els.fileInput.value = '';
    if (els.attachPreview) els.attachPreview.hidden = true;
    if (els.attachPreviewInner) els.attachPreviewInner.innerHTML = '';
    setUploadProgress(0, true);
    syncComposerEndControls();
}

function setUploadProgress(percent, hidden) {
    if (!els.uploadProgress || !els.uploadProgressBar) return;
    if (hidden) {
        els.uploadProgress.hidden = true;
        els.uploadProgressBar.style.width = '0%';
        return;
    }
    els.uploadProgress.hidden = false;
    els.uploadProgressBar.style.width = Math.max(0, Math.min(100, percent)) + '%';
}

function isImageFile(file) {
    return String((file && file.type) || '').indexOf('image/') === 0;
}

function syncComposerEndControls() {
    if (!els.sendBtn) return;
    var hasText = !!String(els.input && els.input.value || '').length;
    var hasFiles = (state.pendingAttachments || []).length > 0;
    var canSend = hasText || hasFiles;
    els.sendBtn.hidden = false;
    els.sendBtn.disabled = !!state.sendInFlight || !canSend;
    els.sendBtn.classList.toggle('is-ready', canSend);
    els.sendBtn.title = 'Send';
}

function messageMaxLines() {
    var fromDom = Number(els.input && els.input.getAttribute('data-max-lines'));
    return Math.max(1, Number.isFinite(fromDom) && fromDom > 0 ? fromDom : 500);
}

function countMessageLines(raw) {
    var body = normalizeMessageBody(raw);
    if (body === '') return 0;
    return body.split('\n').length;
}

function clampMessageToMaxLines(text) {
    var max = messageMaxLines();
    var lines = normalizeMessageBody(text).split('\n');
    if (lines.length <= max) return lines.join('\n');
    return lines.slice(0, max).join('\n');
}

function normalizeMessageBody(raw) {
    if (Comms.normalizeMessageBody) {
        return Comms.normalizeMessageBody(raw);
    }
    return String(raw == null ? '' : raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function messageCharCount(raw) {
    var body = normalizeMessageBody(raw);
    if (Comms.measureMessageLength) {
        return Comms.measureMessageLength(body);
    }
    return body.length;
}

function validateMessageBody(raw, opts) {
    opts = opts || {};
    var body = normalizeMessageBody(raw);
    var allowEmpty = !!opts.allowEmpty;
    if (!allowEmpty && body.trim() === '') {
        Comms.showToast('Message cannot be empty.', 'error');
        return null;
    }
    if (countMessageLines(body) > messageMaxLines()) {
        Comms.showToast('Message cannot exceed ' + messageMaxLines() + ' lines.', 'error');
        return null;
    }
    var count = messageCharCount(body);
    if (count > state.messageMaxLength) {
        Comms.showToast('Message cannot exceed 1000 characters.', 'error');
        return null;
    }
    return body;
}

function clampMessageToMaxChars(text) {
    var next = normalizeMessageBody(text);
    if (next.length <= state.messageMaxLength) return next;
    return next.slice(0, state.messageMaxLength);
}

function toastMessageCharLimit() {
    Comms.showToast('Message cannot exceed 1000 characters.', 'error');
}

function removePendingAttachmentAt(index) {
    var i = Number(index);
    if (!Number.isFinite(i) || i < 0 || i >= (state.pendingAttachments || []).length) return;
    var url = state.pendingPreviewUrls[i];
    if (url) {
        try { URL.revokeObjectURL(url); } catch (e) {}
    }
    state.pendingAttachments.splice(i, 1);
    state.pendingPreviewUrls.splice(i, 1);
    state.pendingAttachment = state.pendingAttachments[0] || null;
    state.pendingPreviewUrl = state.pendingPreviewUrls[0] || null;
    renderAttachPreview();
    syncComposerEndControls();
}

function renderAttachPreview() {
    if (!els.attachPreview || !els.attachPreviewInner) return;
    var files = state.pendingAttachments || [];
    if (!files.length) {
        els.attachPreview.hidden = true;
        els.attachPreviewInner.innerHTML = '';
        return;
    }
    els.attachPreview.hidden = false;
    els.attachPreviewInner.innerHTML = files.map(function (f, i) {
        var name = Comms.escapeHtml(f.name || (isImageFile(f) ? 'Image' : 'File'));
        var removeBtn = '<button type="button" class="comms-attach-item-remove" data-attach-remove="' + i + '" title="Remove" aria-label="Remove ' + name + '">&times;</button>';
        if (isImageFile(f) && state.pendingPreviewUrls[i]) {
            var src = state.pendingPreviewUrls[i];
            return '<div class="comms-attach-preview-item is-image is-row">' +
                '<button type="button" class="comms-attach-preview-zoom" data-comms-lightbox-src="' + Comms.escapeHtml(src) + '" aria-label="View image">' +
                '<img src="' + Comms.escapeHtml(src) + '" alt="' + name + '"></button>' +
                '<span class="comms-attach-preview-name" title="' + name + '">' + name + '</span>' +
                removeBtn +
                '</div>';
        }
        return '<div class="comms-attach-preview-item comms-attach-preview-file is-row">' +
            '<strong>' + Comms.escapeHtml(api.fileExtLabel(f.name)) + '</strong>' +
            '<span class="comms-attach-preview-name" title="' + name + '">' + name + '</span>' +
            removeBtn +
            '</div>';
    }).join('');
    if (els.attachPreview.dataset.attachWired !== 'true') {
        els.attachPreview.addEventListener('click', function (e) {
            var removeBtn = e.target.closest('[data-attach-remove]');
            if (removeBtn && els.attachPreview.contains(removeBtn)) {
                e.preventDefault();
                e.stopPropagation();
                removePendingAttachmentAt(removeBtn.getAttribute('data-attach-remove'));
                return;
            }
            var thumb = e.target.closest('[data-comms-lightbox-src]');
            if (!thumb || !els.attachPreview.contains(thumb)) return;
            e.preventDefault();
            e.stopPropagation();
            var images = Array.prototype.slice.call(els.attachPreview.querySelectorAll('[data-comms-lightbox-src]')).map(function (node) {
                return node.getAttribute('data-comms-lightbox-src') || '';
            }).filter(Boolean);
            var start = thumb.getAttribute('data-comms-lightbox-src') || '';
            if (start && Comms.openImageLightbox) {
                if (Date.now() < (window.__commsIgnoreLightboxUntil || 0)) return;
                Comms.openImageLightbox(start, images, {
                    onRemoveAt: function (idx, src) {
                        var pendingIdx = (state.pendingPreviewUrls || []).indexOf(src);
                        if (pendingIdx >= 0) removePendingAttachmentAt(pendingIdx);
                    }
                });
            }
        });
        els.attachPreview.dataset.attachWired = 'true';
    }
}

function pushPendingFiles(files, kind) {
    var maxImg = state.maxImageCount || 3;
    var maxFile = state.maxFileCount || 10;
    var maxBytes = state.maxTotalBytes || (25 * 1024 * 1024);
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;

    var selectBytes = 0;
    var selectImg = 0;
    var selectFile = 0;
    list.forEach(function (f) {
        selectBytes += f.size || 0;
        if (isImageFile(f)) selectImg++;
        else selectFile++;
    });

    var pendingBytes = 0;
    var imgCount = 0;
    var fileCount = 0;
    (state.pendingAttachments || []).forEach(function (f) {
        pendingBytes += f.size || 0;
        if (isImageFile(f)) imgCount++;
        else fileCount++;
    });

    if (selectBytes > maxBytes || (pendingBytes + selectBytes) > maxBytes) {
        Comms.showToast('Maximum 25 MB only. Selection was not added.', 'error');
        return;
    }
    if (kind === 'image' && (imgCount + selectImg) > maxImg) {
        Comms.showToast('Max 3 images per upload. Selection was not added.', 'error');
        return;
    }
    if (kind !== 'image' && (fileCount + selectFile) > maxFile) {
        Comms.showToast('Max ' + maxFile + ' files. Selection was not added.', 'error');
        return;
    }

    list.forEach(function (f) {
        state.pendingAttachments.push(f);
        state.pendingPreviewUrls.push(isImageFile(f) ? URL.createObjectURL(f) : null);
    });
    state.pendingAttachment = state.pendingAttachments[0] || null;
    state.pendingPreviewUrl = state.pendingPreviewUrls[0] || null;
    renderAttachPreview();
    syncComposerEndControls();
}

function setPendingAttachment(file) {
    if (!file) return;
    pushPendingFiles([file], isImageFile(file) ? 'image' : 'file');
}

function syncScrollBottomBtn() {
    if (!els.scrollBottom || !els.messages) return;
    var el = els.messages;
    var distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    els.scrollBottom.hidden = distance < 80;
}

function jumpToLatestMessages() {
    if (!els.messages) return;
    var pin = function () {
        els.messages.scrollTop = els.messages.scrollHeight;
        syncScrollBottomBtn();
    };
    pin();
    window.requestAnimationFrame(function () {
        pin();
        window.requestAnimationFrame(pin);
    });
    window.setTimeout(pin, 50);
    window.setTimeout(pin, 200);
}

var msgMoreIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.85"/><circle cx="12" cy="12" r="1.85"/><circle cx="12" cy="19" r="1.85"/></svg>';


    Object.assign(api, {
        clampMessageToMaxChars: clampMessageToMaxChars,
        clampMessageToMaxLines: clampMessageToMaxLines,
        clearPendingAttachment: clearPendingAttachment,
        countMessageLines: countMessageLines,
        isImageFile: isImageFile,
        jumpToLatestMessages: jumpToLatestMessages,
        messageCharCount: messageCharCount,
        messageMaxLines: messageMaxLines,
        normalizeMessageBody: normalizeMessageBody,
        pushPendingFiles: pushPendingFiles,
        removePendingAttachmentAt: removePendingAttachmentAt,
        renderAttachPreview: renderAttachPreview,
        renderAttachments: renderAttachments,
        setPendingAttachment: setPendingAttachment,
        setUploadProgress: setUploadProgress,
        syncComposerEndControls: syncComposerEndControls,
        syncScrollBottomBtn: syncScrollBottomBtn,
        toastMessageCharLimit: toastMessageCharLimit,
        validateMessageBody: validateMessageBody
    });
}
