/**
 * SK Officials — Chat Automations / FAQ management.
 */
(function () {
    'use strict';

    var root = document.getElementById('commsAutomationsApp');
    if (!root) return;

    var routes = {};
    try {
        routes = JSON.parse(root.getAttribute('data-routes') || '{}');
    } catch (e) {
        routes = {};
    }

    var RESPONSE_MAX = 500;
    var QUESTION_MAX = 50;

    var cacheKey = 'comms_auto_faq_v1_' + String(root.getAttribute('data-user-id') || '0');
    var CACHE_TTL_MS = 5 * 60 * 1000;

    var state = {
        automation: null,
        faqs: [],
        saving: false,
        deleteId: null,
        deleting: false,
        toggleInFlight: false,
        faqToggleInFlight: {},
        loading: false,
        /** @type {Object.<string, boolean>} FAQ id → response hidden */
        responseHidden: {}
    };

    var els = {};

    function refreshEls() {
        els = {
            loading: document.getElementById('commsAutoLoading'),
            masterToggle: document.getElementById('commsMasterToggle'),
            masterLabel: document.getElementById('commsMasterToggleLabel'),
            disabledBanner: document.getElementById('commsDisabledBanner'),
            enableNowBtn: document.getElementById('commsEnableNowBtn'),
            faqCount: document.getElementById('commsFaqCount'),
            faqList: document.getElementById('commsFaqList'),
            faqEmpty: document.getElementById('commsFaqEmpty'),
            addBtn: document.getElementById('commsAddFaqBtn'),
            emptyAddBtn: document.getElementById('commsEmptyAddBtn'),
            form: document.getElementById('commsFaqForm'),
            faqId: document.getElementById('commsFaqId'),
            question: document.getElementById('commsFaqQuestion'),
            response: document.getElementById('commsFaqResponse'),
            active: document.getElementById('commsFaqActive'),
            questionCount: document.getElementById('commsFaqQuestionCount'),
            responseCount: document.getElementById('commsFaqResponseCount'),
            questionError: document.getElementById('commsFaqQuestionError'),
            responseError: document.getElementById('commsFaqResponseError'),
            modalTitle: document.getElementById('commsFaqModalTitle'),
            saveBtn: document.getElementById('commsFaqSaveBtn'),
            deleteConfirm: document.getElementById('commsFaqDeleteConfirm'),
            modalDialog: document.getElementById('commsFaqModalDialog'),
            maximizeBtn: null
        };
        return !!(els.faqList && els.masterToggle && els.form && els.question && els.response);
    }

    var faqModal = null;
    var deleteModal = null;

    function setFaqModalMaximized() {
        // Fullscreen toggle removed for a compact professional modal.
    }

    function csrf() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    function toast(message, type) {
        type = type || 'info';
        var existing = document.getElementById('commsAutoToast');
        if (existing) existing.remove();
        var el = document.createElement('div');
        el.id = 'commsAutoToast';
        el.className = 'comms-app-toast' + (type === 'error' ? ' is-error' : ' is-success');
        el.setAttribute('role', 'status');
        el.textContent = message;
        el.style.cssText = 'position:fixed;z-index:4000;top:24px;left:50%;transform:translateX(-50%);' +
            'background:' + (type === 'error' ? '#ef4444' : '#22c55e') +
            ';color:#fff;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;' +
            'max-width:min(92vw,420px);box-shadow:0 8px 24px rgba(0,0,0,.2);text-align:center;';
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 3200);
    }

    function setLoading(on) {
        state.loading = !!on;
        if (els.loading) {
            els.loading.hidden = !on;
            if (on) {
                els.loading.innerHTML =
                    '<div class="comms-auto-spinner" aria-hidden="true"></div>' +
                    '<p>Loading message automations…</p>';
            }
        }
        if (els.faqList) els.faqList.setAttribute('aria-busy', on ? 'true' : 'false');
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function route(template, id) {
        return String(template || '').replace('__ID__', String(id));
    }

    function sanitizeResponseText(value) {
        return String(value == null ? '' : value)
            .replace(/\r\n/g, ' ')
            .replace(/[\r\n\u2028\u2029]/g, ' ')
            .replace(/[ \t\f\v]+/g, ' ');
    }

    function estimateCharsPerLine(textarea) {
        if (!textarea) return 36;
        var style = window.getComputedStyle(textarea);
        var fontSize = parseFloat(style.fontSize) || 14;
        var pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        var width = Math.max(0, textarea.clientWidth - pad);
        return Math.max(16, Math.floor(width / Math.max(fontSize * 0.55, 7)));
    }

    function measureWeightedLength(text, cpl) {
        if (window.Comms && typeof window.Comms.measureMessageLength === 'function') {
            return window.Comms.measureMessageLength(text, cpl);
        }
        var charsPerLine = Math.max(8, Number(cpl) || 36);
        var lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
        var total = 0;
        for (var i = 0; i < lines.length; i += 1) {
            var len = lines[i].length;
            if (i < lines.length - 1) {
                total += Math.max(charsPerLine, len);
            } else {
                total += len;
            }
        }
        return total;
    }

    function responseWeightedLength() {
        if (!els.response) return 0;
        return measureWeightedLength(els.response.value || '', estimateCharsPerLine(els.response));
    }

    function readCache() {
        try {
            var raw = sessionStorage.getItem(cacheKey);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || !parsed.at || !parsed.automation) return null;
            if (Date.now() - Number(parsed.at) > CACHE_TTL_MS) return null;
            return parsed.automation;
        } catch (e) {
            return null;
        }
    }

    function writeCache(automation) {
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
                at: Date.now(),
                automation: automation
            }));
        } catch (e) { /* ignore quota */ }
    }

    function clearCache() {
        try { sessionStorage.removeItem(cacheKey); } catch (e) { /* ignore */ }
    }

    function applyAutomation(automation) {
        state.automation = automation || {};
        state.faqs = state.automation.faqs || [];
        render();
    }

    function api(url, options) {
        options = options || {};
        var headers = Object.assign({
            'Accept': 'application/json',
            'X-CSRF-TOKEN': csrf(),
            'X-Requested-With': 'XMLHttpRequest'
        }, options.headers || {});

        if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }

        return fetch(url, Object.assign({}, options, { headers: headers, credentials: 'same-origin' }))
            .then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    if (!res.ok) {
                        var msg = data.message
                            || (data.errors && Object.values(data.errors).flat()[0])
                            || 'Request failed.';
                        var err = new Error(msg);
                        err.status = res.status;
                        err.data = data;
                        throw err;
                    }
                    return data;
                });
            });
    }

    function updateCounters() {
        if (els.questionCount && els.question) {
            els.questionCount.textContent = (els.question.value || '').length + ' / ' + QUESTION_MAX;
        }
        if (els.responseCount) {
            var weighted = responseWeightedLength();
            els.responseCount.textContent = weighted + ' / ' + RESPONSE_MAX;
            els.responseCount.classList.toggle('is-over', weighted > RESPONSE_MAX);
        }
    }

    function clearFieldErrors() {
        if (els.questionError) els.questionError.hidden = true;
        if (els.responseError) els.responseError.hidden = true;
        if (els.question) els.question.classList.remove('is-invalid');
        if (els.response) els.response.classList.remove('is-invalid');
    }

    function setMasterUi(enabled) {
        if (!els.masterToggle || !els.masterLabel || !els.disabledBanner) return;
        els.masterToggle.checked = !!enabled;
        els.masterLabel.textContent = enabled ? 'On' : 'Off';
        els.disabledBanner.hidden = !!enabled;
        var masterSwitch = els.masterToggle.closest('.comms-switch');
        if (masterSwitch) {
            masterSwitch.classList.toggle('is-on', !!enabled);
            masterSwitch.classList.toggle('is-off', !enabled);
        }
    }

    function setMasterEnabled(enabled) {
        if (state.toggleInFlight) return;
        enabled = !!enabled;
        setMasterUi(enabled);
        if (state.automation) state.automation.is_enabled = enabled;
        state.toggleInFlight = true;
        api(routes.toggle, { method: 'PATCH', body: { is_enabled: enabled } })
            .then(function (data) {
                toast(
                    enabled
                        ? 'FAQs are On — Kabataan will see quick-reply chips above the chat box.'
                        : (data.message || 'Automation settings updated.'),
                    'success'
                );
                applyAutomation(data.automation || state.automation);
                writeCache(state.automation);
            })
            .catch(function (err) {
                setMasterUi(!enabled);
                if (state.automation) state.automation.is_enabled = !enabled;
                toast(err.message || 'Unable to update automation settings.', 'error');
            })
            .finally(function () {
                state.toggleInFlight = false;
            });
    }

    function render() {
        if (!els.faqList || !els.faqCount || !els.addBtn || !els.faqEmpty) return;
        var faqs = state.faqs || [];
        var max = (state.automation && state.automation.max_faqs) || 10;
        var atLimit = faqs.length >= max;
        els.faqCount.textContent = faqs.length + ' / ' + max + ' questions';
        // Allow Add anytime under the 10 max; only disable at the limit.
        els.addBtn.disabled = atLimit;
        if (els.emptyAddBtn) {
            els.emptyAddBtn.disabled = atLimit;
        }
        setMasterUi(state.automation ? state.automation.is_enabled : true);

        if (!faqs.length) {
            els.faqList.innerHTML = '';
            els.faqEmpty.hidden = false;
            if (els.addBtn) els.addBtn.hidden = true;
            return;
        }

        els.faqEmpty.hidden = true;
        if (els.addBtn) els.addBtn.hidden = false;
        els.faqList.innerHTML = faqs.map(function (faq, index) {
            var fullResponse = sanitizeResponseText(faq.automated_response || '');
            var statusLabel = faq.is_active ? 'Shown to Kabataan' : 'Hidden from Kabataan';
            var statusClass = faq.is_active ? 'is-shown' : 'is-hidden';
            var faqKey = String(faq.id);
            var responseHidden = !!state.responseHidden[faqKey];
            var toggleLabel = responseHidden ? 'Show Response' : 'Hide Response';
            var responsePanelId = 'commsFaqResponsePanel-' + faqKey;
            var menuId = 'commsFaqMoreMenu-' + faqKey;
            return (
                '<article class="comms-auto-faq-card' + (faq.is_active ? '' : ' is-inactive') + (responseHidden ? ' is-response-hidden' : '') + '" role="listitem" data-id="' + faq.id + '">' +
                    '<div class="comms-auto-faq-top">' +
                        '<div class="comms-auto-faq-top-main">' +
                            '<h3 class="comms-auto-faq-question">' +
                                '<span class="comms-auto-faq-num">' + (index + 1) + '.</span> ' +
                                escapeHtml(faq.question) +
                            '</h3>' +
                            '<div class="comms-auto-faq-status-row">' +
                                '<span class="comms-auto-faq-status-chip ' + statusClass + '">' +
                                    '<span class="comms-auto-faq-status-dot" aria-hidden="true"></span>' +
                                    escapeHtml(statusLabel) +
                                '</span>' +
                                '<label class="comms-switch' + (faq.is_active ? ' is-on' : ' is-off') + '" title="' + (faq.is_active ? 'Active' : 'Inactive') + '">' +
                                    '<input type="checkbox" data-action="toggle-active" ' + (faq.is_active ? 'checked' : '') + '>' +
                                    '<span class="comms-switch-slider" aria-hidden="true"></span>' +
                                    '<span class="visually-hidden">Toggle FAQ active for Kabataan</span>' +
                                '</label>' +
                            '</div>' +
                        '</div>' +
                        '<div class="comms-auto-more-wrap">' +
                            '<button type="button" class="comms-auto-more-btn" data-action="more" aria-haspopup="true" aria-expanded="false" aria-controls="' + menuId + '" title="More actions" aria-label="More actions">' +
                                '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
                                    '<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>' +
                                '</svg>' +
                            '</button>' +
                            '<div class="comms-auto-more-menu" id="' + menuId + '" role="menu" hidden>' +
                                '<button type="button" class="is-toggle" role="menuitem" data-action="toggle-response" aria-controls="' + responsePanelId + '" aria-expanded="' + (responseHidden ? 'false' : 'true') + '">' + toggleLabel + '</button>' +
                                '<button type="button" class="is-edit edit-button" role="menuitem" data-action="edit">Edit</button>' +
                                '<button type="button" class="is-danger" role="menuitem" data-action="delete">Delete</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="comms-auto-faq-response-panel" id="' + responsePanelId + '"' + (responseHidden ? ' hidden' : '') + '>' +
                        '<p class="comms-auto-faq-response-label">Response</p>' +
                        '<p class="comms-auto-faq-response">' + escapeHtml(fullResponse) + '</p>' +
                    '</div>' +
                    (responseHidden
                        ? '<div class="comms-auto-faq-response-hidden" data-action="toggle-response" role="button" tabindex="0" aria-label="Show Response">' +
                            '<span>Response is hidden. Tap Show Response to view.</span>' +
                          '</div>'
                        : '') +
                '</article>'
            );
        }).join('');
    }

    function load(opts) {
        opts = opts || {};
        var cached = !opts.force ? readCache() : null;
        if (cached) {
            applyAutomation(cached);
            setLoading(false);
            // Soft refresh in background.
            api(routes.show).then(function (data) {
                if (data && data.automation) {
                    writeCache(data.automation);
                    applyAutomation(data.automation);
                }
            }).catch(function () { /* keep cache */ });
            return Promise.resolve();
        }

        setLoading(true);
        return api(routes.show).then(function (data) {
            applyAutomation(data.automation || {});
            writeCache(data.automation || {});
        }).catch(function (err) {
            toast(err.message || 'Unable to load automations.', 'error');
        }).finally(function () {
            setLoading(false);
        });
    }

    function ensureModals() {
        var faqModalEl = document.getElementById('commsFaqModal');
        var deleteModalEl = document.getElementById('commsFaqDeleteModal');
        if (window.bootstrap) {
            if (faqModalEl) {
                faqModal = bootstrap.Modal.getOrCreateInstance(faqModalEl);
            }
            if (deleteModalEl) {
                deleteModal = bootstrap.Modal.getOrCreateInstance(deleteModalEl);
            }
        }
        return !!(faqModal && deleteModal);
    }

    function showFaqModal() {
        ensureModals();
        if (faqModal) {
            faqModal.show();
            return;
        }
        var el = document.getElementById('commsFaqModal');
        if (el) {
            el.classList.add('show');
            el.style.display = 'block';
            el.removeAttribute('aria-hidden');
            document.body.classList.add('modal-open');
        }
    }

    function hideFaqModal() {
        ensureModals();
        if (faqModal) {
            faqModal.hide();
            return;
        }
        var el = document.getElementById('commsFaqModal');
        if (el) {
            el.classList.remove('show');
            el.style.display = 'none';
            el.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }
    }

    function cleanupModalArtifacts() {
        var anyOpen = !!document.querySelector('.modal.show');
        if (anyOpen) return;
        document.querySelectorAll('.modal-backdrop').forEach(function (el) {
            el.remove();
        });
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    }

    function hideDeleteModal() {
        ensureModals();
        if (deleteModal) {
            deleteModal.hide();
            return;
        }
        var el = document.getElementById('commsFaqDeleteModal');
        if (el) {
            el.classList.remove('show');
            el.style.display = 'none';
            el.setAttribute('aria-hidden', 'true');
        }
        cleanupModalArtifacts();
    }

    function showDeleteModal() {
        ensureModals();
        cleanupModalArtifacts();
        if (deleteModal) {
            deleteModal.show();
            return;
        }
        var el = document.getElementById('commsFaqDeleteModal');
        if (el) {
            el.classList.add('show');
            el.style.display = 'block';
            el.removeAttribute('aria-hidden');
            document.body.classList.add('modal-open');
        }
    }

    function openCreate() {
        if (!els.faqId || !els.question || !els.response) return;
        if ((state.faqs || []).length >= ((state.automation && state.automation.max_faqs) || 10)) {
            toast('You can add a maximum of 10 frequently asked questions.', 'error');
            return;
        }
        clearFieldErrors();
        els.faqId.value = '';
        els.question.value = '';
        els.response.value = '';
        if (els.active) els.active.checked = true;
        if (els.modalTitle) els.modalTitle.textContent = 'Add Question';
        if (els.saveBtn) els.saveBtn.textContent = 'Save';
        updateCounters();
        showFaqModal();
        setTimeout(function () { if (els.question) els.question.focus(); }, 180);
    }

    function openEdit(faq) {
        if (!faq || !els.faqId || !els.question || !els.response) return;
        clearFieldErrors();
        els.faqId.value = String(faq.id);
        els.question.value = faq.question || '';
        els.response.value = sanitizeResponseText(faq.automated_response || '');
        if (els.active) els.active.checked = !!faq.is_active;
        if (els.modalTitle) els.modalTitle.textContent = 'Edit Question';
        if (els.saveBtn) els.saveBtn.textContent = 'Save changes';
        updateCounters();
        showFaqModal();
        setTimeout(function () { if (els.question) els.question.focus(); }, 180);
    }

    function validateForm() {
        if (!els.question || !els.response) return false;
        clearFieldErrors();
        var ok = true;
        var q = (els.question.value || '').trim();
        var r = sanitizeResponseText(els.response.value || '').trim();
        if (els.response.value !== r) {
            els.response.value = r;
        }
        var weighted = measureWeightedLength(r, estimateCharsPerLine(els.response));

        if (!q) {
            if (els.questionError) {
                els.questionError.textContent = 'Question is required.';
                els.questionError.hidden = false;
            }
            els.question.classList.add('is-invalid');
            ok = false;
        } else if (q.length > QUESTION_MAX) {
            if (els.questionError) {
                els.questionError.textContent = 'Question must not exceed ' + QUESTION_MAX + ' characters.';
                els.questionError.hidden = false;
            }
            els.question.classList.add('is-invalid');
            ok = false;
        }

        if (!r) {
            if (els.responseError) {
                els.responseError.textContent = 'Automated response is required.';
                els.responseError.hidden = false;
            }
            els.response.classList.add('is-invalid');
            ok = false;
        } else if (weighted > RESPONSE_MAX) {
            if (els.responseError) {
                els.responseError.textContent = 'Automated response must not exceed ' + RESPONSE_MAX + ' characters.';
                els.responseError.hidden = false;
            }
            els.response.classList.add('is-invalid');
            ok = false;
        }

        return ok;
    }

    function saveFaq(e) {
        e.preventDefault();
        if (!els.faqId || !els.question || !els.response || !els.saveBtn) return;
        if (state.saving || !validateForm()) return;

        var id = els.faqId.value;
        var payload = {
            question: (els.question.value || '').trim(),
            automated_response: sanitizeResponseText(els.response.value || '').trim(),
            is_active: !!(els.active && els.active.checked)
        };

        state.saving = true;
        els.saveBtn.disabled = true;
        els.saveBtn.textContent = 'Saving…';

        var req = id
            ? api(route(routes.faq, id), { method: 'PATCH', body: payload })
            : api(routes.faqs, { method: 'POST', body: payload });

        req.then(function (data) {
            toast(data.message || (id ? 'FAQ updated successfully.' : 'FAQ created successfully.'), 'success');
            hideFaqModal();
            if (data && data.automation) {
                writeCache(data.automation);
                applyAutomation(data.automation);
                return;
            }
            clearCache();
            return load({ force: true });
        }).catch(function (err) {
            var errors = err.data && err.data.errors ? err.data.errors : null;
            if (errors && errors.question && els.questionError) {
                els.questionError.textContent = errors.question[0];
                els.questionError.hidden = false;
                els.question.classList.add('is-invalid');
            }
            if (errors && errors.automated_response && els.responseError) {
                els.responseError.textContent = errors.automated_response[0];
                els.responseError.hidden = false;
                els.response.classList.add('is-invalid');
            }
            toast(err.message || 'Unable to save FAQ.', 'error');
        }).finally(function () {
            state.saving = false;
            els.saveBtn.disabled = false;
            els.saveBtn.textContent = els.faqId.value ? 'Save changes' : 'Save';
        });
    }

    function onResponseInput(e) {
        if (!els.response) return;
        var cleaned = sanitizeResponseText(els.response.value);
        if (cleaned !== els.response.value) {
            var start = els.response.selectionStart;
            var end = els.response.selectionEnd;
            els.response.value = cleaned;
            if (typeof start === 'number' && typeof end === 'number') {
                var nextPos = Math.min(cleaned.length, start);
                try {
                    els.response.setSelectionRange(nextPos, nextPos);
                } catch (err) { /* ignore */ }
            }
        }
        var prev = els.response.value;
        var weighted = responseWeightedLength();
        if (weighted > RESPONSE_MAX && e && e.inputType && e.inputType.indexOf('delete') === -1) {
            // Block growth past weighted max while still allowing deletions.
            var cpl = estimateCharsPerLine(els.response);
            var trimmed = prev;
            while (trimmed.length > 0 && measureWeightedLength(trimmed, cpl) > RESPONSE_MAX) {
                trimmed = trimmed.slice(0, -1);
            }
            if (trimmed !== prev) {
                els.response.value = trimmed;
            }
            els.responseError.textContent = 'Automated response must not exceed ' + RESPONSE_MAX + ' characters.';
            els.responseError.hidden = false;
            els.response.classList.add('is-invalid');
        } else if (weighted <= RESPONSE_MAX) {
            els.responseError.hidden = true;
            els.response.classList.remove('is-invalid');
        }
        updateCounters();
    }

    function onResponseKeydown(e) {
        if (!e) return;
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    }

    function onResponsePaste(e) {
        if (!els.response || !e || !e.clipboardData) return;
        e.preventDefault();
        var text = sanitizeResponseText(e.clipboardData.getData('text') || '');
        var start = els.response.selectionStart || 0;
        var end = els.response.selectionEnd || 0;
        var current = String(els.response.value || '');
        var next = sanitizeResponseText(current.slice(0, start) + text + current.slice(end));
        els.response.value = next;
        var caret = Math.min(next.length, start + text.length);
        try {
            els.response.setSelectionRange(caret, caret);
        } catch (err) { /* ignore */ }
        onResponseInput({ inputType: 'insertFromPaste' });
    }

    function closeAllMoreMenus(exceptMenu) {
        document.querySelectorAll('.comms-auto-more-menu').forEach(function (menu) {
            if (exceptMenu && menu === exceptMenu) return;
            menu.hidden = true;
        });
        document.querySelectorAll('.comms-auto-more-btn').forEach(function (btn) {
            if (exceptMenu && btn.getAttribute('aria-controls') === exceptMenu.id) return;
            btn.setAttribute('aria-expanded', 'false');
        });
    }

    function setResponseVisibility(card, faqId, hidden) {
        var faqKey = String(faqId);
        state.responseHidden[faqKey] = !!hidden;
        card.classList.toggle('is-response-hidden', !!hidden);
        var panel = card.querySelector('.comms-auto-faq-response-panel');
        if (panel) panel.hidden = !!hidden;

        var nextLabel = hidden ? 'Show Response' : 'Hide Response';
        card.querySelectorAll('[data-action="toggle-response"]').forEach(function (el) {
            if (el.tagName === 'BUTTON') {
                el.textContent = nextLabel;
            }
            el.setAttribute('aria-label', nextLabel);
            el.setAttribute('aria-expanded', hidden ? 'false' : 'true');
            el.setAttribute('title', nextLabel);
        });

        var existingHint = card.querySelector('.comms-auto-faq-response-hidden');
        if (hidden && !existingHint) {
            var hint = document.createElement('div');
            hint.className = 'comms-auto-faq-response-hidden';
            hint.setAttribute('data-action', 'toggle-response');
            hint.setAttribute('role', 'button');
            hint.setAttribute('tabindex', '0');
            hint.setAttribute('aria-label', 'Show Response');
            hint.innerHTML = '<span>Response is hidden. Tap Show Response to view.</span>';
            card.appendChild(hint);
        } else if (!hidden && existingHint) {
            existingHint.remove();
        }
    }

    function onListClick(e) {
        var card = e.target.closest('[data-id]');
        if (!card) return;
        var id = Number(card.getAttribute('data-id'));
        var faq = state.faqs.find(function (f) { return Number(f.id) === id; });
        if (!faq) return;

        var actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        var action = actionEl.getAttribute('data-action');

        if (action === 'more') {
            e.preventDefault();
            e.stopPropagation();
            var menu = card.querySelector('.comms-auto-more-menu');
            var open = menu && menu.hidden;
            closeAllMoreMenus(open ? menu : null);
            if (menu) {
                menu.hidden = !open;
                actionEl.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            return;
        }

        if (action === 'edit') {
            e.preventDefault();
            e.stopPropagation();
            closeAllMoreMenus();
            openEdit(faq);
            return;
        }
        if (action === 'toggle-response') {
            e.preventDefault();
            e.stopPropagation();
            closeAllMoreMenus();
            setResponseVisibility(card, id, !state.responseHidden[String(id)]);
            return;
        }
        if (action === 'delete') {
            e.preventDefault();
            e.stopPropagation();
            closeAllMoreMenus();
            state.deleteId = id;
            showDeleteModal();
            return;
        }
        if (action === 'toggle-active') {
            if (state.faqToggleInFlight[String(id)]) {
                e.preventDefault();
                return;
            }
            var next = !!actionEl.checked;
            var switchLabel = actionEl.closest('.comms-switch');
            var statusChip = card.querySelector('.comms-auto-faq-status-chip');
            card.classList.toggle('is-inactive', !next);
            if (switchLabel) {
                switchLabel.classList.toggle('is-on', next);
                switchLabel.classList.toggle('is-off', !next);
                switchLabel.title = next ? 'Active' : 'Inactive';
            }
            if (statusChip) {
                statusChip.classList.toggle('is-shown', next);
                statusChip.classList.toggle('is-hidden', !next);
                statusChip.innerHTML = '<span class="comms-auto-faq-status-dot" aria-hidden="true"></span>' +
                    (next ? 'Shown to Kabataan' : 'Hidden from Kabataan');
            }
            faq.is_active = next;
            state.faqToggleInFlight[String(id)] = true;
            api(route(routes.faqToggle, id), {
                method: 'PATCH',
                body: { is_active: next }
            }).then(function (data) {
                toast(data.message || 'FAQ status updated.', 'success');
                if (data && data.automation) {
                    writeCache(data.automation);
                    applyAutomation(data.automation);
                    return;
                }
                clearCache();
                return load({ force: true });
            }).catch(function (err) {
                actionEl.checked = !next;
                faq.is_active = !next;
                card.classList.toggle('is-inactive', next);
                if (switchLabel) {
                    switchLabel.classList.toggle('is-on', !next);
                    switchLabel.classList.toggle('is-off', next);
                    switchLabel.title = !next ? 'Active' : 'Inactive';
                }
                if (statusChip) {
                    statusChip.classList.toggle('is-shown', !next);
                    statusChip.classList.toggle('is-hidden', next);
                    statusChip.innerHTML = '<span class="comms-auto-faq-status-dot" aria-hidden="true"></span>' +
                        (!next ? 'Shown to Kabataan' : 'Hidden from Kabataan');
                }
                toast(err.message || 'Unable to update FAQ status.', 'error');
            }).finally(function () {
                delete state.faqToggleInFlight[String(id)];
            });
        }
    }

    function bind() {
        if (!refreshEls()) {
            toast('Automations page failed to initialize. Please refresh.', 'error');
            return;
        }

        ensureModals();

        var faqModalEl = document.getElementById('commsFaqModal');
        if (faqModalEl) {
            faqModalEl.addEventListener('hidden.bs.modal', function () {
                setFaqModalMaximized(false);
                cleanupModalArtifacts();
            });
        }

        var deleteModalEl = document.getElementById('commsFaqDeleteModal');
        if (deleteModalEl) {
            deleteModalEl.addEventListener('hidden.bs.modal', function () {
                cleanupModalArtifacts();
                state.deleting = false;
                if (els.deleteConfirm) {
                    els.deleteConfirm.disabled = false;
                    els.deleteConfirm.textContent = 'Delete';
                }
            });
        }

        if (els.addBtn) els.addBtn.addEventListener('click', openCreate);
        if (els.emptyAddBtn) els.emptyAddBtn.addEventListener('click', openCreate);
        if (els.form) els.form.addEventListener('submit', saveFaq);
        if (els.question) els.question.addEventListener('input', updateCounters);
        if (els.response) {
            els.response.addEventListener('input', onResponseInput);
            els.response.addEventListener('keydown', onResponseKeydown);
            els.response.addEventListener('paste', onResponsePaste);
        }
        if (els.faqList) {
            els.faqList.addEventListener('click', onListClick);
            els.faqList.addEventListener('change', onListClick);
            els.faqList.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                var hint = e.target.closest('.comms-auto-faq-response-hidden');
                if (!hint) return;
                e.preventDefault();
                hint.click();
            });
        }

        document.addEventListener('click', function (e) {
            if (e.target.closest('.comms-auto-more-wrap')) return;
            closeAllMoreMenus();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeAllMoreMenus();
        });

        if (els.masterToggle) {
            els.masterToggle.addEventListener('change', function () {
                setMasterEnabled(!!els.masterToggle.checked);
            });
        }
        if (els.enableNowBtn) {
            els.enableNowBtn.addEventListener('click', function () {
                setMasterEnabled(true);
            });
        }

        if (els.deleteConfirm) {
            els.deleteConfirm.addEventListener('click', function () {
                if (!state.deleteId || state.deleting) return;
                var id = state.deleteId;
                state.deleting = true;
                els.deleteConfirm.disabled = true;
                els.deleteConfirm.textContent = 'Deleting…';
                api(route(routes.faq, id), { method: 'DELETE' })
                    .then(function (data) {
                        toast(data.message || 'FAQ deleted successfully.', 'success');
                        state.deleteId = null;
                        clearCache();

                        var reloaded = false;
                        function reloadOnce() {
                            if (reloaded) return;
                            reloaded = true;
                            state.deleting = false;
                            cleanupModalArtifacts();
                            if (els.deleteConfirm) {
                                els.deleteConfirm.disabled = false;
                                els.deleteConfirm.textContent = 'Delete';
                            }
                            load({ force: true });
                        }

                        hideDeleteModal();
                        var delEl = document.getElementById('commsFaqDeleteModal');
                        if (delEl && window.bootstrap) {
                            delEl.addEventListener('hidden.bs.modal', function onHidden() {
                                delEl.removeEventListener('hidden.bs.modal', onHidden);
                                reloadOnce();
                            });
                            setTimeout(reloadOnce, 500);
                        } else {
                            reloadOnce();
                        }
                    })
                    .catch(function (err) {
                        state.deleting = false;
                        toast(err.message || 'Unable to delete FAQ.', 'error');
                        if (els.deleteConfirm) {
                            els.deleteConfirm.disabled = false;
                            els.deleteConfirm.textContent = 'Delete';
                        }
                    });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bind();
            load();
        });
    } else {
        bind();
        load();
    }
})();
