<!DOCTYPE html>
<html lang="en">
<head>
    @include('layout::favicon')
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Chat Automations — SK Officials Portal</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    @vite([
        'app/Modules/Layout/css/header.css',
        'app/Modules/Layout/css/sidebar.css',
        'app/Modules/Communications/assets/css/communication.css',
        'app/Modules/Communications/assets/css/automations.css',
        'app/Modules/Layout/js/header.js',
        'app/Modules/Layout/js/sidebar.js',
        'app/Modules/Communications/assets/js/automations.js',
    ])
</head>
<body class="comms-officials-page">
@include('layout::header')
@include('layout::sidebar')

<main class="main-content" id="mainContent">
<div class="comms-officials-wrap">
<div
    class="comms-auto-page"
    id="commsAutomationsApp"
    data-routes='@json($routes)'
    data-user-id="{{ auth()->id() }}"
>
    <div class="comms-auto-header-row">
        <div class="comms-auto-title-block">
            <nav class="comms-auto-breadcrumb" aria-label="Breadcrumb">
                <a href="{{ route('communications.index') }}">Chats</a>
                <span aria-hidden="true">/</span>
                <span>Automations</span>
            </nav>
            <div class="comms-auto-title-main">
                <div class="comms-auto-title-copy">
                    <h1>Chat Automations</h1>
                    <p class="comms-auto-lead">Create suggested questions and automated responses for Kabataan chat messages.</p>
                </div>
                <a href="{{ route('communications.index') }}" class="comms-link-btn comms-auto-back-btn">Back to Messages</a>
            </div>
        </div>
    </div>

    <section class="comms-auto-card" aria-labelledby="commsFaqHeading">
        <div class="comms-auto-loading" id="commsAutoLoading" hidden>
            <div class="comms-auto-spinner" aria-hidden="true"></div>
            <p>Loading message automations…</p>
        </div>

        <div class="comms-auto-card-head">
            <div>
                <h2 id="commsFaqHeading">Frequently Asked Questions</h2>
                <p class="comms-auto-desc">Suggest questions that Kabataan can ask and automatically respond to common questions.</p>
            </div>
            <div class="comms-auto-master-toggle">
                <span class="comms-auto-toggle-label" id="commsMasterToggleLabel">On</span>
                <label class="comms-switch" for="commsMasterToggle">
                    <input type="checkbox" id="commsMasterToggle" checked aria-describedby="commsFaqHeading">
                    <span class="comms-switch-slider" aria-hidden="true"></span>
                    <span class="visually-hidden">Enable Frequently Asked Questions</span>
                </label>
            </div>
        </div>

        <div class="comms-auto-disabled-banner" id="commsDisabledBanner" hidden>
            <p><strong>Frequently Asked Questions are currently disabled.</strong> Your saved questions stay here, but Kabataan will not see quick-reply chips until you turn this back on.</p>
            <button type="button" class="comms-auto-btn-primary" id="commsEnableNowBtn">Turn On for Kabataan</button>
        </div>

        <div class="comms-auto-toolbar">
            <p class="comms-auto-count" id="commsFaqCount">0 / 10 questions</p>
            <button type="button" class="comms-auto-btn-primary" id="commsAddFaqBtn">+ Add Question</button>
        </div>

        <div class="comms-auto-list" id="commsFaqList" role="list"></div>

        <div class="comms-auto-empty" id="commsFaqEmpty" hidden>
            <h3>No automated questions yet.</h3>
            <p>Create frequently asked questions to help Kabataan users get quick answers.</p>
            <button type="button" class="comms-auto-btn-primary" id="commsEmptyAddBtn">+ Add Question</button>
        </div>
    </section>
</div>
</div>
</main>

<div class="modal fade" id="commsFaqModal" tabindex="-1" aria-labelledby="commsFaqModalTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" id="commsFaqModalDialog">
        <div class="modal-content comms-auto-modal" id="commsFaqModalBox">
            <form id="commsFaqForm" novalidate class="comms-auto-modal-form">
                <div class="modal-header comms-auto-modal-header">
                    <h3 class="modal-title" id="commsFaqModalTitle">Add Question</h3>
                    <button type="button" class="comms-auto-modal-close" data-bs-dismiss="modal" aria-label="Close" title="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="commsFaqId" value="">
                    <div class="comms-auto-field">
                        <label class="form-label" for="commsFaqQuestion">Question</label>
                        <input
                            type="text"
                            class="form-control"
                            id="commsFaqQuestion"
                            maxlength="50"
                            required
                            autocomplete="off"
                            placeholder="Type question"
                        >
                        <div class="comms-auto-field-meta">
                            <span class="comms-auto-error" id="commsFaqQuestionError" hidden></span>
                            <span class="comms-auto-counter" id="commsFaqQuestionCount">0 / 50</span>
                        </div>
                    </div>
                    <div class="comms-auto-field">
                        <label class="form-label" for="commsFaqResponse">Automated response</label>
                        <textarea
                            class="form-control comms-auto-response-input"
                            id="commsFaqResponse"
                            rows="4"
                            required
                            placeholder="Type automated response (no new lines)"
                            wrap="soft"
                        ></textarea>
                        <div class="comms-auto-field-meta">
                            <span class="comms-auto-error" id="commsFaqResponseError" hidden></span>
                            <span class="comms-auto-counter" id="commsFaqResponseCount">0 / 500</span>
                        </div>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" id="commsFaqActive" checked>
                        <label class="form-check-label" for="commsFaqActive">Active (shown to Kabataan)</label>
                    </div>
                </div>
                <div class="modal-footer comms-auto-modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary comms-auto-save-btn" id="commsFaqSaveBtn">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>

<div class="modal fade" id="commsFaqDeleteModal" tabindex="-1" aria-labelledby="commsFaqDeleteTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content comms-auto-modal comms-auto-modal--delete">
            <div class="modal-header comms-auto-modal-header comms-auto-delete-header">
                <h3 class="modal-title" id="commsFaqDeleteTitle">Delete question?</h3>
                <button type="button" class="comms-auto-modal-close" data-bs-dismiss="modal" aria-label="Close" title="Close">&times;</button>
            </div>
            <div class="modal-body">
                <p class="mb-0">This removes the automation for this question. Existing chat messages stay unchanged.</p>
            </div>
            <div class="modal-footer comms-auto-modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-danger" id="commsFaqDeleteConfirm">Delete</button>
            </div>
        </div>
    </div>
</div>

</body>
</html>
