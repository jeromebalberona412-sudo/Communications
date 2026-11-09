'use strict';

import { escapeHtml } from './CommsCore.js';

var deleteModalEl = null;
var deleteModalResolve = null;

function ensureDeleteModalStyles() {
    if (document.getElementById('commsDeleteModalStyles')) return;
    var style = document.createElement('style');
    style.id = 'commsDeleteModalStyles';
    style.textContent =
        '.comms-unsend-modal{position:fixed;inset:0;z-index:100080;display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:auto;}' +
        '.comms-unsend-modal[hidden]{display:none!important;}' +
        '.comms-unsend-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);}' +
        '.comms-unsend-card{position:relative;z-index:1;width:min(100%,500px);background:#fff;border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.22);overflow:hidden;box-sizing:border-box;}' +
        '.comms-unsend-close{position:absolute;top:12px;right:12px;width:36px;height:36px;border:0;border-radius:999px;background:#e4e6eb;color:#050505;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;}' +
        '.comms-unsend-close:hover,.comms-unsend-close:focus-visible{background:#d8dadf;outline:2px solid rgba(8,102,255,.35);outline-offset:2px;}' +
        '.comms-unsend-title{margin:0;padding:18px 52px 8px 16px;font-size:1.25rem;line-height:1.25;font-weight:700;color:#080809;text-align:center;font-family:inherit;}' +
        '.comms-unsend-options{display:flex;flex-direction:column;padding:8px 0 4px;}' +
        '.comms-unsend-option{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;cursor:pointer;margin:0;}' +
        '.comms-unsend-option[hidden]{display:none!important;}' +
        '.comms-unsend-option:hover{background:#f2f3f5;}' +
        '.comms-unsend-option input{appearance:none;-webkit-appearance:none;flex:0 0 auto;width:20px;height:20px;margin:2px 0 0;border:2px solid #ccd0d5;border-radius:50%;background:#fff;cursor:pointer;box-sizing:border-box;}' +
        '.comms-unsend-option input:checked{border-color:#0866FF;background:#0866FF;box-shadow:inset 0 0 0 3px #fff;}' +
        '.comms-unsend-option input:focus-visible{outline:2px solid rgba(8,102,255,.4);outline-offset:2px;}' +
        '.comms-unsend-option-copy{min-width:0;display:flex;flex-direction:column;gap:2px;}' +
        '.comms-unsend-option-label{font-size:.9375rem;font-weight:700;color:#080809;line-height:1.3;}' +
        '.comms-unsend-option-hint{font-size:.8125rem;font-weight:400;color:#65676b;line-height:1.35;}' +
        '.comms-unsend-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 16px 16px;border-top:1px solid #e4e6eb;}' +
        '.comms-unsend-cancel{border:0;background:transparent;color:#0866FF;font-size:.9375rem;font-weight:600;padding:.55rem .9rem;border-radius:6px;cursor:pointer;font-family:inherit;}' +
        '.comms-unsend-cancel:hover,.comms-unsend-cancel:focus-visible{background:#e7f3ff;outline:none;}' +
        '.comms-unsend-remove{border:0;background:#0866FF;color:#fff;font-size:.9375rem;font-weight:600;padding:.55rem 1.15rem;border-radius:6px;cursor:pointer;font-family:inherit;min-width:88px;}' +
        '.comms-unsend-remove:hover,.comms-unsend-remove:focus-visible{background:#0759dd;outline:2px solid rgba(8,102,255,.4);outline-offset:2px;}' +
        '@media (max-width:414px){.comms-unsend-card{border-radius:10px;width:100%;}.comms-unsend-title{font-size:1.05rem;padding:16px 48px 8px 12px;}.comms-unsend-option{padding:12px;}}';
    document.head.appendChild(style);
}

function ensureDeleteModal() {
    ensureDeleteModalStyles();
    if (deleteModalEl) return deleteModalEl;
    deleteModalEl = document.createElement('div');
    deleteModalEl.id = 'commsDeleteModal';
    deleteModalEl.className = 'comms-unsend-modal';
    deleteModalEl.hidden = true;
    deleteModalEl.setAttribute('role', 'dialog');
    deleteModalEl.setAttribute('aria-modal', 'true');
    deleteModalEl.setAttribute('aria-labelledby', 'commsDeleteModalTitle');
    deleteModalEl.innerHTML =
        '<div class="comms-unsend-backdrop" data-delete-cancel tabindex="-1"></div>' +
        '<div class="comms-unsend-card">' +
        '<button type="button" class="comms-unsend-close" data-delete-cancel aria-label="Close">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
        '<h3 class="comms-unsend-title" id="commsDeleteModalTitle">Who do you want to unsend this message for?</h3>' +
        '<div class="comms-unsend-options" role="radiogroup" aria-labelledby="commsDeleteModalTitle">' +
        '<label class="comms-unsend-option" id="commsDeleteModalAll">' +
        '<input type="radio" name="commsDeleteScope" value="all">' +
        '<span class="comms-unsend-option-copy">' +
        '<span class="comms-unsend-option-label">Unsend for everyone</span>' +
        '<span class="comms-unsend-option-hint">This message will be unsent for everyone in the chat. Others may have already seen or forwarded it.</span>' +
        '</span></label>' +
        '<label class="comms-unsend-option" id="commsDeleteModalMe">' +
        '<input type="radio" name="commsDeleteScope" value="me">' +
        '<span class="comms-unsend-option-copy">' +
        '<span class="comms-unsend-option-label">Unsend for you</span>' +
        '<span class="comms-unsend-option-hint">This message will be removed for you. Others in the chat will still be able to see it.</span>' +
        '</span></label>' +
        '</div>' +
        '<div class="comms-unsend-footer">' +
        '<button type="button" class="comms-unsend-cancel" data-delete-cancel>Cancel</button>' +
        '<button type="button" class="comms-unsend-remove" data-delete-confirm>Remove</button>' +
        '</div></div>';
    document.body.appendChild(deleteModalEl);

    deleteModalEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-delete-cancel]')) {
            closeDeleteMessageDialog(null);
            return;
        }
        if (e.target.closest('[data-delete-confirm]')) {
            var selected = deleteModalEl.querySelector('input[name="commsDeleteScope"]:checked');
            closeDeleteMessageDialog(selected ? selected.value : 'me');
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && deleteModalEl && !deleteModalEl.hidden) {
            closeDeleteMessageDialog(null);
        }
    });

    return deleteModalEl;
}

function closeDeleteMessageDialog(result) {
    if (!deleteModalEl) return;
    deleteModalEl.hidden = true;
    var resolve = deleteModalResolve;
    deleteModalResolve = null;
    if (typeof resolve === 'function') resolve(result);
}

export function openDeleteMessageDialog(options) {
    options = options || {};
    var modal = ensureDeleteModal();
    var title = document.getElementById('commsDeleteModalTitle');
    var allOpt = document.getElementById('commsDeleteModalAll');
    var allInput = allOpt ? allOpt.querySelector('input') : null;
    var meInput = modal.querySelector('#commsDeleteModalMe input');

    if (title) {
        title.textContent = options.canDeleteAll
            ? 'Who do you want to unsend this message for?'
            : 'Remove this message?';
    }
    if (allOpt) {
        allOpt.hidden = !options.canDeleteAll;
    }
    if (allInput) {
        allInput.disabled = !options.canDeleteAll;
        allInput.checked = !!options.canDeleteAll;
    }
    if (meInput) {
        meInput.checked = !options.canDeleteAll;
    }

    if (deleteModalResolve) {
        deleteModalResolve(null);
        deleteModalResolve = null;
    }

    modal.hidden = false;
    window.setTimeout(function () {
        var confirmBtn = modal.querySelector('[data-delete-confirm]');
        if (confirmBtn) confirmBtn.focus();
    }, 0);

    return new Promise(function (resolve) {
        deleteModalResolve = resolve;
    });
}

export function renderTypingIndicatorHtml(meta) {
    var who = meta && meta.name ? String(meta.name).trim() : '';
    var label = who ? (who + ' is typing...') : 'Typing...';
    return '<div class="comms-typing-row">' +
        '<span class="visually-hidden">' + escapeHtml(label) + '</span>' +
        '<div class="comms-typing-bubble" aria-hidden="true">' +
        '<span class="comms-typing-dot"></span>' +
        '<span class="comms-typing-dot"></span>' +
        '<span class="comms-typing-dot"></span>' +
        '</div>' +
        '<span class="comms-typing-label" aria-hidden="true">' + escapeHtml(label) + '</span>' +
        '</div>';
}

export function paintTypingEl(el, visible, meta) {
    if (!el) return;
    if (!visible) {
        el.hidden = true;
        el.innerHTML = '';
        el.textContent = '';
        return;
    }
    el.innerHTML = renderTypingIndicatorHtml(meta || null);
    el.hidden = false;
}

export function estimateComposerCharsPerLine(el) {
    if (!el || !el.clientWidth) return 36;
    var style = window.getComputedStyle(el);
    var fontSize = parseFloat(style.fontSize) || 14;
    var pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    var width = Math.max(0, el.clientWidth - pad);
    return Math.max(16, Math.floor(width / Math.max(fontSize * 0.55, 7)));
}

export function measureMessageLength(text, charsPerLine) {
    var cpl = Math.max(8, Number(charsPerLine) || 36);
    var lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
    var total = 0;
    for (var i = 0; i < lines.length; i += 1) {
        var len = lines[i].length;
        if (i < lines.length - 1) {
            total += Math.max(cpl, len);
        } else {
            total += len;
        }
    }
    return total;
}

export function resizeGrowTextarea(el, maxVisibleLines, minVisibleLines) {
    if (!el) return;
    var maxLines = Math.max(1, Number(maxVisibleLines) || 4);
    var minLines = Math.max(1, Math.min(maxLines, Number(minVisibleLines) || 1));
    var styles = window.getComputedStyle(el);
    var fontSize = parseFloat(styles.fontSize) || 15;
    var lineHeight = fontSize * 1.45;
    var padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    var borderY = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
    var minH = Math.ceil((lineHeight * minLines) + padY + borderY);
    var maxH = Math.ceil((lineHeight * maxLines) + padY + borderY);
    el.style.fieldSizing = 'fixed';
    el.style.resize = 'none';
    el.style.boxSizing = 'border-box';
    el.style.minHeight = minH + 'px';
    el.style.maxHeight = maxH + 'px';
    el.style.overflowY = 'hidden';
    el.style.height = minH + 'px';
    var contentH = el.scrollHeight;
    var next = Math.min(Math.max(contentH, minH), maxH);
    el.style.height = next + 'px';
    if (contentH > maxH + 1) {
        el.style.overflowY = 'auto';
        el.scrollTop = el.scrollHeight;
    } else {
        el.style.overflowY = 'hidden';
    }
}
