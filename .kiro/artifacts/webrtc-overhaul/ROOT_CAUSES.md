# WebRTC Root Cause Analysis

## Executive Summary

Investigation of the WebRTC implementation in both Students and Teachers applications reveals that **most critical bugs have already been addressed in previous sessions**. The codebase shows evidence of recent fixes, but a comprehensive verification pass is needed to ensure all edge cases are covered.

## Key Findings

### 1. Students vs Teachers Implementation

- **Files**: 
  - `Students/packages/Communications/assets/js/webrtc.js` (3140 lines)
  - `Teachers/packages/Communications/assets/js/webrtc.js` (3137 lines)
- **Status**: Nearly identical implementations with only 3 lines difference
- **Conclusion**: Changes to one app must be mirrored to the other

### 2. Critical Bug Status

#### BUG #1: Hangup Signal Not Disconnecting Other Participant ✅ FIXED
**Location**: Lines 2447-2464 (Students/webrtc.js)
**Fix Applied**:
```javascript
// FIX BUG #1: Send hangup signal BEFORE nulling currentCall
// and WAIT for it to ensure the other participant receives it
try {
    await signalPeer({
        type: 'hangup',
        reason: 'ended',
        ended_by_role: role || 'caller',
        call_id: callSnapshot.id,
        conversation_id: callSnapshot.conversation_id,
        // ... full payload
    });
} catch (err) {
    console.error('Failed to send hangup signal:', err);
}
```

**Receiving End**: Lines 2585-2604
```javascript
if (payload.type === 'hangup') {
    if (currentCall && payload.call_id != null && Number(currentCall.id) !== Number(payload.call_id)) {
        return;
    }
    // FIX BUG #1 & #3: Mark call as terminal and cleanup immediately
    if (hangupId != null) markCallTerminal(hangupId);
    
    // FIX BUG #2: Stop the timer immediately when call ends
    stopCallTimer();
    
    currentCall = null;
    role = null;
    await cleanupMediaOnly();
    // ... show ended screen
}
```

**Status**: Fix is present and comprehensive

#### BUG #2: Timer Continuing from Previous Call ✅ FIXED
**Location**: Lines 443-451 (stopCallTimer function)
**Fix Applied**:
```javascript
/**
 * FIX BUG #3: Force stop call timer and reset state
 * Called before starting any new call to ensure clean state
 */
function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    callStartedAt = null;
    lastCallDurationMs = 0;
}
```

**Called From**:
- Line 2084: `placeCall()` - before starting outgoing call
- Line 2261: `acceptIncoming()` - before accepting incoming call
- Line 2596: `handleSignal()` hangup handler - when receiving hangup
- Line 1803: `cleanupMediaOnly()` - during general cleanup

**Timer Start**: Lines 1338-1367 (startTimer function)
```javascript
function startTimer(serverStartedAt, serverTime) {
    applyServerClock(serverTime);
    
    // FIX BUG #3: ALWAYS clear existing timer first to prevent multiple intervals
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    
    // FIX BUG #3: Always set fresh timestamp for each call
    if (serverStartedAt) {
        var parsed = Date.parse(serverStartedAt);
        if (!isNaN(parsed)) {
            callStartedAt = parsed;
        } else {
            callStartedAt = Date.now() + clockOffsetMs;
        }
    } else {
        callStartedAt = Date.now() + clockOffsetMs;
    }
    
    // Start fresh timer interval
    renderTimer();
    callTimer = setInterval(function () {
        renderTimer();
    }, 250);
}
```

**Status**: Fix is comprehensive and called at all entry points

#### BUG #3: Camera Toggle Failing After First Use ⚠️ PARTIALLY FIXED
**Location**: Lines 1508-1630 (applyCameraState function)
**Fixes Applied**:
- Line 1547: `attachLocalVideo()` called after disabling camera
- Line 1559: `attachLocalVideo()` called after enabling camera
- Line 1562-1568: Force video element to play after re-enabling
- Lines 1585-1626: Complete track replacement logic for ended tracks

**Potential Issues**:
1. `els.localVideo` attributes set in multiple places:
   - Line 1469 (ensurePeerConnection)
   - Line 1686 (attachLocalVideo)
2. Camera state chain (`cameraChain`) used for serialization but no explicit error recovery if chain gets stuck

**Status**: Fix is present but needs verification under edge cases (rapid toggling, device removal)

#### BUG #4: Local Preview Visibility ✅ FIXED
**Location**: Lines 1686-1706 (attachLocalVideo function)
**Fix Applied**:
```javascript
function attachLocalVideo() {
    if (!els.localVideo || !localStream) return;
    if (els.localVideo.srcObject !== localStream) {
        els.localVideo.srcObject = localStream;
    }
    // FIX BUG #1: Ensure all required video attributes are set
    els.localVideo.muted = true;
    els.localVideo.setAttribute('muted', '');
    els.localVideo.playsInline = true;
    els.localVideo.autoplay = true;
    els.localVideo.hidden = false;
    els.localVideo.classList.toggle('is-camera-off', !cameraEnabled);
    // ... play attempt
    syncLocalPipLayout();
}
```

**Also Called**:
- Line 1407: After creating peer connection
- Line 1469: Inside ensurePeerConnection
- Line 1449: In ontrack handler (ensures local video stays visible when peer joins)

**Status**: Fix is comprehensive

#### BUG #5: ICE Candidates and Stale State ✅ FIXED
**Location**: Lines 1800-1883 (cleanupMediaOnly function)
**Fixes Applied**:
```javascript
// FIX BUG #4 & #5: Clear ICE queue to prevent stale candidates
iceQueue = [];

// FIX BUG #5: Always teardown call channel to prevent stale signals
if (window.CommsRealtime && typeof window.CommsRealtime.teardownCallChannel === 'function') {
    window.CommsRealtime.teardownCallChannel();
}
```

**Additional Cleanup**:
- Lines 1859-1867: Explicit nulling of all peer connection event handlers
- Lines 1850-1858: Cleanup of remote track event listeners
- Lines 1870-1876: Removal of remote video event listeners

**Status**: Comprehensive cleanup implemented

### 3. Architecture Analysis

#### Call State Machine
```
IDLE 
  ↓
OUTGOING (caller) / INCOMING (callee)
  ↓
CONNECTING (after accept)
  ↓
CONNECTED (ICE connected)
  ↓
ENDED
```

**State Variables**:
- `currentCall`: Active call object with metadata
- `role`: 'caller' | 'callee' | null
- `callConnected`: Boolean indicating WebRTC connection state
- `startingCall`: Boolean guard against concurrent call starts
- `callTimer`: setInterval handle for duration display
- `callStartedAt`: Timestamp for duration calculation
- `pc`: RTCPeerConnection instance
- `localStream`: Local MediaStream
- `remoteStream`: Remote MediaStream
- `iceQueue`: Array of ICE candidates received before remote SDP

#### Signaling Flow

**Outgoing Call (Caller)**:
1. `startCall()` → `beginCallCountdown()` (3 second delay)
2. `placeCall()`: Create call record, subscribe to channel
3. Send `incoming-call` signal immediately (ring peer without waiting for media)
4. Acquire local stream via `ensurePeerConnection()`
5. Create SDP offer
6. Send `offer` signal
7. Wait for `answer` signal
8. Receive ICE candidates
9. Connection established

**Incoming Call (Callee)**:
1. Receive `incoming-call` OR `offer` signal
2. Show incoming modal
3. User clicks Accept → `acceptIncoming()`
4. Subscribe to channel
5. Send `call-accepted` signal
6. Acquire local stream via `ensurePeerConnection()`
7. Set remote SDP from queued offer
8. Create SDP answer
9. Send `answer` signal with `started_at` timestamp
10. Process queued ICE candidates
11. Connection established

**Call Termination**:
1. User clicks End → `endCall()`
2. Send `hangup` signal with call_id
3. Update server status
4. Call `cleanupMediaOnly()`
5. Show ended screen

**Hangup Reception**:
1. Receive `hangup` signal
2. Validate call_id matches current call
3. Mark call terminal
4. Stop timer
5. Null `currentCall`
6. Call `cleanupMediaOnly()`
7. Fetch server state for authoritative duration
8. Show ended screen

### 4. Potential Remaining Issues

#### Issue A: Race Condition in signalPeer()
**Location**: Lines 738-763
**Problem**: Lines 740-742 added a fallback to allow signaling when `currentCall` is null (for hangup signals), but this may allow stale signals to be sent with wrong conversation_id

**Code**:
```javascript
// FIX BUG: Allow signaling even when currentCall is null (for hangup signals)
// Use payload values if currentCall is not available
var conversationId = (currentCall && currentCall.conversation_id) || payload.conversation_id;
var callId = (currentCall && currentCall.id) || payload.call_id;
```

**Risk**: If `endCall()` sends hangup, then immediately nulls `currentCall`, the `signalPeer()` call might use a conversation_id from the payload that doesn't match reality. However, `endCall()` now sends the signal **before** nulling currentCall, so this is actually safe.

**Status**: ✅ Safe due to BUG #1 fix

#### Issue B: Camera State Chain Error Recovery
**Location**: Lines 1500-1534 (setCameraEnabled function)
**Problem**: The `cameraChain` promise chain has error handlers that call `syncCameraUi()`, but if an error occurs mid-toggle, `cameraBusy` might be stuck true

**Code**:
```javascript
cameraChain = cameraChain.then(function () {
    var wanted = cameraPending;
    return applyCameraState(wanted);
}).catch(function (err) {
    toast((err && err.message) || 'Unable to toggle camera.', 'error');
    syncCameraUi();  // Sets cameraBusy state from global variable
}).then(function () {
    // ...
});
```

**Inside applyCameraState**:
```javascript
cameraBusy = true;
syncCameraUi();
try {
    // ... do work
} finally {
    cameraBusy = false;  // Always cleared
    syncCameraUi();
}
```

**Status**: ✅ Safe - `finally` block ensures `cameraBusy` is always cleared

#### Issue C: Multiple Interval Timers
**Problem**: If `startTimer()` is called multiple times without proper cleanup, multiple intervals could run

**Evidence of Fix**:
- Line 1342-1345: Always clear existing timer before creating new one
- Line 443-451: `stopCallTimer()` function clears both timer and timestamp
- Line 1803-1806: `cleanupMediaOnly()` also clears timer

**Status**: ✅ Fixed

#### Issue D: Renegotiation During Camera Toggle
**Location**: Lines 1728-1746 (renegotiateForCamera function)
**Problem**: If camera is toggled rapidly, multiple renegotiation attempts could occur

**Protection**:
```javascript
if (!pc || !currentCall || negotiating) return;
if (pc.signalingState !== 'stable') return;
negotiating = true;
try {
    // create and send offer
} catch (e) {
    /* ignore */
} finally {
    negotiating = false;
}
```

**Status**: ✅ Protected by `negotiating` flag and signaling state check

#### Issue E: Remote Track Event Listener Cleanup
**Location**: Lines 1004-1028 (mergeRemoteTrack function)
**Problem**: Event listeners added to tracks but cleanup depends on track object properties

**Fix Applied** (Lines 1850-1858):
```javascript
if (remoteStream && typeof remoteStream.getTracks === 'function') {
    remoteStream.getTracks().forEach(function (track) {
        if (track._commsUnmuteHandler) {
            track.removeEventListener('unmute', track._commsUnmuteHandler);
            delete track._commsUnmuteHandler;
        }
        if (track._commsEndedHandler) {
            track.removeEventListener('ended', track._commsEndedHandler);
            delete track._commsEndedHandler;
        }
        try { track.stop(); } catch (e) { /* ignore */ }
    });
}
```

**Status**: ✅ Fixed

### 5. Cross-Application Compatibility

Both Students and Teachers apps share:
- ✅ Same signal event names (incoming-call, offer, answer, hangup, ice, camera, call-accepted)
- ✅ Same call record structure (caller_id, receiver_id, call_type, conversation_id)
- ✅ Same signaling function signatures
- ✅ Same cleanup patterns
- ✅ Same timer implementation

**Verification Needed**:
- Actual cross-portal calling (Student → Teacher and vice versa)
- Call rejection flow between portals
- Call timeout handling between portals

### 6. Realtime Channel Management

**Channel Lifecycle**:
1. `subscribeCallChannel(conversationId)` → calls `CommsRealtime.ensureCallChannel()`
2. Channel stays active during call
3. `teardownCallChannel()` called in `cleanupMediaOnly()`

**Potential Issue**: Multiple rapid calls to same conversation might subscribe to channel multiple times

**realtime.js Analysis** (Lines 714-744):
```javascript
function ensureCallChannel(conversationId) {
    var sb = ensureClient();
    if (!sb || !conversationId) return Promise.resolve(null);
    // ... creates channel if callChannelId !== conversationId
    // This REPLACES the previous channel, not stack them
}
```

**Status**: ✅ Safe - channels are replaced, not stacked

## Conclusion

### Overall Status: 🟢 GOOD

The codebase has received comprehensive fixes for all reported critical bugs:

1. ✅ **Hangup synchronization**: Fixed with proper signal ordering
2. ✅ **Timer reset**: Fixed with dedicated stopCallTimer() function
3. ⚠️ **Camera toggle**: Fixed but needs edge case verification
4. ✅ **Local video preview**: Fixed with proper attribute management
5. ✅ **Cleanup and memory**: Fixed with comprehensive teardown

### Recommended Actions

1. **Verification Pass**: Test all fixes under various conditions
2. **Edge Case Testing**: 
   - Rapid camera toggling (10+ times)
   - Device removal during call
   - Network interruption during call
   - Simultaneous incoming calls
3. **Cross-Portal Testing**: Student ↔ Teacher calls
4. **Browser Compatibility**: Test on Chrome, Firefox, Safari, Edge
5. **Mobile Testing**: iOS and Android browsers
6. **Code Synchronization**: Ensure Students and Teachers implementations remain identical

### No New Bugs Found

Investigation revealed no additional root causes beyond what has already been addressed. The implementation follows WebRTC best practices with proper:
- State machine management
- Promise chain handling
- Event listener cleanup
- Resource disposal
- Error handling

### Technical Debt

Minor cleanup opportunities (non-critical):
1. Consider extracting call state machine to a separate module
2. Add TypeScript types for better type safety
3. Add unit tests for state transitions
4. Document the signaling protocol explicitly
