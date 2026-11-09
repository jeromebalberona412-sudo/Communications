/**
 * Shared Messages helpers (Students / Teachers).
 * Assembles window.Comms from modular chat helpers.
 */
import {
    csrfToken,
    escapeHtml,
    linkifyText,
    defaultAvatar,
    formatTime,
    route,
    api,
    debounce,
    rateLimitedState,
    showToast,
    playReactionSound,
    ensureReactionAudio,
    readCacheEntry,
    writeCacheEntry,
    readThreadCache,
    writeThreadCache,
    readInboxCache,
    writeInboxCache,
    cloneReactions,
    optimisticToggleReactions
} from './CommsCore.js';
import {
    showReactionPeople,
    toggleReactionPeople,
    hideReactionPeople,
    scheduleHideReactionPeople,
    openReactionModal,
    closeReactionModal
} from './CommsReactionsUi.js';
import {
    openImageLightbox,
    closeImageLightbox,
    wireChatImageLightbox
} from './CommsLightbox.js';
import {
    renderTypingIndicatorHtml,
    paintTypingEl,
    estimateComposerCharsPerLine,
    measureMessageLength,
    resizeGrowTextarea,
    openDeleteMessageDialog
} from './CommsComposerUi.js';

(function (window) {
    'use strict';

    if (window.Comms && window.Comms.__booted) {
        return;
    }

    window.Comms = {
        __booted: true,
        csrfToken: csrfToken,
        escapeHtml: escapeHtml,
        linkifyText: linkifyText,
        defaultAvatar: defaultAvatar,
        formatTime: formatTime,
        renderTypingIndicatorHtml: renderTypingIndicatorHtml,
        paintTypingEl: paintTypingEl,
        route: route,
        api: api,
        debounce: debounce,
        rateLimitedState: rateLimitedState,
        showToast: showToast,
        playReactionSound: playReactionSound,
        ensureReactionAudio: ensureReactionAudio,
        readCacheEntry: readCacheEntry,
        writeCacheEntry: writeCacheEntry,
        readThreadCache: readThreadCache,
        writeThreadCache: writeThreadCache,
        readInboxCache: readInboxCache,
        writeInboxCache: writeInboxCache,
        cloneReactions: cloneReactions,
        optimisticToggleReactions: optimisticToggleReactions,
        showReactionPeople: showReactionPeople,
        toggleReactionPeople: toggleReactionPeople,
        hideReactionPeople: hideReactionPeople,
        scheduleHideReactionPeople: scheduleHideReactionPeople,
        openReactionModal: openReactionModal,
        closeReactionModal: closeReactionModal,
        openImageLightbox: openImageLightbox,
        closeImageLightbox: closeImageLightbox,
        wireChatImageLightbox: wireChatImageLightbox,
        estimateComposerCharsPerLine: estimateComposerCharsPerLine,
        measureMessageLength: measureMessageLength,
        resizeGrowTextarea: resizeGrowTextarea,
        openDeleteMessageDialog: openDeleteMessageDialog
    };
})(typeof window !== 'undefined' ? window : globalThis);
