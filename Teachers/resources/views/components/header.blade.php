<header class="app-header">
    <button
        type="button"
        class="sidebar-toggle"
        id="sidebar-toggle"
        aria-controls="app-sidebar"
        aria-expanded="true"
        aria-label="Toggle sidebar"
    >
        <span class="sidebar-toggle-icon" aria-hidden="true"></span>
    </button>
    <div class="app-header-title">iLearnU</div>
    <div class="app-header-actions">
        <div class="comms-header-msg">
            <button
                type="button"
                class="comms-header-msg-btn app-header-icon-btn"
                id="commsHeaderMsgBtn"
                title="Messages"
                aria-label="Open messages"
                aria-haspopup="dialog"
                aria-expanded="false"
            >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span
                    class="comms-header-msg-badge"
                    id="commsMsgBadge"
                    hidden
                >0</span>
            </button>
        </div>
        <div class="app-header-user">{{ auth()->user()->displayName() }}</div>
    </div>
</header>
