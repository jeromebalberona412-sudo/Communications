<div class="comms-modal" id="commsIncomingCall" hidden role="dialog" aria-modal="true" aria-labelledby="commsIncomingTitle">
    <div class="comms-modal-card comms-modal-card--call">
        <div class="comms-call-pulse" aria-hidden="true"></div>
        <div class="comms-incoming-avatar" id="commsIncomingAvatar" aria-hidden="true"></div>
        <h2 id="commsIncomingTitle">Incoming call</h2>
        <p class="comms-modal-peer" id="commsIncomingPeer"></p>
        <p class="comms-modal-type" id="commsIncomingType"></p>
        <p class="comms-modal-hint">Ringing...</p>
        <div class="comms-modal-actions">
            <button type="button" class="comms-btn comms-btn--danger" id="commsRejectCall">Decline</button>
            <button type="button" class="comms-btn comms-btn--success" id="commsAcceptCall">Answer</button>
        </div>
    </div>
</div>

<div class="comms-modal comms-modal--call-ended" id="commsCallEnded" hidden role="dialog" aria-modal="true" aria-labelledby="commsCallEndedTitle">
    <button type="button" class="comms-ended-close" id="commsCallEndedClose" aria-label="Close">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
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
        <button type="button" class="comms-btn comms-btn--success" id="commsCallEndedRedial" hidden tabindex="-1" aria-hidden="true">Redial</button>
    </div>
</div>
