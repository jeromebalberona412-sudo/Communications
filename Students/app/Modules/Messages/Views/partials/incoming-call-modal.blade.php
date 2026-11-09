<div class="comms-modal" id="commsIncomingCall" hidden role="dialog" aria-modal="true" aria-labelledby="commsIncomingTitle">
    <div class="comms-modal-card comms-modal-card--call">
        <div class="comms-call-pulse" aria-hidden="true"></div>
        <div class="comms-incoming-avatar" id="commsIncomingAvatar" aria-hidden="true"></div>
        <h2 id="commsIncomingTitle">Incoming call</h2>
        <p class="comms-modal-peer" id="commsIncomingPeer"></p>
        <p class="comms-modal-type" id="commsIncomingType"></p>
        <p class="comms-modal-hint">Ringing...</p>
        <p class="comms-ringtone-hint" id="commsRingtoneHint" hidden>Tap anywhere to enable call sound</p>
        <div class="comms-modal-actions">
            <button type="button" class="comms-btn comms-btn--danger" id="commsRejectCall">Decline</button>
            <button type="button" class="comms-btn comms-btn--success" id="commsAcceptCall">Answer</button>
        </div>
        <audio id="commsRingtoneAudio" playsinline loop preload="auto" hidden></audio>
    </div>
</div>

<div class="comms-modal comms-modal--call-ended" id="commsCallEnded" hidden role="dialog" aria-modal="true" aria-labelledby="commsCallEndedTitle">
    <button type="button" class="comms-ended-close" id="commsCallEndedX" aria-label="Close call ended">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
    </button>
    <div class="comms-modal-card comms-modal-card--ended">
        <div class="comms-ended-avatar" id="commsCallEndedAvatar" aria-hidden="true"></div>
        <p class="comms-ended-name" id="commsCallEndedPeer"></p>
        <h2 id="commsCallEndedTitle">Call ended</h2>
        <p class="comms-ended-meta" id="commsCallEndedType" hidden></p>
        <p class="comms-ended-meta" id="commsCallEndedStatus" hidden></p>
        <p class="comms-ended-meta" id="commsCallEndedStarted" hidden></p>
        <p class="comms-ended-meta" id="commsCallEndedAt" hidden></p>
        <p class="comms-ended-duration" id="commsCallEndedDuration" hidden></p>
        <p class="visually-hidden" id="commsCallEndedReason">The call has ended.</p>
        <div class="comms-ended-actions">
            <button type="button" class="comms-btn comms-btn--success" id="commsCallEndedRedial">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/>
                </svg>
                Redial
            </button>
            <button type="button" class="comms-btn comms-btn--secondary" id="commsCallEndedClose">Cancel</button>
        </div>
    </div>
</div>
