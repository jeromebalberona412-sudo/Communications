        <aside class="comms-sidebar" id="commsSidebar">
            <div class="comms-sidebar-header">
                <div class="comms-sidebar-title-row">
                    <h1>Messages</h1>
                    <div class="comms-sidebar-actions">
                        <a href="{{ route('communications.calls') }}" class="comms-sidebar-icon-btn" title="Call history" aria-label="Call history">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="8" y1="13" x2="12" y2="13"/>
                                <line x1="8" y1="17" x2="11" y2="17"/>
                                <circle cx="17.5" cy="17.5" r="3.5"/>
                                <polyline points="17.5 15.75 17.5 17.5 18.75 18.25"/>
                            </svg>
                        </a>
                    </div>
                </div>
                <button type="button" class="comms-mark-all-read" id="commsMarkAllRead">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16v16H4z" opacity="0"/><path d="M4 7l8 6 8-6"/><rect x="4" y="5" width="16" height="14" rx="2"/></svg>
                    <span class="comms-mark-all-read-label">Mark all as read</span>
                </button>
                <label class="visually-hidden" for="commsUserSearch">Search teachers or students</label>
                <div class="comms-search-wrap">
                    <svg class="comms-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input type="search" id="commsUserSearch" class="comms-search-input" placeholder="Search people or groups" autocomplete="off">
                    <div class="comms-search-results" id="commsSearchResults" hidden></div>
                </div>
            </div>
            <div class="comms-conv-list" id="commsConvList" role="list"></div>
            <div class="comms-empty" id="commsConvEmpty" hidden>
                <p>No conversations yet. Search for someone to start messaging.</p>
            </div>
        </aside>
