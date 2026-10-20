<div
    class="comms-chat-modal"
    id="commsChatModal"
    hidden
    role="dialog"
    aria-modal="true"
    aria-labelledby="commsChatModalTitle"
>
    <div class="comms-chat-modal-backdrop" data-comms-chat-close tabindex="-1"></div>
    <div class="comms-chat-modal-panel">
        @php
            $messagesIndexUrl = \Illuminate\Support\Facades\Route::has('communications.index')
                ? route('communications.index')
                : url('/communications');
        @endphp
        {{-- List and conversation share this panel; only inner content swaps. --}}
        <aside class="comms-chat-fs-sidebar" id="commsChatFsSidebar" hidden>
            <div class="comms-chat-fs-sidebar-head">
                <h3>Chats</h3>
                <div class="comms-chat-fs-sidebar-actions">
                    @if(\Illuminate\Support\Facades\Route::has('communications.automations'))
                    <a href="{{ route('communications.automations') }}" class="comms-chat-fs-icon-btn" title="Chat Automations" aria-label="Chat Automations">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>
                            <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/>
                            <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>
                        </svg>
                    </a>
                    @endif
                    <button type="button" class="comms-chat-fs-icon-btn" data-comms-chat-close title="Close chats" aria-label="Close chats">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
            <div class="comms-chat-fs-search-wrap">
                <label class="comms-chat-fs-search" for="commsChatFsSearch">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input
                        type="search"
                        id="commsChatFsSearch"
                        class="comms-chat-fs-search-input"
                        placeholder="Search Messages"
                        autocomplete="off"
                        aria-label="Search messages"
                    >
                </label>
            </div>
            <div class="comms-chat-fs-filters" role="tablist" aria-label="Message filters">
                <button type="button" class="comms-chat-fs-filter is-active" data-fs-filter="all" role="tab" aria-selected="true">All</button>
                <button type="button" class="comms-chat-fs-filter" data-fs-filter="unread" role="tab" aria-selected="false">Unread</button>
            </div>
            <div class="comms-chat-fs-list" id="commsChatFsList" role="list"></div>
            <div class="comms-chat-fs-list-empty" id="commsChatFsListEmpty" hidden>
                <p>No conversations yet</p>
            </div>
            <div class="comms-chat-fs-sidebar-foot">
                <a href="{{ $messagesIndexUrl }}" class="comms-msg-see-all-btn comms-msg-see-all-link" data-no-loading>
                    See all messages
                </a>
            </div>
        </aside>

        {{-- Pane 3: thread (empty or active), independently scrollable --}}
        <div class="comms-chat-fs-thread">
            <div class="comms-chat-fs-empty" id="commsChatFsEmpty" hidden>
                <h2>Your messages</h2>
                <p>Select a conversation or search for a person to start chatting.</p>
            </div>

            <div class="comms-chat-fs-active" id="commsChatFsActive">
                <div class="comms-chat-modal-header">
                    <div class="comms-chat-modal-peer">
                        <button type="button" class="comms-chat-modal-action-btn comms-chat-fs-back" id="commsChatFsBack" title="Back to chats" aria-label="Back to chats" hidden>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                        </button>
                        <span class="comms-chat-modal-avatar" id="commsChatModalAvatar" aria-hidden="true">U</span>
                        <div class="comms-chat-modal-peer-text">
                            <h3 id="commsChatModalTitle">Chat</h3>
                            <p class="comms-chat-modal-sub" id="commsChatModalSub">Active now</p>
                        </div>
                    </div>
                    <div class="comms-chat-modal-actions">
                        <button type="button" class="comms-chat-modal-action-btn" id="commsChatModalVoiceBtn" title="Voice call" aria-label="Start voice call">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>
                        </button>
                        <button type="button" class="comms-chat-modal-action-btn" id="commsChatModalVideoBtn" title="Video call" aria-label="Start video call">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                        </button>
                        <button type="button" class="comms-chat-modal-action-btn comms-chat-modal-close-btn" data-comms-chat-close aria-label="Close chat">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                        </button>
                    </div>
                </div>

                <div class="comms-chat-messages-wrap">
                    <div class="comms-chat-modal-body" id="commsChatModalBody" aria-live="polite">
                        <p class="comms-chat-modal-empty">Select a conversation</p>
                    </div>
                    <button type="button" class="comms-chat-scroll-bottom" id="commsChatScrollBottom" hidden title="Jump to latest" aria-label="Jump to latest messages">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                </div>

                <div class="comms-chat-modal-typing" id="commsChatModalTyping" hidden aria-live="polite"></div>

                <form class="comms-chat-modal-composer" id="commsChatModalForm" autocomplete="off">
                    <input type="file" id="commsChatPhotoInput" class="visually-hidden" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-hidden="true" tabindex="-1">
                    <input type="file" id="commsChatCameraInput" class="visually-hidden" accept="image/*" aria-hidden="true" tabindex="-1">
                    <input type="file" id="commsChatFileInput" class="visually-hidden" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple aria-hidden="true" tabindex="-1">
                    <div class="comms-chat-attach-wrap">
                        <button type="button" class="comms-chat-attach-btn" id="commsChatAttachBtn" title="Maximum 25 MB" aria-label="Attach photos, camera, or files. Maximum 25 MB">
                            <span aria-hidden="true">+</span>
                        </button>
                        <div class="comms-chat-attach-menu" id="commsChatAttachMenu" hidden>
                            <button type="button" class="comms-chat-attach-menu-item" id="commsChatPickCamera" title="Take a photo">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Camera
                            </button>
                            <button type="button" class="comms-chat-attach-menu-item" id="commsChatPickPhotos" title="Maximum 25 MB">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> Photos
                            </button>
                            <button type="button" class="comms-chat-attach-menu-item" id="commsChatPickFiles" title="Maximum 25 MB">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg> Files
                            </button>
                        </div>
                    </div>
                    <div class="comms-chat-composer-main">
                        <div class="comms-chat-attach-preview" id="commsChatAttachPreview" hidden>
                            <div class="comms-chat-attach-preview-inner" id="commsChatAttachPreviewInner"></div>
                            <button type="button" class="comms-chat-attach-clear" id="commsChatAttachClear" aria-label="Remove attachments">&times;</button>
                        </div>
                        <label class="visually-hidden" for="commsChatModalInput">Type a message</label>
                        <textarea
                            id="commsChatModalInput"
                            class="comms-chat-modal-input"
                            rows="1"
                            placeholder="Type a message"
                            data-max-lines="500"
                        ></textarea>
                    </div>
                    <button type="submit" class="comms-chat-modal-send" id="commsChatModalSend" title="Send" aria-label="Send message">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>
