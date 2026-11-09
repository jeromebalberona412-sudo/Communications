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
                    <input type="file" id="commsCameraInput" class="visually-hidden" accept="image/*" capture="environment" aria-hidden="true" tabindex="-1">
                    <input type="file" id="commsFileInput" class="visually-hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf" multiple aria-hidden="true" tabindex="-1">
                    <div class="comms-composer-tools">
                        <div class="comms-attach-menu-wrap">
                            <button type="button" class="comms-attach-btn" id="commsAttachBtn" title="Maximum 25 MB" aria-label="Attach" aria-expanded="false" aria-controls="commsAttachMenu">
                                <span aria-hidden="true">+</span>
                            </button>
                            <div class="comms-attach-menu" id="commsAttachMenu" hidden>
                                <button type="button" class="comms-attach-menu-btn" id="commsPickCameraBtn"><span>Camera</span></button>
                                <button type="button" class="comms-attach-menu-btn" id="commsPickPhotosBtn"><span>Photos</span></button>
                                <button type="button" class="comms-attach-menu-btn" id="commsPickFilesBtn"><span>Files</span></button>
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
