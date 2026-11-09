'use strict';

import { escapeHtml } from './CommsCore.js';
import { ensureReactionPeopleStyles } from './CommsReactionsUi.js';

var imageLightboxEl = null;
var imageLightboxState = { images: [], index: 0, zoom: 1, onRemoveAt: null };

function ensureImageLightbox() {
    ensureReactionPeopleStyles();
    if (imageLightboxEl) return imageLightboxEl;
    imageLightboxEl = document.createElement('div');
    imageLightboxEl.id = 'commsImageLightbox';
    imageLightboxEl.className = 'comms-image-lightbox';
    imageLightboxEl.hidden = true;
    imageLightboxEl.setAttribute('role', 'dialog');
    imageLightboxEl.setAttribute('aria-modal', 'true');
    imageLightboxEl.setAttribute('aria-label', 'Image preview');
    imageLightboxEl.innerHTML =
        '<div class="comms-image-lightbox-backdrop" data-comms-lightbox-close tabindex="-1"></div>' +
        '<button type="button" class="comms-image-lightbox-close" data-comms-lightbox-close aria-label="Close all">&times;</button>' +
        '<div class="comms-image-lightbox-counter" data-comms-lightbox-counter hidden></div>' +
        '<div class="comms-image-lightbox-stage">' +
        '<img class="comms-image-lightbox-img" alt="Full size image" draggable="false">' +
        '</div>' +
        '<div class="comms-image-lightbox-thumbs" data-comms-lightbox-thumbs hidden role="listbox" aria-label="Image thumbnails"></div>';
    document.body.appendChild(imageLightboxEl);
    imageLightboxEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-comms-lightbox-close]')) {
            closeImageLightbox();
            return;
        }
        var removeThumb = e.target.closest('[data-comms-lightbox-remove]');
        if (removeThumb) {
            e.preventDefault();
            e.stopPropagation();
            var removeIdx = Number(removeThumb.getAttribute('data-comms-lightbox-remove'));
            if (!Number.isNaN(removeIdx)) removeImageFromLightbox(removeIdx);
            return;
        }
        var thumb = e.target.closest('[data-comms-lightbox-thumb-index]');
        if (thumb) {
            var idx = Number(thumb.getAttribute('data-comms-lightbox-thumb-index'));
            if (!Number.isNaN(idx)) {
                imageLightboxState.index = idx;
                setImageLightboxZoom(1);
                renderImageLightbox();
            }
        }
    });
    imageLightboxEl.addEventListener('wheel', function (e) {
        if (imageLightboxEl.hidden) return;
        if (imageLightboxState.images.length < 2) return;
        e.preventDefault();
        if (e.deltaY > 0 || e.deltaX > 0) stepImageLightbox(1);
        else stepImageLightbox(-1);
    }, { passive: false });
    var swipe = { x: 0, y: 0, on: false };
    imageLightboxEl.addEventListener('pointerdown', function (e) {
        if (imageLightboxEl.hidden) return;
        if (e.target.closest('button, [data-comms-lightbox-thumbs]')) return;
        swipe.on = true;
        swipe.x = e.clientX;
        swipe.y = e.clientY;
        try { imageLightboxEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    imageLightboxEl.addEventListener('pointerup', function (e) {
        if (!swipe.on) return;
        swipe.on = false;
        var dx = e.clientX - swipe.x;
        var dy = e.clientY - swipe.y;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) stepImageLightbox(1);
        else stepImageLightbox(-1);
    });
    imageLightboxEl.addEventListener('pointercancel', function () { swipe.on = false; });
    document.addEventListener('keydown', function (e) {
        if (!imageLightboxEl || imageLightboxEl.hidden) return;
        if (e.key === 'Escape') closeImageLightbox();
        else if (e.key === 'ArrowLeft') stepImageLightbox(-1);
        else if (e.key === 'ArrowRight') stepImageLightbox(1);
        else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            removeImageFromLightbox(imageLightboxState.index);
        }
    });
    return imageLightboxEl;
}

function setImageLightboxZoom(next) {
    imageLightboxState.zoom = 1;
    var img = imageLightboxEl && imageLightboxEl.querySelector('.comms-image-lightbox-img');
    if (img) img.style.transform = '';
}

function uniqueLightboxSources(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (src) {
        var value = String(src || '').trim();
        if (!value || seen[value]) return;
        seen[value] = true;
        out.push(value);
    });
    return out;
}

function renderImageLightbox() {
    var el = ensureImageLightbox();
    var img = el.querySelector('.comms-image-lightbox-img');
    var counter = el.querySelector('[data-comms-lightbox-counter]');
    var prev = el.querySelector('[data-comms-lightbox-prev]');
    var next = el.querySelector('[data-comms-lightbox-next]');
    var thumbs = el.querySelector('[data-comms-lightbox-thumbs]');
    var list = imageLightboxState.images;
    var idx = imageLightboxState.index;
    if (!img || !list.length) return;
    img.src = list[idx];
    setImageLightboxZoom(imageLightboxState.zoom || 1);
    if (counter) {
        if (list.length > 1) {
            counter.hidden = false;
            counter.textContent = (idx + 1) + ' / ' + list.length;
        } else {
            counter.hidden = true;
            counter.textContent = '';
        }
    }
    if (prev) prev.hidden = list.length < 2;
    if (next) next.hidden = list.length < 2;
    if (thumbs) {
        thumbs.hidden = false;
        thumbs.innerHTML = list.map(function (src, i) {
            return '<div class="comms-image-lightbox-thumb-wrap' + (i === idx ? ' is-active' : '') + '">' +
                '<button type="button" class="comms-image-lightbox-thumb' + (i === idx ? ' is-active' : '') +
                '" data-comms-lightbox-thumb-index="' + i + '" role="option" aria-selected="' + (i === idx ? 'true' : 'false') + '">' +
                '<img src="' + escapeHtml(src) + '" alt=""></button>' +
                '<button type="button" class="comms-image-lightbox-thumb-remove" data-comms-lightbox-remove="' + i + '" title="Remove image" aria-label="Remove image">&times;</button>' +
                '</div>';
        }).join('');
        var activeThumb = thumbs.querySelector('.comms-image-lightbox-thumb-wrap.is-active, .comms-image-lightbox-thumb.is-active');
        if (activeThumb && typeof activeThumb.scrollIntoView === 'function') {
            activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }
}

function removeImageFromLightbox(index) {
    var list = imageLightboxState.images.slice();
    var i = Number(index);
    if (!Number.isFinite(i) || i < 0 || i >= list.length) return;
    var removedSrc = list[i];
    if (typeof imageLightboxState.onRemoveAt === 'function') {
        try { imageLightboxState.onRemoveAt(i, removedSrc); } catch (err) { /* ignore */ }
    }
    list.splice(i, 1);
    if (!list.length) {
        closeImageLightbox();
        return;
    }
    imageLightboxState.images = list;
    imageLightboxState.index = Math.min(i, list.length - 1);
    imageLightboxState.zoom = 1;
    renderImageLightbox();
}

export function openImageLightbox(src, images, options) {
    if (Date.now() < (window.__commsIgnoreLightboxUntil || 0)) {
        return;
    }
    options = options || {};
    var list = uniqueLightboxSources(Array.isArray(images) ? images : []);
    var start = String(src || '').trim();
    if (!list.length && start) list = [start];
    if (!list.length) return;
    var index = list.indexOf(start);
    if (index < 0) index = 0;
    imageLightboxState.images = list;
    imageLightboxState.index = index;
    imageLightboxState.zoom = 1;
    imageLightboxState.onRemoveAt = typeof options.onRemoveAt === 'function' ? options.onRemoveAt : null;
    ensureImageLightbox();
    renderImageLightbox();
    imageLightboxEl.hidden = false;
    imageLightboxEl.style.pointerEvents = '';
    document.body.classList.add('comms-image-lightbox-open');
}

export function closeImageLightbox() {
    if (!imageLightboxEl) return;
    imageLightboxEl.hidden = true;
    imageLightboxEl.style.pointerEvents = 'none';
    document.body.classList.remove('comms-image-lightbox-open');
    var img = imageLightboxEl.querySelector('.comms-image-lightbox-img');
    if (img) {
        img.removeAttribute('src');
        img.style.transform = '';
    }
    imageLightboxState.zoom = 1;
    imageLightboxState.onRemoveAt = null;
}

function stepImageLightbox(delta) {
    var list = imageLightboxState.images;
    if (list.length < 2) return;
    imageLightboxState.index = (imageLightboxState.index + delta + list.length) % list.length;
    imageLightboxState.zoom = 1;
    renderImageLightbox();
}

function collectLightboxGallery(thumb, root) {
    var start = '';
    if (thumb.tagName === 'IMG') {
        start = thumb.getAttribute('data-comms-lightbox-src') || thumb.currentSrc || thumb.src || '';
    } else {
        start = thumb.getAttribute('data-comms-lightbox-src') || thumb.getAttribute('href') || '';
        var nested = thumb.querySelector('img');
        if (!start && nested) start = nested.currentSrc || nested.src || '';
    }
    start = String(start || '').trim();
    if (!start) return { src: '', images: [] };

    var nodes = [];
    if (root) {
        nodes = Array.prototype.slice.call(root.querySelectorAll('[data-comms-lightbox-src]'));
    }
    if (!nodes.length) {
        var wrap = thumb.closest('[data-batch-id]');
        var batchId = wrap ? String(wrap.getAttribute('data-batch-id') || '') : '';
        if (batchId && root) {
            nodes = Array.prototype.slice.call(
                root.querySelectorAll('[data-batch-id="' + batchId.replace(/"/g, '') + '"] [data-comms-lightbox-src]')
            );
        }
    }
    if (!nodes.length) {
        var grid = thumb.closest('.comms-chat-attachment-grid, .comms-bubble-attachment-grid, .comms-bubble, .comms-chat-bubble');
        nodes = grid
            ? Array.prototype.slice.call(grid.querySelectorAll('[data-comms-lightbox-src]'))
            : [thumb.closest('[data-comms-lightbox-src]') || thumb];
    }
    var images = uniqueLightboxSources(nodes.map(function (node) {
        if (!node) return '';
        return node.getAttribute('data-comms-lightbox-src') ||
            (node.tagName === 'IMG' ? (node.currentSrc || node.src) : '') ||
            node.getAttribute('href') || '';
    }));
    return { src: start, images: images };
}

export function wireChatImageLightbox(root) {
    if (!root || root.dataset.commsLightboxWired === 'true') return;
    root.addEventListener('click', function (e) {
        if (e.target.closest('input, textarea, select, [contenteditable="true"], [data-logo-preview], [data-barangay-logo-upload], .admin-logo, .profile-logo-image, .user-avatar, .collab-logo')) {
            return;
        }
        var thumb = e.target.closest('[data-comms-lightbox-src], .comms-chat-attachment-grid img, .comms-bubble-image img, a.comms-bubble-image, button.comms-bubble-image');
        if (!thumb || !root.contains(thumb)) return;
        var gallery = collectLightboxGallery(thumb, root);
        if (!gallery.src) return;
        e.preventDefault();
        e.stopPropagation();
        openImageLightbox(gallery.src, gallery.images);
    });
    root.dataset.commsLightboxWired = 'true';
}
