# WebRTC Video Call Bug Investigation Report

## Project Structure

### Students Application
- **WebRTC JS**: `C:\Users\admin\Documents\GitHub\Communications\Students\packages\Communications\assets\js\webrtc.js` (~2900 lines)
- **Realtime JS**: `C:\Users\admin\Documents\GitHub\Communications\Students\packages\Communications\assets\js\realtime.js` (Supabase signaling)
- **Controller**: `C:\Users\admin\Documents\GitHub\Communications\Students\packages\Communications\Controllers\CallController.php`
- **Blade Templates**:
  - `views/partials/in-call-ui.blade.php` (call overlay with video elements)
  - `views/partials/incoming-call-modal.blade.php` (answer/decline UI)
  
### Teachers Application
- **WebRTC JS**: `C:\Users\admin\Documents\GitHub\Communications\Teachers\packages\Communications\assets\js\webrtc.js` (~2900 lines)
- **Realtime JS**: `C:\Users\admin\Documents\GitHub\Communications\Teachers\packages\Communications\assets\js\realtime.js` (Supabase signaling)
- **Controller**: `C:\Users\admin\Documents\GitHub\Communications\Teachers\packages\Communications\Controllers\CallController.php`
- **Blade Templates**: Same structure as Students

### Key Differences Between Students and Teachers
**CRITICAL FINDING**: The Students and Teachers applications have **IDENTICAL** WebRTC implementations. Both use the same:
- WebRTC JavaScript code (same structure, same functions, same bugs)
- Realtime signaling via Supabase broadcast channels
- CallController PHP code (identical line-by-line)
- Blade template structure for video elements

This means **all 5 bugs affect both applications equally** and **fixes must be applied to both**.

---

## Video Element Structure (Blade Template)

```html
<div class="comms-call-overlay" id="commsInCall" hidden>
  <div class="comms-call-stage">
    <!-- Remote video (peer's camera) -->
    <video id="commsRemoteVideo" class="comms-remote-video" autoplay playsinline muted></video>
    <div id="commsRemoteVideoOff" hidden><!-- Camera off placeholder --></div>
    
    <!-- Local video (self preview) -->
    <video id="commsLocalVideo" class="comms-local-video" autoplay playsinline muted></video>
    <div id="commsLocalVideoOff" hidden><!-- Camera off placeholder --></div>
    
    <!-- Remote audio (separate element for peer's audio) -->
    <audio id="commsRemoteAudio" class="comms-remote-audio" autoplay playsinline></audio>
    
    <!-- Timer display -->
    <div class="comms-call-timer" id="commsCallTimer" hidden>00:00</div>
  </div>
</div>
```

---

## Root Cause Analysis for All 5 Bugs

### BUG 1: Self-Camera Video Not Visible

**ROOT CAUSE**: The `attachLocalVideo()` function is called correctly, BUT there are race conditions and missing `srcObject` assignments during call initialization.

**Evidence from code** (lines 1642-1657 in webrtc.js):
```javascript
function attachLocalVideo() {
    if (!els.localVideo || !localStream) return;
    if (els.localVideo.srcObject !== localStream) {
        els.localVideo.srcObject = localStream;
    }
    els.localVideo.hidden = false;
    els.localVideo.classList.toggle('is-camera-off', !cameraEnabled);
    // ...play() call
}
```

**Problems identified**:
1. `attachLocalVideo()` is NOT called immediately when `localStream` is acquired during call start
2. In `startCall()` function, the local stream is created but `attachLocalVideo()` may not execute before peer connection setup
3. When a participant joins, no explicit re-attachment of local video happens
4. The local video element starts with `muted` and `autoplay`, but `srcObject` assignment timing is inconsistent

**Specific failure scenario**:
- User starts video call → `getLocalStream(true)` acquires camera
- `localStream` is assigned to variable BUT `attachLocalVideo()` not called yet
- WebRTC peer connection setup begins
- Local preview remains black because `els.localVideo.srcObject` was never set
- When remote participant joins, no code path re-triggers `attachLocalVideo()`

---

### BUG 2: Camera Does Not Turn On After Turning Off

**ROOT CAUSE**: Track state management confusion in `applyCameraState()` function. The code uses `track.enabled = false/true` for toggle, but sometimes stops tracks permanently, and the recovery path has gaps.

**Evidence from code** (lines 1504-1587 in webrtc.js):
```javascript
async function applyCameraState(enabled) {
    if (!enabled) {
        // Keep the track (and the sender) in place; only mute it.
        localStream.getVideoTracks().forEach(function (track) {
            track.enabled = false;  // ← This should work for re-enabling
        });
        cameraEnabled = false;
        syncCameraUi();
        attachLocalVideo();  // ← BUG: Updates UI but doesn't ensure srcObject
        return;
    }
    
    if (liveTrack) {
        // Fast path: the original camera track is still usable.
        localStream.getVideoTracks().forEach(function (track) {
            track.enabled = true;
        });
        liveTrack.enabled = true;
        await attachVideoTrackToSender(liveTrack);
        cameraEnabled = true;
        syncCameraUi();
        attachLocalVideo();  // ← Called but may not refresh properly
        return;
    }
    
    // Slow path: track was ended, acquire new camera stream
    // ... (this works correctly)
}
```

**Problems identified**:
1. **`attachLocalVideo()` does NOT force a visual refresh** when track state changes from `enabled=false` to `enabled=true`
2. The video element's `srcObject` remains the same MediaStream, but browsers may not immediately re-render when track.enabled changes
3. No explicit call to `els.localVideo.play()` after re-enabling
4. The `syncCameraUi()` only updates CSS classes, not the actual video playback state
5. **Missing feedback loop**: Remote participant never receives confirmation that camera turned back on

**Specific failure scenario**:
- Camera ON → user clicks OFF → `track.enabled = false`
- Camera stays off (works)
- User clicks ON again → `track.enabled = true`
- **BUG**: The `<video>` element's `srcObject` is unchanged, browser doesn't know track re-enabled
- Local preview stays black because video element never re-plays the track
- Remote participant's view never updates because no SDP renegotiation triggered

---

### BUG 3: Call Timer Does Not Reset for New Calls

**ROOT CAUSE**: Timer state variables (`callTimer`, `callStartedAt`, `lastCallDurationMs`) are not reliably cleared before starting a new call. Multiple code paths create race conditions.

**Evidence from code**:

**Timer start logic** (lines 1313-1334):
```javascript
function startTimer(serverTime, serverStartedAt) {
    applyServerClock(serverTime);
    
    // FIX BUG #3: Always reset callStartedAt for new calls
    // ↑ Comment suggests previous fix attempt, but NOT COMPLETE
    if (serverStartedAt) {
        var parsed = Date.parse(serverStartedAt);
        if (!isNaN(parsed)) {
            callStartedAt = parsed;  // ← Server timestamp wins
        }
    } else if (!callStartedAt) {
        callStartedAt = Date.now() + clockOffsetMs;  // ← Only if not set
    }
    
    if (callTimer) {
        // Timer already running - just update the display
        renderTimer();
        return;  // ← BUG: Does not clear old timer interval!
    }
    
    renderTimer();
    callTimer = setInterval(function () {
        renderTimer();
    }, 250);
}
```

**Cleanup logic** (lines 1750-1753):
```javascript
clearInterval(callTimer);
callTimer = null;
lastCallDurationMs = callElapsedMs();
callStartedAt = null;
```

**Problems identified**:
1. **`startTimer()` checks `if (callTimer)` and returns early** without clearing the old interval
2. **Race condition**: If `startTimer()` is called before `cleanupMediaOnly()` completes, old timer persists
3. **Multiple cleanup paths**: Timer clearing happens in `cleanupMediaOnly()`, `finishUnanswered()`, and `showCallEnded()`, but not all paths execute
4. **`callStartedAt` reuse**: The line "else if (!callStartedAt)" means if previous call's timestamp wasn't cleared, new call continues from old time
5. **No per-call ID association**: Timer is global state, not tied to `currentCall.id`

**Specific failure scenario**:
- Call 1 starts → `callStartedAt = T1`, timer interval starts
- Call 1 ends → `cleanupMediaOnly()` called asynchronously
- User immediately starts Call 2 → `startTimer()` called BEFORE cleanup finishes
- `callTimer` still has Call 1's interval running
- Call 2's `startTimer()` sees `if (callTimer)` is true, returns early
- **Result**: Call 1's timer continues running, showing time from previous call

---

### BUG 4: Call Delays and WebRTC Connection Issues

**ROOT CAUSES** (multiple contributing factors):

#### 4a. Duplicate `getUserMedia()` Calls
**Evidence**: In `startCall()` function, `getLocalStream()` is called, but if camera toggle happens during setup, `applyCameraState()` calls `getUserMedia()` again:
```javascript
var devices = assertMediaReady();
var camStream = await devices.getUserMedia(videoOnlyConstraints());
```
**Impact**: Requesting camera twice causes browser permission prompts, delays, and sometimes fails on mobile.

#### 4b. Event Listener Accumulation
**Evidence** (lines 1770-1820): PeerConnection event handlers are set every time a call starts:
```javascript
pc.onicecandidate = function(event) { ... };
pc.ontrack = function(event) { ... };
pc.oniceconnectionstatechange = function(event) { ... };
// ... etc
```
**But cleanup** (lines 1784-1792) nulls handlers:
```javascript
pc.onicecandidate = null;
pc.ontrack = null;
// ...
```
**Problem**: If cleanup fails (rejected promise, race condition), old listeners stack up. Each new call adds MORE listeners without removing old ones.

#### 4c. ICE Candidate Queue Race Condition
**Evidence** (line 32): `var iceQueue = [];`

When remote SDP arrives late:
```javascript
// Ice candidates arrive BEFORE remote description is set
if (!pc.remoteDescription) {
    iceQueue.push(candidate);  // Queued
    return;
}
// Later, when remote description arrives:
iceQueue.forEach(function(cand) {
    pc.addIceCandidate(cand);
});
iceQueue = [];
```
**Problem**: If `iceQueue` is never cleared (cleanup fails), OLD call's candidates get added to NEW call's peer connection, causing connection failures.

#### 4d. Stale Signaling Events
**Evidence from realtime.js** (lines 600-650):
The Supabase broadcast channel for signaling is reused:
```javascript
function ensureCallChannel(conversationId) {
    // Reuses existing channel if topic matches
    callChannel = acquireTopicChannel('comms-signal-' + conversationId);
}
```
**Problem**: If old call ends but channel isn't properly torn down, delayed signals from previous call (offer, answer, ICE candidates) arrive during new call setup, causing state machine corruption.

#### 4e. No Early Media Preparation
**Evidence**: `getLocalStream()` is called AFTER user clicks "call" button. Time breakdown:
1. User clicks → 0ms
2. `startCall()` begins → +0ms
3. Server API call to create call record → +200-500ms
4. `getLocalStream()` starts → +500ms
5. Browser asks permission → +1000-3000ms (if not cached)
6. Camera initializes → +1500-4000ms
7. WebRTC offer created → +4500ms
8. **User sees "connecting..." for 4+ seconds**

**Better approach**: Acquire media when user opens chat, cache it, reuse for calls.

---

### BUG 5: Improper Call Cleanup and New Call Session

**ROOT CAUSE**: Cleanup is scattered across multiple async functions with no guaranteed execution order, and state variables are not atomically reset.

**Cleanup functions analysis**:

#### `cleanupMediaOnly()` (lines 1744-1841)
**What it does**:
- Stops all media tracks
- Closes peer connection
- Clears timer
- Nulls `localStream`, `remoteStream`, `pc`
- Removes event listeners
- Tears down signaling channel

**Problems**:
1. **Async execution**: `cleanupMediaOnly()` is async but callers sometimes don't await it
2. **Race condition example** (from `redialLastCall()`, line 693):
```javascript
cleanupMediaOnly().then(function() {
    startCall(ctx.conversationId, ctx.callType, ctx.conversation);
}).catch(function(err) {
    console.error('Cleanup failed before redial:', err);
    // ← BUG: If cleanup fails, state is stuck!
    currentCall = null;
    startingCall = false;
});
```
If cleanup throws error, new call starts with dirty state.

3. **Incomplete cleanup**: Doesn't clear `currentCall`, `incomingCall`, `answeredCall` — these are cleared in other functions

#### Multiple cleanup paths:
- `endCall()` → calls `cleanupMediaOnly()` + updates server
- `finishUnanswered()` → calls `cleanupMediaOnly()` + updates server  
- `showCallEnded()` → clears timer manually, doesn't call cleanup
- `redialLastCall()` → calls `cleanupMediaOnly()` then starts new call

**No single "reset to pristine state" function**.

#### New call initialization issues:

**Evidence from `startCall()` (lines 1960-2100)**:
```javascript
async function startCall(conversationId, callType, conversation) {
    if (startingCall || currentCall) return;  // ← Guards against double-start
    
    // Ensure timer is fully reset (REVIEW FIX #1)
    clearInterval(callTimer);
    callTimer = null;
    callStartedAt = null;
    
    startingCall = true;  // ← Flag to prevent re-entry
    // ... rest of call setup
}
```

**Problems**:
1. **Guard check `if (startingCall || currentCall) return`**: If previous call's cleanup didn't finish, this blocks new call entirely
2. **Timer reset at START**: Timer vars cleared here, but also in cleanup — which runs first? Race condition.
3. **No unique call ID tracking**: Old call's ID can linger in `currentCall.id`, causing signal routing confusion
4. **Realtime channel reuse**: Same conversation ID reuses same Supabase topic, old messages can arrive

#### Specific failure scenario (combining all issues):
1. User in Call A (ID=123), timer running, peer connection active
2. Network glitch → peer connection closes
3. User clicks "End" → `endCall()` starts
4. `endCall()` calls `cleanupMediaOnly()` (async)
5. **User immediately clicks "Start new call" BEFORE cleanup finishes**
6. `startCall()` checks `if (currentCall)` → still Call 123 → **BLOCKED, new call never starts**
7. OR if it bypasses check: New Call B starts with:
   - Old timer interval still running (showing Call A's time)
   - Old ICE candidates in queue
   - Old peer connection event listeners attached
   - Old signaling channel delivering Call A's delayed signals
8. **Result**: Call B shows timer from Call A, delayed connection, or complete failure

---

## Implementation Strategy

### Phase 1: Critical State Management Fixes (Prevents deadlock)
**Goal**: Ensure calls can always start fresh, no leftover state blocks new calls.

1. **Atomic cleanup function**:
   - Create `resetAllCallState()` that synchronously clears ALL variables
   - Make it safe to call multiple times (idempotent)
   - Call it at the START of every `startCall()`, not just at end

2. **Per-call ID tracking**:
   - Store `activeCallId` separately from `currentCall` object
   - Timer, peer connection, and signals must check `activeCallId` matches before processing
   - Stale events from old call IDs get discarded

3. **Startup guard improvement**:
   - Change `if (startingCall || currentCall) return;` to:
   ```javascript
   if (startingCall) {
       await cleanupMediaOnly();  // Force cleanup of stuck start
   }
   if (currentCall && currentCall.id !== newCallId) {
       await endCall();  // Force-end old call
   }
   ```

### Phase 2: Timer Lifecycle Fix (BUG #3)
**Goal**: Every call has independent timer starting at 00:00.

1. **Timer per call ID**:
   ```javascript
   var callTimers = {};  // Map of callId → { interval, startedAt }
   
   function startTimerForCall(callId, serverStartedAt) {
       stopTimerForCall(callId);  // Always clear first
       callTimers[callId] = {
           startedAt: serverStartedAt || Date.now(),
           interval: setInterval(() => renderTimer(callId), 250)
       };
   }
   
   function stopTimerForCall(callId) {
       if (callTimers[callId]) {
           clearInterval(callTimers[callId].interval);
           delete callTimers[callId];
       }
   }
   
   function renderTimer(callId) {
       if (!currentCall || currentCall.id !== callId) return;
       var timer = callTimers[callId];
       if (!timer) return;
       var elapsed = Date.now() - timer.startedAt;
       els.timer.textContent = formatDuration(elapsed);
   }
   ```

2. **Cleanup**: `stopTimerForCall(oldCallId)` on every call end, even if new call starting

### Phase 3: Camera Toggle Fix (BUG #2)
**Goal**: Camera ON → OFF → ON works repeatedly.

1. **Force video element refresh**:
   ```javascript
   function attachLocalVideo() {
       if (!els.localVideo || !localStream) return;
       
       // Always reassign srcObject to force browser update
       els.localVideo.srcObject = null;
       setTimeout(() => {
           els.localVideo.srcObject = localStream;
           els.localVideo.play().catch(() => {});
       }, 10);
       
       els.localVideo.hidden = false;
       syncCameraUi();
   }
   ```

2. **Explicit track state check**:
   ```javascript
   async function applyCameraState(enabled) {
       var track = findLiveVideoTrack();
       
       if (!enabled) {
           if (track) track.enabled = false;
           cameraEnabled = false;
           attachLocalVideo();  // Refresh even when off
           signalPeer({ type: 'camera', enabled: false });
           return;
       }
       
       if (track && track.readyState === 'live') {
           track.enabled = true;
           cameraEnabled = true;
           attachLocalVideo();  // CRITICAL: Refresh after enable
           
           // Force video element play
           els.localVideo.play().catch(() => {});
           
           await attachVideoTrackToSender(track);
           signalPeer({ type: 'camera', enabled: true });
           return;
       }
       
       // Slow path: acquire new track
       // ... existing code
   }
   ```

### Phase 4: Local Video Visibility Fix (BUG #1)
**Goal**: Self-camera always visible when enabled.

1. **Call `attachLocalVideo()` immediately after `getLocalStream()`**:
   ```javascript
   async function startCall(conversationId, callType, conversation) {
       // ... setup code
       
       localStream = await getLocalStream(wantsVideo);
       cameraEnabled = wantsVideo;
       
       attachLocalVideo();  // ← ADD THIS: Immediate preview
       
       // ... continue with peer connection setup
   }
   ```

2. **Re-attach on peer join**:
   ```javascript
   pc.ontrack = function(event) {
       mergeRemoteTrack(event.track, event.streams[0]);
       bindRemoteMedia(remoteStream);
       
       // Ensure local video still visible after peer joins
       attachLocalVideo();  // ← ADD THIS
       
       updateCameraUi();
   };
   ```

### Phase 5: Connection Performance (BUG #4)
**Goal**: Fast call setup, no duplicate media requests, clean signaling.

1. **Pre-warm media**:
   - When user opens chat UI, call `getLocalStream(false)` in background
   - Cache the audio stream in `prewarmStream` variable
   - When call starts, reuse cached stream, only add video if needed

2. **ICE queue cleanup**:
   ```javascript
   function resetIceQueue(callId) {
       if (!callId || !currentCall || currentCall.id !== callId) {
           iceQueue = [];  // Clear stale candidates
       }
   }
   ```
   Call this at start of every `startCall()`.

3. **Deduplicate event listeners**:
   ```javascript
   function setupPeerConnection(callId) {
       if (pc) {
           // Remove old listeners before adding new
           pc.onicecandidate = null;
           pc.ontrack = null;
           // ... etc
           pc.close();
       }
       
       pc = new RTCPeerConnection(stunConfig());
       
       pc.onicecandidate = function(event) {
           if (!currentCall || currentCall.id !== callId) return;
           // ... handle
       };
       
       // ... other handlers with callId check
   }
   ```

4. **Signaling channel isolation**:
   - Tear down Supabase channel immediately on call end
   - Don't reuse topic for different call IDs
   - Add `call_id` check in `handleSignal()` to reject stale signals

---

## Files That Need Modification

### JavaScript Files (Both Students and Teachers)
1. **`webrtc.js`** (PRIMARY - ~300 lines changed):
   - `startCall()` - Add immediate `attachLocalVideo()`
   - `applyCameraState()` - Fix track re-enable + video refresh
   - `startTimer()` - Implement per-call timer map
   - `cleanupMediaOnly()` - Add timer cleanup for specific call ID
   - `attachLocalVideo()` - Force srcObject refresh
   - `resetAllCallState()` - NEW: Atomic state reset function
   - `setupPeerConnection()` - Add call ID checks to all handlers
   - `handleSignal()` - Add call ID validation

2. **`realtime.js`** (15 lines changed):
   - `teardownCallChannel()` - Force immediate channel removal
   - `handleIncomingSignal()` - Add call ID validation

### Backend Files (Both Students and Teachers)
3. **`CallController.php`** (NO CHANGES NEEDED):
   - Already provides unique call IDs
   - `heartbeat()` endpoint works correctly
   - `updateStatus()` handles call lifecycle properly

### Template Files (Both Students and Teachers)
4. **`in-call-ui.blade.php`** (NO CHANGES NEEDED):
   - Video elements already have correct attributes
   - Timer element already present
   - Only JavaScript changes required

---

## Testing Approach

### Test Scenario Matrix (Run on BOTH Students and Teachers apps)

#### Test 1: Self-Camera Visibility
| Step | Action | Expected Result | Bug #1 Fix Verification |
|------|--------|-----------------|------------------------|
| 1 | Student starts video call to Teacher | Student sees own camera immediately | ✓ `attachLocalVideo()` called after `getLocalStream()` |
| 2 | Teacher answers call | Student still sees own camera | ✓ `pc.ontrack` re-attaches local video |
| 3 | Switch camera off and on | Camera visible when on | ✓ BUG #2 fix ensures this |

#### Test 2: Camera Toggle Reliability
| Step | Action | Expected Result | Bug #2 Fix Verification |
|------|--------|-----------------|------------------------|
| 1 | Start video call, camera ON | Local preview shows face | ✓ Initial state correct |
| 2 | Click Camera button OFF | Preview shows "Camera off" placeholder | ✓ `track.enabled = false` works |
| 3 | Click Camera button ON | **Preview shows face again** | ✓ `attachLocalVideo()` refreshes + `play()` called |
| 4 | Repeat OFF → ON 5 times | Works every time | ✓ No track accumulation |
| 5 | Check remote participant's view | Sees camera state changes | ✓ `signalPeer({ type: 'camera' })` sent |

#### Test 3: Timer Reset
| Step | Action | Expected Result | Bug #3 Fix Verification |
|------|--------|-----------------|------------------------|
| 1 | Call 1: Connect, wait 30 seconds | Timer shows 00:30 | ✓ Timer counts correctly |
| 2 | End call 1 | Timer stops, call-ended modal shows duration | ✓ `stopTimerForCall(callId)` clears interval |
| 3 | Immediately start call 2 | Timer shows **00:00** | ✓ NEW timer created, old one cleared |
| 4 | Call 2 connects, wait 10 seconds | Timer shows 00:10 | ✓ Independent timer for call 2 |
| 5 | End call 2, start call 3 | Timer resets to 00:00 again | ✓ Repeatable |

#### Test 4: Rapid Sequential Calls (BUG #4 & #5)
| Step | Action | Expected Result | Fix Verification |
|------|--------|-----------------|------------------|
| 1 | Start call 1, end before connecting | Call ends cleanly | ✓ `cleanupMediaOnly()` completes |
| 2 | **Immediately** start call 2 (within 1 second) | Call 2 starts, no "already in call" error | ✓ State reset allows new call |
| 3 | Call 2 connects normally | Video/audio work, timer starts at 00:00 | ✓ No stale state from call 1 |
| 4 | End call 2, wait 5 seconds, start call 3 | Works normally | ✓ Delayed cleanup doesn't break next call |

#### Test 5: Connection Reliability
| Step | Action | Expected Result | Bug #4 Fix Verification |
|------|--------|-----------------|------------------------|
| 1 | Start video call | Camera permission requested ONCE | ✓ No duplicate `getUserMedia()` |
| 2 | Check browser console during call setup | No "ICE candidate failed" errors | ✓ ICE queue cleared |
| 3 | Measure time from "Call" click to "Calling..." UI | < 2 seconds | ✓ Pre-warmed media (if implemented) |
| 4 | Check time from "Calling..." to "Connected" | < 5 seconds (on good network) | ✓ Clean signaling, no stale events |

#### Test 6: Cross-Platform (Desktop + Mobile)
| Platform | Test | Expected Result |
|----------|------|----------------|
| Desktop Chrome | All tests above | All pass |
| Desktop Firefox | All tests above | All pass |
| Mobile Safari (iOS) | Camera toggle, timer reset | All pass |
| Mobile Chrome (Android) | Camera toggle, timer reset | All pass |

#### Test 7: Edge Cases
| Scenario | Action | Expected Result | Verification |
|----------|--------|-----------------|--------------|
| Permission denied | Deny camera permission, try video call | Falls back to audio-only, no crash | ✓ Error handling |
| Camera in use | Open camera in another app, try call | Clear error message | ✓ Device busy handling |
| Network glitch during call | Disconnect Wi-Fi for 5 seconds | Call reconnects or ends gracefully | ✓ ICE restart |
| Browser tab backgrounded | Start call, switch tab for 1 minute, come back | Call still active, timer correct | ✓ Timer survives background |

---

## Verification Commands

### Build Commands
```bash
# Students app
cd C:\Users\admin\Documents\GitHub\Communications\Students
npm run build  # or npm run dev

# Teachers app  
cd C:\Users\admin\Documents\GitHub\Communications\Teachers
npm run build  # or npm run dev
```

### Test in Browser
1. Open Students app: `http://localhost:8000` (or configured port)
2. Open Teachers app in another browser/tab: `http://localhost:8001`
3. Start call from Student → Teacher
4. Execute test scenarios above

### Console Checks (Run in Browser DevTools)
```javascript
// Check current call state
window.CommsWebRTC

// Check timer state (after fixes)
callTimers

// Check media streams
localStream
remoteStream

// Check peer connection
pc
```

---

## Summary of Root Causes

| Bug | Root Cause | Fix Complexity | Lines Changed |
|-----|------------|----------------|---------------|
| #1: Self-camera not visible | `attachLocalVideo()` not called after `getLocalStream()` | Low | ~10 lines |
| #2: Camera toggle fails | Video element not refreshed when `track.enabled` changes | Medium | ~30 lines |
| #3: Timer doesn't reset | Global timer state, not per-call, race condition in `startTimer()` | Medium | ~80 lines |
| #4: Call delays | Duplicate getUserMedia, stale ICE candidates, event listener accumulation | High | ~120 lines |
| #5: Cleanup incomplete | Async cleanup not awaited, multiple cleanup paths, no atomic reset | High | ~60 lines |
| **TOTAL** | **Multiple state management issues across call lifecycle** | **High** | **~300 lines** |

---

## Critical Implementation Notes

1. **Apply fixes to BOTH Students and Teachers**: Codebases are identical, fixes must be duplicated
2. **Test on mobile**: Camera toggle and autoplay behave differently on iOS Safari
3. **Verify Supabase signaling**: Call ID must be in every signal payload to prevent cross-call contamination
4. **Timer persistence**: Consider using `sessionStorage` to preserve timer if tab refreshes (advanced)
5. **Accessibility**: Ensure screen readers announce camera state changes and call status updates

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing group calls | Medium | High | Test group call flow separately |
| Mobile Safari autoplay block | High | Medium | Add user gesture requirement for first call |
| Race condition in async cleanup | Medium | High | Add mutex lock on `startingCall` flag |
| Supabase channel exhaustion | Low | Medium | Implement channel reuse cap (max 5 per user) |
| Timer drift on long calls | Low | Low | Use server time sync (already implemented with `clockOffsetMs`) |

---

## Next Steps for Implementation

1. **Phase 1** (Day 1): Implement atomic state reset + per-call timer
   - Priority: Fixes bug #3 and prevents bug #5 deadlocks
   - Test: Rapid call start/end cycles

2. **Phase 2** (Day 1): Fix camera toggle + local video attachment
   - Priority: Fixes bug #1 and #2
   - Test: Camera ON/OFF repeatedly, check both local and remote views

3. **Phase 3** (Day 2): Connection performance improvements
   - Priority: Fixes bug #4
   - Test: Call setup time, no duplicate getUserMedia

4. **Phase 4** (Day 2): Comprehensive testing on all platforms
   - Desktop Chrome, Firefox, Safari
   - Mobile iOS Safari, Android Chrome
   - Cross-app calls (Student ↔ Teacher)

5. **Phase 5** (Day 3): Edge case handling + code review
   - Permission denied, device busy, network glitches
   - Code review for race conditions
   - Documentation updates
