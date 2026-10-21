<!DOCTYPE html>
<html lang="en">
<head>
    @include('layout::favicon')
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Messages — SK Officials Portal</title>
    @vite([
        'app/Modules/Layout/css/header.css',
        'app/Modules/Layout/css/sidebar.css',
        'app/Modules/Communications/assets/css/communication.css',
    ])
</head>
<body class="comms-officials-page comms-messages-layout">
@include('layout::header')
@include('layout::sidebar')

<main class="main-content" id="mainContent">
<div class="comms-officials-wrap">
@php
    $commsRoutes = [
        'conversations' => route('api.communications.conversations.index'),
        'storeConversation' => route('api.communications.conversations.store'),
        'messages' => url('/api/communications/conversations/__ID__/messages'),
        'react' => url('/api/communications/messages/__ID__/reactions'),
        'updateMessage' => url('/api/communications/messages/__ID__'),
        'deleteMessage' => url('/api/communications/messages/__ID__'),
        'read' => url('/api/communications/conversations/__ID__/read'),
        'markAllRead' => route('api.communications.conversations.mark-all-read'),
        'showConversation' => url('/api/communications/conversations/__ID__'),
        'searchUsers' => route('api.communications.users.search'),
        'directory' => route('api.communications.users.directory'),
        'unreadCount' => route('api.communications.unread-count'),
        'startCall' => url('/api/communications/conversations/__ID__/calls'),
        'callStatus' => url('/api/communications/calls/__ID__/status'),
        'calls' => route('api.communications.calls.index'),
        'presence' => route('api.communications.presence'),
        'callHistoryPage' => route('communications.calls'),
        'renameConversation' => url('/api/communications/conversations/__ID__'),
        'conversationMembers' => url('/api/communications/conversations/__ID__/members'),
        'conversationAvatar' => url('/api/communications/conversations/__ID__/avatar'),
    ];
@endphp
<div
    class="comms-app"
    id="commsApp"
    data-current-user-id="{{ $currentUserId }}"
    data-portal-user-type="{{ $portalUserType }}"
    data-current-user-name="{{ auth()->user()->name ?? '' }}"
    data-current-user-position="{{ auth()->user()->sk_position ?? '' }}"
    data-current-user-barangay="{{ auth()->user()->barangay->name ?? '' }}"
    data-current-user-avatar="{{ auth()->user()->profile_image_url ?? '' }}"
    data-initial-conversation="{{ $initialConversationId ?? '' }}"
    data-initial-user-id="{{ $initialUserId ?? '' }}"
    data-message-max-length="{{ (int) config('communications.message_max_length', 1000) }}"
    data-routes='@json($commsRoutes)'
>
    <div class="comms-shell">
        <aside class="comms-sidebar" id="commsSidebar">
            <div class="comms-sidebar-header">
                <div class="comms-sidebar-title-row">
                    <h1>Messages</h1>
                    <div class="comms-sidebar-actions">
                        <button type="button" class="comms-sidebar-icon-btn" id="commsNewGroupBtn" title="New group" aria-label="New group">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                <line x1="19" y1="8" x2="19" y2="14"/>
                                <line x1="22" y1="11" x2="16" y2="11"/>
                            </svg>
                        </button>
                        <a href="{{ route('communications.automations') }}" class="comms-sidebar-icon-btn" title="Chat Automations" aria-label="Chat Automations">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>
                                <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/>
                                <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>
                            </svg>
                        </a>
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
                <button type="button" class="comms-mark-all-read" id="commsMarkAllRead" style="display:flex;align-items:center;justify-content:center;width:calc(100% - 24px);margin:8px 12px;box-sizing:border-box;background:#0039A8;color:#fff;border:0;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700;line-height:1.2;cursor:pointer;">
                    <span class="comms-mark-all-read-label" style="color:#fff;font-size:13px;font-weight:700;line-height:1.2;">Mark All as Read</span>
                </button>
                <label class="visually-hidden" for="commsUserSearch">Search kabataan or officials</label>
                <div class="comms-search-wrap">
                    <svg class="comms-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input type="search" id="commsUserSearch" class="comms-search-input" placeholder="Search kabataan or officials" autocomplete="off">
                    <div class="comms-search-results" id="commsSearchResults" hidden></div>
                </div>
            </div>
            <div class="comms-conv-list" id="commsConvList" role="list"></div>
            <div class="comms-empty" id="commsConvEmpty" hidden>
                <p>No conversations yet. Search for someone to start messaging.</p>
            </div>
        </aside>

        <section class="comms-thread" id="commsThread" aria-live="polite">
            <div class="comms-thread-empty" id="commsThreadEmpty">
                <h2>Your messages</h2>
                <p>Select a conversation or search for a person to start chatting.</p>
            </div>

            <div class="comms-thread-active" id="commsThreadActive" hidden>
                <header class="comms-thread-header">
                    <button type="button" class="comms-back-btn" id="commsBackBtn" aria-label="Back to conversations">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div class="comms-peer-avatar-wrap" id="commsPeerAvatarWrap">
                        <img src="" alt="" class="comms-avatar" id="commsPeerAvatar" width="40" height="40">
                        <span class="comms-avatar-stack" id="commsPeerAvatarStack" hidden aria-hidden="true"></span>
                        <span class="comms-peer-status-dot" id="commsPeerStatusDot" data-status="offline" aria-hidden="true"></span>
                    </div>
                    <div class="comms-thread-peer">
                        <div class="comms-peer-name" id="commsPeerName"></div>
                        <div class="comms-peer-meta" id="commsPeerMeta"></div>
                    </div>
                    <div class="comms-thread-actions">
                        <button type="button" class="comms-icon-btn" id="commsVoiceBtn" title="Voice call" aria-label="Start voice call">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>
                        </button>
                        <button type="button" class="comms-icon-btn" id="commsVideoBtn" title="Video call" aria-label="Start video call">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                        </button>
                        <div class="comms-thread-menu-wrap">
                            <button type="button" class="comms-icon-btn" id="commsThreadMenuBtn" aria-label="Conversation actions" aria-expanded="false" aria-controls="commsThreadMenu" hidden>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                            </button>
                            <div class="comms-thread-menu" id="commsThreadMenu" hidden role="menu">
                                <button type="button" class="comms-thread-menu-item" id="commsRenameGroupBtn" role="menuitem" hidden>Rename Group</button>
                                <button type="button" class="comms-thread-menu-item" id="commsChangeGroupPhotoBtn" role="menuitem" hidden>Change Group Photo</button>
                                <button type="button" class="comms-thread-menu-item" id="commsViewMembersBtn" role="menuitem">View Members</button>
                                <button type="button" class="comms-thread-menu-item" id="commsGroupInfoBtn" role="menuitem">Group Info</button>
                            </div>
                        </div>
                    </div>
                </header>

                <div class="comms-messages-wrap">
                    <div class="comms-messages" id="commsMessages" role="log"></div>
                    <button type="button" class="comms-scroll-bottom" id="commsScrollBottom" hidden title="Jump to latest" aria-label="Jump to latest messages">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                </div>
                <div class="comms-typing" id="commsTyping" hidden aria-live="polite"></div>

                <form class="comms-composer" id="commsComposer" autocomplete="off">
                    <input type="file" id="commsPhotoInput" class="visually-hidden" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-hidden="true" tabindex="-1">
                    <input type="file" id="commsCameraInput" class="visually-hidden" accept="image/*" aria-hidden="true" tabindex="-1">
                    <input type="file" id="commsFileInput" class="visually-hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple aria-hidden="true" tabindex="-1">
                    <div class="comms-composer-tools">
                        <div class="comms-attach-menu-wrap">
                            <button type="button" class="comms-attach-btn" id="commsAttachBtn" title="Maximum 25 MB" aria-label="Attach photos, camera, or files. Maximum 25 MB" aria-expanded="false" aria-controls="commsAttachMenu">
                                <span aria-hidden="true">+</span>
                            </button>
                            <div class="comms-attach-menu" id="commsAttachMenu" hidden>
                                <button type="button" class="comms-attach-menu-btn" id="commsPickCameraBtn" title="Take a photo">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                                    <span>Camera</span>
                                </button>
                                <button type="button" class="comms-attach-menu-btn" id="commsPickPhotosBtn" title="Maximum 25 MB">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                                    <span>Photos</span>
                                </button>
                                <button type="button" class="comms-attach-menu-btn" id="commsPickFilesBtn" title="Maximum 25 MB">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>
                                    <span>Files</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="comms-composer-main">
                        <div class="comms-attach-preview" id="commsAttachPreview" hidden>
                            <div class="comms-attach-preview-inner" id="commsAttachPreviewInner"></div>
                            <button type="button" class="comms-attach-clear" id="commsAttachClear" aria-label="Remove attachments">&times;</button>
                        </div>
                        <div class="comms-upload-progress" id="commsUploadProgress" hidden>
                            <div class="comms-upload-progress-bar" id="commsUploadProgressBar"></div>
                        </div>
                        <label class="visually-hidden" for="commsMessageInput">Write a message</label>
                        <textarea id="commsMessageInput" rows="1" placeholder="Type a message" aria-label="Type a message" data-max-lines="500"></textarea>
                    </div>
                    <div class="comms-composer-end">
                        <button type="submit" class="comms-send-btn" id="commsSendBtn" title="Send" aria-label="Send message">
                            <svg class="comms-send-btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        </button>
                    </div>
                </form>
            </div>
        </section>
    </div>

    <div class="comms-modal" id="commsGroupModal" hidden>
        <div class="comms-modal-backdrop" data-comms-group-close></div>
        <div class="comms-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="commsGroupModalTitle">
            <header class="comms-modal-header">
                <h2 id="commsGroupModalTitle">Group</h2>
                <button type="button" class="comms-icon-btn" data-comms-group-close aria-label="Close">&times;</button>
            </header>
            <div class="comms-modal-body" id="commsGroupModalBody"></div>
        </div>
    </div>

    <div class="comms-modal" id="commsRenameModal" hidden>
        <div class="comms-modal-backdrop" data-comms-rename-close></div>
        <div class="comms-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="commsRenameModalTitle">
            <header class="comms-modal-header">
                <h2 id="commsRenameModalTitle">Rename Group</h2>
                <button type="button" class="comms-icon-btn" data-comms-rename-close aria-label="Close">&times;</button>
            </header>
            <form class="comms-modal-body" id="commsRenameForm">
                <label class="comms-field-label" for="commsRenameInput">Group name</label>
                <input type="text" id="commsRenameInput" class="comms-field-input" maxlength="120" required autocomplete="off">
                <div class="comms-modal-actions">
                    <button type="button" class="comms-btn-secondary" data-comms-rename-close>Cancel</button>
                    <button type="submit" class="comms-btn-primary" id="commsRenameSubmit">Save</button>
                </div>
            </form>
        </div>
    </div>

    <div class="comms-modal" id="commsNewGroupModal" hidden>
        <div class="comms-modal-backdrop" data-comms-new-group-close></div>
        <div class="comms-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="commsNewGroupModalTitle">
            <header class="comms-modal-header">
                <h2 id="commsNewGroupModalTitle">New group</h2>
                <button type="button" class="comms-icon-btn" data-comms-new-group-close aria-label="Close">&times;</button>
            </header>
            <form class="comms-modal-body" id="commsNewGroupForm">
                <label class="comms-field-label" for="commsNewGroupName">Group name (optional)</label>
                <input type="text" id="commsNewGroupName" class="comms-field-input" maxlength="120" autocomplete="off" placeholder="e.g. Capstone Team">
                <label class="comms-field-label" for="commsNewGroupSearch">Add people</label>
                <input type="search" id="commsNewGroupSearch" class="comms-field-input" placeholder="Search people" autocomplete="off">
                <div class="comms-new-group-results" id="commsNewGroupResults" hidden></div>
                <div class="comms-new-group-selected" id="commsNewGroupSelected"></div>
                <div class="comms-modal-actions">
                    <button type="button" class="comms-btn-secondary" data-comms-new-group-close>Cancel</button>
                    <button type="submit" class="comms-btn-primary" id="commsNewGroupSubmit">Create group</button>
                </div>
            </form>
        </div>
    </div>

    <input type="file" id="commsGroupAvatarInput" class="visually-hidden" accept="image/jpeg,image/png,image/webp,image/gif" aria-hidden="true" tabindex="-1">
</div>
</div>
</main>

@vite([
    'app/Modules/Layout/js/header.js',
    'app/Modules/Layout/js/sidebar.js',
    'app/Modules/Communications/assets/js/chat.js',
])
</body>
</html>
