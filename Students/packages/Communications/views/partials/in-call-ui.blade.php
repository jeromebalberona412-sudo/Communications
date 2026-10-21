<div class="comms-call-overlay" id="commsInCall" hidden>
    <div class="comms-call-stage">
        <div class="comms-remote-grid" id="commsRemoteGrid" hidden></div>
        <video id="commsRemoteVideo" class="comms-remote-video" autoplay playsinline muted></video>
        <div class="comms-video-off comms-video-off--remote" id="commsRemoteVideoOff" hidden aria-hidden="true">
            <span class="comms-video-off-avatar" id="commsRemoteVideoOffAvatar">U</span>
            <span class="comms-video-off-label">Camera off</span>
        </div>
        <video id="commsLocalVideo" class="comms-local-video" autoplay playsinline muted></video>
        <div class="comms-video-off comms-video-off--local" id="commsLocalVideoOff" hidden aria-hidden="true">
            <span class="comms-video-off-avatar" id="commsLocalVideoOffAvatar">U</span>
            <span class="comms-video-off-label">Camera off</span>
        </div>
        <audio id="commsRemoteAudio" class="comms-remote-audio" autoplay playsinline></audio>

        <div class="comms-call-center" id="commsCallCenter">
            <div class="comms-call-avatar" id="commsCallPeerAvatar" aria-hidden="true">U</div>
            <div class="comms-call-meta">
                <div class="comms-call-peer-name" id="commsCallPeerName"></div>
                <div class="comms-call-status" id="commsCallStatus">Calling...</div>
                <div class="comms-call-timer" id="commsCallTimer" hidden>00:00</div>
            </div>
        </div>

        <div class="comms-call-controls">
            <button type="button" class="comms-call-ctrl" id="commsMuteBtn" aria-label="Mute" aria-pressed="false">
                <span class="comms-call-ctrl-icon" data-mute-icon aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                </span>
                <span class="comms-call-ctrl-label">Mute</span>
            </button>
            <button type="button" class="comms-call-ctrl" id="commsCameraBtn" aria-label="Camera" aria-pressed="false">
                <span class="comms-call-ctrl-icon" data-camera-icon aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="23 7 16 12 23 17 23 7"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                </span>
                <span class="comms-call-ctrl-label">Camera</span>
            </button>
            <button type="button" class="comms-call-ctrl comms-call-ctrl--end" id="commsEndCall" aria-label="End call">
                <svg class="comms-end-phone-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span class="comms-call-ctrl-label">End</span>
            </button>
        </div>
    </div>
</div>
