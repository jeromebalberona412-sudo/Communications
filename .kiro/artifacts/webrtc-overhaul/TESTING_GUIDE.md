# WebRTC Testing Guide

## Overview

This guide provides comprehensive test scenarios to verify the WebRTC calling system works correctly after the bug fixes. All tests should be performed in both directions (Student → Teacher and Teacher → Student).

## Prerequisites

### Environment Setup
1. **Two Applications Running**:
   - Students app: `http://localhost:8000` (or configured port)
   - Teachers app: `http://localhost:8006` (or configured port)

2. **Two Browser Sessions**:
   - Session A: Logged in as Student
   - Session B: Logged in as Teacher
   - Use Chrome/Edge for primary testing, then repeat critical tests on Firefox and Safari

3. **Media Permissions**:
   - Camera enabled
   - Microphone enabled
   - Permissions granted to both applications

4. **Network**: Both apps connected to same Supabase Realtime instance

### Test Data Requirements
- At least one conversation between Student and Teacher
- Conversation ID known
- User IDs and types properly configured

## Test Categories

### Category 1: Basic Call Flow ✓

#### Test 1.1: Outgoing Voice Call
**Steps**:
1. Student clicks Voice Call button
2. Observe 3-second countdown
3. Wait for ringing screen
4. Teacher receives incoming call modal
5. Teacher clicks Answer
6. Both see "Connected" status
7. Timer starts at 00:00 for both participants
8. Audio is audible on both sides

**Expected Results**:
- ✅ Countdown: "Starting in 3s... 2s... 1s..."
- ✅ Caller sees: "Ringing..." with ringtone
- ✅ Callee sees: "Incoming Voice Call" modal with ringtone
- ✅ After accept: Both see "Connected"
- ✅ Timer: Starts at 00:00, counts up in real-time
- ✅ Audio: Clear, bidirectional
- ✅ Local preview: Not shown (voice call)
- ✅ UI: Mute and End buttons visible

**Pass Criteria**:
- No console errors
- Timer synchronized within 1 second
- Audio quality good
- UI responsive

#### Test 1.2: Outgoing Video Call
**Steps**:
1. Teacher clicks Video Call button
2. Observe countdown
3. Wait for connection
4. Student answers
5. Both see video streams

**Expected Results**:
- ✅ Caller: Local camera preview appears immediately during countdown
- ✅ Callee: Local camera preview appears after clicking Answer
- ✅ Both: See each other's video after connection
- ✅ Both: Timer synchronized
- ✅ Camera off placeholder shows correct initials when camera disabled

**Pass Criteria**:
- Both video streams load within 3 seconds of connection
- No black screens or frozen frames
- Local preview always visible (even when camera off)
- Aspect ratios correct

#### Test 1.3: Call Rejection
**Steps**:
1. Student calls Teacher
2. Teacher clicks Decline

**Expected Results**:
- ✅ Caller sees: "Call ended - The other person declined the call"
- ✅ Callee sees: "Call declined - You declined the call"
- ✅ Both: Call ended screen shows < 5 seconds after decline
- ✅ Both: Ringtone stops immediately
- ✅ Both: Can start new call immediately

**Pass Criteria**:
- No lingering modals
- No console errors
- Both participants return to idle state

#### Test 1.4: Call Timeout (No Answer)
**Steps**:
1. Student calls Teacher
2. Wait 30 seconds without answering

**Expected Results**:
- ✅ Caller sees: "Call ended - Call ended. No pickup." after 30 seconds
- ✅ Callee: Modal disappears automatically
- ✅ Ringtone stops for both
- ✅ Server marks call as "missed"

**Pass Criteria**:
- Timeout occurs at exactly RING_TIMEOUT_MS (30 seconds)
- No stuck modals
- Clean return to idle state

### Category 2: Call Termination Synchronization 🔥 CRITICAL

#### Test 2.1: Caller Ends Connected Call
**Steps**:
1. Establish voice call (Student → Teacher)
2. Wait 10 seconds (timer shows ~00:10)
3. Student clicks End

**Expected Results**:
- ✅ Student: Sees "Call ended - The call has ended" immediately
- ✅ Teacher: **MUST disconnect within 1 second**
- ✅ Teacher: Sees "Call ended - The call has ended"
- ✅ Both: Timer stops at same duration (within 1 second)
- ✅ Both: Call ended screen shows duration (~10 seconds)
- ✅ Both: Media streams stop
- ✅ Both: Can start new call immediately

**Pass Criteria**:
- **Teacher disconnects within 1000ms of Student clicking End**
- No "ghost call" where one participant stays connected
- No console errors
- Duration shown is accurate

#### Test 2.2: Callee Ends Connected Call
**Steps**:
1. Establish video call (Teacher → Student)
2. Wait 5 seconds
3. Student (callee) clicks End

**Expected Results**:
- ✅ Student: Sees "Call ended" immediately
- ✅ Teacher: **MUST disconnect within 1 second**
- ✅ Both: See call ended screen
- ✅ Both: Duration shown (~5 seconds)
- ✅ Both: Camera and microphone indicators off
- ✅ Both: Can start new call immediately

**Pass Criteria**:
- **Teacher disconnects immediately when Student ends**
- WebRTC peer connection closed on both sides
- No lingering video streams

#### Test 2.3: Network Hangup Delivery
**Steps**:
1. Establish call
2. Open browser DevTools Network tab
3. End call
4. Verify hangup signal sent

**Expected Results**:
- ✅ Hangup signal sent via Supabase broadcast
- ✅ Payload includes: `type: 'hangup'`, `call_id`, `conversation_id`, `ended_by_role`
- ✅ Other participant receives signal within 500ms
- ✅ Signal processed correctly (call ends)

**Pass Criteria**:
- Signal visible in Network/Realtime tab
- Payload structure correct
- Delivery confirmed

### Category 3: Timer Reset 🔥 CRITICAL

#### Test 3.1: Sequential Calls - Same Participants
**Steps**:
1. Student calls Teacher (voice)
2. Wait 15 seconds
3. Student ends call
4. Wait for call ended screen to appear
5. Student starts NEW call to Teacher
6. Teacher answers

**Expected Results**:
- ✅ First call: Timer reaches ~00:15
- ✅ Call ended screen: Shows "Duration: 0:15"
- ✅ **Second call: Timer MUST start at 00:00**
- ✅ Second call: Timer counts up from 00:00
- ✅ **Previous 15-second duration NEVER appears**

**Pass Criteria**:
- **Timer shows 00:00 at start of second call**
- No carryover from previous call
- Both participants see 00:00

#### Test 3.2: Multiple Sequential Calls
**Steps**:
1. Call 1: 5 seconds, end
2. Call 2: 10 seconds, end
3. Call 3: 3 seconds, end
4. Call 4: 20 seconds, end

**Expected Results**:
- ✅ Call 1 ended screen: Duration 0:05
- ✅ Call 2: Timer starts at 00:00, ended screen shows 0:10
- ✅ Call 3: Timer starts at 00:00, ended screen shows 0:03
- ✅ Call 4: Timer starts at 00:00, ended screen shows 0:20

**Pass Criteria**:
- Every call starts at 00:00
- Every ended screen shows correct unique duration
- No timer value ever carries over

#### Test 3.3: Timer During Countdown
**Steps**:
1. Student starts call (3-second countdown begins)
2. Observe countdown: "Starting in 3s... 2s... 1s..."
3. Teacher answers during or after countdown
4. Observe timer

**Expected Results**:
- ✅ During countdown: Timer shows placeholder "00:00"
- ✅ After connection: Timer starts counting from 00:00
- ✅ Countdown does NOT count toward call duration

**Pass Criteria**:
- Timer starts only after ICE connection established
- Countdown time not included in duration

#### Test 3.4: Timer Synchronization
**Steps**:
1. Establish call
2. Let run for 60 seconds
3. Compare timer on both sides

**Expected Results**:
- ✅ Both timers show same time (within 1 second)
- ✅ Timer derived from server timestamp, not local intervals
- ✅ Both participants see ~01:00

**Pass Criteria**:
- Time difference < 1 second
- No drift over time
- Uses `started_at` from server

### Category 4: Camera System

#### Test 4.1: Camera Toggle - Video Call
**Steps**:
1. Start video call
2. Click Camera button to turn OFF
3. Wait 2 seconds
4. Click Camera button to turn ON
5. Wait 2 seconds
6. Repeat steps 2-5 five more times (10 total toggles)

**Expected Results**:
- ✅ Toggle 1 OFF: Local preview shows "camera off" placeholder, remote sees blank/avatar
- ✅ Toggle 1 ON: Local preview shows camera feed, remote sees video
- ✅ Toggle 2-10: **MUST work identically every time**
- ✅ No frozen frames
- ✅ No black screens
- ✅ No "Unable to toggle camera" errors
- ✅ Remote participant sees correct state

**Pass Criteria**:
- **All 10 toggles work perfectly**
- No degradation after multiple toggles
- Video resumes instantly when turned on
- Camera permission not re-requested

#### Test 4.2: Camera Toggle - Rapid Clicks
**Steps**:
1. Start video call
2. Click Camera button 10 times rapidly (within 2 seconds)
3. Observe final state

**Expected Results**:
- ✅ UI may lag slightly but recovers
- ✅ Final state matches last click
- ✅ No stuck "busy" state
- ✅ No duplicate tracks
- ✅ Camera ends in correct state (on or off)

**Pass Criteria**:
- No crash or freeze
- Final state consistent
- Remote sees correct final state

#### Test 4.3: Camera Toggle - Voice to Video Upgrade
**Steps**:
1. Start voice call (camera off)
2. Click Camera button to turn ON
3. Wait for video to appear
4. Click Camera button to turn OFF
5. Click Camera button to turn ON again

**Expected Results**:
- ✅ Voice call: No local preview initially
- ✅ Turn ON: Camera permission requested, video appears
- ✅ Remote: Receives video track
- ✅ Turn OFF: Placeholder shown
- ✅ Turn ON again: Video resumes without re-requesting permission

**Pass Criteria**:
- Smooth upgrade from voice to video
- Camera toggle works after upgrade
- No WebRTC errors

#### Test 4.4: Local Preview Persistence
**Steps**:
1. Start video call
2. Wait for remote video to connect
3. Observe local preview

**Expected Results**:
- ✅ Local preview visible before remote connects
- ✅ Local preview **STAYS visible** after remote connects
- ✅ Local preview shows in picture-in-picture position
- ✅ Local preview never disappears unless camera turned off

**Pass Criteria**:
- Local preview always visible (when camera on)
- Not replaced or hidden by remote video
- PiP positioning correct

#### Test 4.5: Camera Signal to Remote
**Steps**:
1. Start video call
2. Turn camera OFF
3. Ask remote participant what they see
4. Turn camera ON
5. Ask remote participant what they see

**Expected Results**:
- ✅ Remote: Sees video initially
- ✅ After OFF: Remote sees "camera off" placeholder within 1 second
- ✅ After ON: Remote sees video resume within 1 second
- ✅ No frozen frame from before OFF

**Pass Criteria**:
- Remote sees state changes immediately
- Signaling works correctly
- No stale video frames

### Category 5: Microphone System

#### Test 5.1: Mute Toggle
**Steps**:
1. Start voice call
2. Click Mute button
3. Speak into microphone
4. Ask remote if they hear you (they should NOT)
5. Click Unmute button
6. Speak into microphone
7. Ask remote if they hear you (they SHOULD)
8. Repeat steps 2-7 five times

**Expected Results**:
- ✅ Mute: Remote hears nothing
- ✅ Unmute: Remote hears audio
- ✅ All 5 cycles work identically
- ✅ No audio artifacts

**Pass Criteria**:
- Mute/unmute reliable every time
- No audio leakage when muted
- No stuck mute state

#### Test 5.2: Mute During Video Call
**Steps**:
1. Start video call
2. Mute microphone
3. Turn camera off
4. Turn camera on
5. Unmute microphone

**Expected Results**:
- ✅ Mute persists while camera toggles
- ✅ Camera toggle doesn't affect microphone state
- ✅ Audio track independent of video track

**Pass Criteria**:
- Audio and video controls independent
- No interference between tracks

### Category 6: Connection Reliability

#### Test 6.1: ICE Connection States
**Steps**:
1. Start call
2. Open DevTools Console
3. Watch for ICE connection state changes
4. Wait for "connected" or "completed" state

**Expected Results**:
- ✅ States: new → checking → connected/completed
- ✅ Connection established within 10 seconds
- ✅ No "failed" state
- ✅ Status changes to "Connected"

**Pass Criteria**:
- ICE connection succeeds
- No timeout (30 second limit)
- Console shows proper state progression

#### Test 6.2: SDP Exchange
**Steps**:
1. Start call
2. Monitor console for "offer" and "answer" logs
3. Verify SDP negotiation

**Expected Results**:
- ✅ Caller sends offer
- ✅ Callee receives offer, sends answer
- ✅ Caller receives answer
- ✅ Both set remote descriptions
- ✅ No "InvalidStateError"

**Pass Criteria**:
- SDP exchange completes successfully
- No signaling errors
- Peer connection stable

#### Test 6.3: ICE Candidate Queueing
**Steps**:
1. Start call
2. Observe ICE candidates arriving before SDP answer
3. Verify candidates processed after answer received

**Expected Results**:
- ✅ Early candidates queued in `iceQueue`
- ✅ Candidates added after `setRemoteDescription()`
- ✅ Queue cleared
- ✅ Connection establishes

**Pass Criteria**:
- No "InvalidStateError: no remote description"
- ICE candidates processed in correct order
- Queue mechanism works

### Category 7: Edge Cases

#### Test 7.1: Cancel During Countdown
**Steps**:
1. Student starts call (countdown begins)
2. Student clicks Cancel during countdown
3. Observe

**Expected Results**:
- ✅ Countdown stops
- ✅ Call cancelled immediately
- ✅ Teacher never receives incoming call
- ✅ Student returns to idle state
- ✅ Toast: "Call cancelled"

**Pass Criteria**:
- Clean cancellation
- No "ghost" ring at teacher side
- No server call record created (or marked cancelled)

#### Test 7.2: Reject During Connection
**Steps**:
1. Student calls Teacher
2. Teacher clicks Answer
3. During "Connecting..." phase, Teacher clicks End
4. Observe

**Expected Results**:
- ✅ Student sees "Call ended"
- ✅ Teacher sees "Call ended"
- ✅ No stuck "Connecting..." state
- ✅ Both return to idle

**Pass Criteria**:
- Call terminates cleanly
- No partial connection

#### Test 7.3: Multiple Incoming Calls
**Steps**:
1. Have Teacher A call Student
2. While incoming modal visible, have Teacher B call same Student
3. Observe Student's UI

**Expected Results**:
- ✅ Student sees Teacher A's incoming call
- ✅ Teacher B's call does NOT replace modal
- ✅ Student can answer Teacher A's call
- ✅ Teacher B's call eventually times out

**Pass Criteria**:
- One modal at a time
- No modal hijacking
- Clear behavior

#### Test 7.4: Call While Already In Call
**Steps**:
1. Student and Teacher A in active call
2. Teacher B tries to call Student
3. Observe

**Expected Results**:
- ✅ Teacher B's call: Student should see "busy" or ignore
- ✅ Existing call NOT interrupted
- ✅ No modal shown to Student
- ✅ Teacher B's call times out or rejected

**Pass Criteria**:
- Active call protected
- No interruption by new incoming call

#### Test 7.5: Device Removal During Call
**Steps**:
1. Start video call
2. Physically disconnect camera (if possible) or revoke camera permission
3. Observe behavior

**Expected Results**:
- ✅ Video track ends
- ✅ Camera automatically switches off
- ✅ Audio continues working
- ✅ No crash
- ✅ User can continue call with audio only

**Pass Criteria**:
- Graceful degradation
- No "NotReadableError" crashes
- Call continues

#### Test 7.6: Page Refresh During Call
**Steps**:
1. Start call
2. Refresh page (F5) on one side
3. Observe

**Expected Results**:
- ✅ Refreshed side: Call state lost, returns to idle
- ✅ Other side: Receives "disconnected" or call ends after timeout
- ✅ No stuck call
- ✅ Both can start new call after refresh

**Pass Criteria**:
- Clean recovery
- No phantom active calls
- Server call status updated

### Category 8: Cleanup and Memory

#### Test 8.1: Resource Cleanup After Call
**Steps**:
1. Start video call
2. End call after 10 seconds
3. Open DevTools → Console → Run: `window.CommsWebRTC.__inspect()`
4. Check state

**Expected Results**:
- ✅ `pc`: null
- ✅ `localStream`: null
- ✅ `remoteStream`: null
- ✅ `currentCall`: null
- ✅ `callTimer`: null
- ✅ `iceQueue`: [] (empty)
- ✅ `role`: null

**Pass Criteria**:
- All WebRTC resources released
- No lingering timers
- Clean state

#### Test 8.2: Multiple Call Cycle
**Steps**:
1. Perform 10 consecutive calls (start, connect, end)
2. After each, check memory usage in DevTools
3. Observe for memory leaks

**Expected Results**:
- ✅ Memory usage stable (not increasing significantly)
- ✅ No accumulation of MediaStreams
- ✅ No timer leak
- ✅ Browser doesn't slow down

**Pass Criteria**:
- Memory growth < 10MB after 10 calls
- No performance degradation

#### Test 8.3: Event Listener Cleanup
**Steps**:
1. Start call
2. Check event listeners on `pc`, `localStream`, `remoteStream` tracks
3. End call
4. Re-check event listeners

**Expected Results**:
- ✅ During call: Listeners attached (ontrack, onicecandidate, etc.)
- ✅ After call: All listeners removed
- ✅ No orphaned listeners

**Pass Criteria**:
- All event handlers nulled or removed
- No listener leaks

### Category 9: Cross-Portal Compatibility

#### Test 9.1: Student → Teacher Voice Call
**Steps**:
1. Student calls Teacher (voice)
2. Complete full call flow
3. Verify timer, audio, end synchronization

**Expected Results**:
- ✅ All basic tests pass
- ✅ Timer synchronized
- ✅ Hangup synchronized

**Pass Criteria**:
- Cross-portal signaling works
- No portal-specific bugs

#### Test 9.2: Teacher → Student Video Call
**Steps**:
1. Teacher calls Student (video)
2. Complete full call flow
3. Verify video, camera toggle, end synchronization

**Expected Results**:
- ✅ Video works both directions
- ✅ Camera toggle works
- ✅ Hangup synchronized

**Pass Criteria**:
- Reverse direction works identically

#### Test 9.3: Portal Type Matching
**Steps**:
1. Verify `caller_type` and `receiver_type` in signals
2. Check `portalTypesMatch()` function handles:
   - student/kabataan/user
   - teacher/sk_official
3. Test calls with different type labels

**Expected Results**:
- ✅ Type matching works correctly
- ✅ Signals routed to correct peer
- ✅ No type mismatch errors

**Pass Criteria**:
- Type matching robust
- Cross-portal calls reliable

## Test Execution Plan

### Phase 1: Critical Bug Verification (Required)
1. Test 2.1: Caller Ends Connected Call 🔥
2. Test 2.2: Callee Ends Connected Call 🔥
3. Test 3.1: Sequential Calls - Timer Reset 🔥
4. Test 3.2: Multiple Sequential Calls 🔥
5. Test 4.1: Camera Toggle 10 times 🔥

**Stop Criteria**: If any Phase 1 test fails, do not proceed. Fix the bug first.

### Phase 2: Core Functionality (Required)
1. Test 1.1: Outgoing Voice Call
2. Test 1.2: Outgoing Video Call
3. Test 1.3: Call Rejection
4. Test 1.4: Call Timeout
5. Test 5.1: Mute Toggle

### Phase 3: Advanced Features (Recommended)
1. Test 4.2-4.5: All camera tests
2. Test 6.1-6.3: All connection tests
3. Test 7.1-7.6: All edge cases

### Phase 4: Stability (Recommended)
1. Test 8.1-8.3: All cleanup tests
2. Test 9.1-9.3: All cross-portal tests

## Browser Matrix

### Priority 1 (Must Pass)
- Chrome (latest)
- Edge (latest)

### Priority 2 (Should Pass)
- Firefox (latest)
- Safari (latest, macOS/iOS)

### Priority 3 (Nice to Have)
- Chrome Mobile (Android)
- Safari Mobile (iOS)
- Samsung Internet

## Bug Report Template

If a test fails, report using this format:

```
**Test ID**: [e.g., Test 2.1]
**Test Name**: [e.g., Caller Ends Connected Call]
**Browser**: [Chrome 120]
**OS**: [Windows 11]
**Severity**: [Critical/High/Medium/Low]

**Steps to Reproduce**:
1. [Exact steps]
2. [Exact steps]
3. [Exact steps]

**Expected**: [What should happen]
**Actual**: [What actually happened]
**Screenshots**: [Attach if applicable]
**Console Errors**: [Copy any errors]
**Network Logs**: [Copy relevant Supabase/WebRTC logs]

**Frequency**: [Always/Sometimes/Rare]
**Workaround**: [If any]
```

## Success Criteria

### Minimum Viable (Must Pass):
- ✅ All Phase 1 tests pass (critical bugs fixed)
- ✅ All Phase 2 tests pass (core functionality works)
- ✅ Tests pass on Chrome and Edge

### Production Ready (Should Pass):
- ✅ All Phase 3 tests pass (advanced features work)
- ✅ All Phase 4 tests pass (stability verified)
- ✅ Tests pass on all Priority 1 & 2 browsers

### Excellent (Nice to Have):
- ✅ All tests pass on all browsers
- ✅ Zero console warnings
- ✅ No memory leaks after 50 call cycles
- ✅ Sub-500ms hangup synchronization

## Automation Opportunities

Consider automating:
1. Sequential call timer verification (Test 3.2)
2. Camera toggle stress test (Test 4.2)
3. Memory leak detection (Test 8.2)
4. Cross-browser compatibility matrix

## Notes

- **Timing**: Allow 1-2 seconds buffer for signal propagation over network
- **Flakiness**: If a test fails once, retry 3 times before marking as failed
- **Console**: Always keep DevTools console open to catch warnings
- **Network**: Test on both LAN and real internet connections
