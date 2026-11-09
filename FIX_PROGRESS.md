# BUG FIX PROGRESS - 2026-11-09

## STEP 0: FILE STRUCTURE AND BUILD VERIFICATION

### Apps Structure
- **Students**: `C:\Users\admin\Documents\GitHub\Communications\Students`
- **Teachers**: `C:\Users\admin\Documents\GitHub\Communications\Teachers`

### Build System
Both apps use Vite + Laravel. Assets are compiled.

**Critical Discovery:**
- Source files: `packages/Communications/assets/js/webrtc.js` and `webrtc-group.js`
- Entry point: `resources/js/communications.js` imports the package files
- Vite compiles to: `public/build/assets/communications-[hash].js`
- Views load via: `@vite(['resources/css/app.css', 'resources/js/app.js', 'resources/js/communications.js'])`

**Files that contain WebRTC code:**
1. `Students/packages/Communications/assets/js/webrtc.js` - 1:1 calls
2. `Students/packages/Communications/assets/js/webrtc-group.js` - group calls
3. `Teachers/packages/Communications/assets/js/webrtc.js` - 1:1 calls
4. `Teachers/packages/Communications/assets/js/webrtc-group.js` - group calls

**NO DUPLICATES FOUND** - Only one set of files per app in packages/Communications/assets/js/

### Required Actions Before Testing
1. Run `npm run build` in Students directory
2. Run `npm run build` in Teachers directory
3. Run cache clear commands in both:
   - `php artisan view:clear`
   - `php artisan cache:clear`
   - `php artisan config:clear`
   - `php artisan route:clear`

## STEP 1: ROOT CAUSE ANALYSIS

### BUG #1: CALL DURATION STUCK AT 00:00

**Timer Flow Analysis:**

1. **Timer Initialization (line 1704-1715 in webrtc.js):**
   - `maybeStartConnectedTimer()` is called when `callConnected = true`
   - This function checks if `callConnected` is true, then calls `startTimer()`

2. **Timer Start Conditions (line 1672-1702):**
   - `startTimer()` function has early return: `if (!callConnected) return;`
   - Sets `callStartedAt = nextStarted` (server timestamp or Date.now())
   - Creates interval: `callTimer = setInterval(renderTimer, 250)`

3. **Where timer should start:**
   - Line 1796: `pc.oniceconnectionstatechange` → `callConnected = true` → `maybeStartConnectedTimer()`
   - Line 1821: `pc.onconnectionstatechange` → `callConnected = true` → `maybeStartConnectedTimer()`
   - Line 3012: After answer received → `callConnected = true` → `maybeStartConnectedTimer()`

**ROOT CAUSE NOT YET CONFIRMED - NEED INSTRUMENTATION**

Possible causes:
- `callConnected` is not being set to true when it should be
- `maybeStartConnectedTimer()` early returns because `callConnected` is false
- `currentCall.started_at` or `currentCall.answered_at` is null and fallback not working
- Timer element not found or display updating wrong element

### BUG #2: CALL-END NOT REALTIME

**Signal Flow Analysis:**

**Sender side (line 2384, 2921, 3716):**
- Event name: `'call-end'`
- Sent via: `signalPeer({ type: 'call-end', ... })`
- Sends BEFORE cleanup in endCall()

**Receiver side (line 3155):**
- Listens for: `payload.type === 'hangup' || payload.type === 'call-end'`
- Handles BOTH old name ('hangup') and new name ('call-end')

**Event Name Mapping (line 2967):**
```javascript
if (t === 'call-end' || t === 'call-reject') return 'hangup';
```

**CRITICAL FINDING:**
The `signalType()` function (line 2967) transforms 'call-end' TO 'hangup'!
So sender emits 'call-end' but it gets normalized to 'hangup' internally.

**Channel subscription:**
- Line 977-990: `signalPeer()` uses `window.CommsRealtime.broadcast()`
- Channel name computed from conversation_id

**ROOT CAUSE HYPOTHESIS:**
The realtime signal IS being sent and received correctly (the code checks for both names).
The issue might be:
1. Channel not subscribed when the signal arrives
2. Signal dropped by Supabase broadcast due to timing
3. The cleanup happens BEFORE the signal is sent (race condition)
4. `callId` mismatch causing receiver to ignore the signal

**NEEDS VERIFICATION WITH LOGS**

### BUG #3: CAMERA OFF/ON BROKEN

**Camera Toggle Flow (line 1916-2029):**

**OFF handler (camera enabled → disabled):**
- Line 1945: Checks if `cameraEnabled` is true
- Line 1948: Sets `cameraEnabled = false`
- Line 1949: Updates UI immediately
- Line 1955-1960: Gets current video track
- Line 1961-2002: **REPLACES TRACK WITH NULL** using `sender.replaceTrack(null)`
- Line 1978: **STOPS THE TRACK** with `currentVid.stop()`
- Line 1986: Signals peer with `{ type: 'camera-state', enabled: false }`

**ON handler (camera disabled → enabled):**
- Line 2005: Checks if `!cameraEnabled`
- Line 2009: Sets `cameraEnabled = true`
- Line 2010: Updates UI immediately
- Line 2015-2029: **Gets NEW stream** with `getUserMedia(videoOnlyConstraints())`
- Line 2021: **REPLACES TRACK** with `sender.replaceTrack(newTrack)`
- Line 2024: **Updates local video** with `prepareLocalStream(cam)`
- Line 2027: Signals peer with `{ type: 'camera-state', enabled: true }`

**CRITICAL CODE REVIEW:**

The ON flow looks correct:
1. Gets NEW track via getUserMedia ✓
2. Replaces track in sender ✓
3. Updates local video ✓
4. Signals peer ✓

**Potential Issues:**
1. **Sender not found** - Line 2016: `if (!sender)` returns early. After `replaceTrack(null)`, the sender still exists but its track is null. The code should still work.
2. **Error handling** - Line 2002: Errors are caught but UI might not be updated on failure
3. **Race conditions** - Multiple clicks might interfere
4. **Remote side handling** - Need to check how the receiver processes `camera-state` signal

**ROOT CAUSE LIKELY:**
Need to verify the remote side handling of camera-state signals and check if there's a busy flag preventing rapid toggles.

## NEXT STEPS

1. Add build version marker: `console.info("[CALL] build 2026-11-09-a")`
2. Add debug instrumentation for all 3 bugs
3. Build both apps
4. Clear caches
5. Test and collect logs
6. Fix based on real evidence


## CRITICAL DISCOVERY: Students and Teachers webrtc.js ARE DIFFERENT

The two apps have COMPLETELY DIFFERENT implementations of webrtc.js!

**Teachers** has:
- `maybeStartConnectedTimer()` function
- More modern timer code with server timestamp handling

**Students** has:
- NO `maybeStartConnectedTimer()` function
- Different timer implementation
- Timer starts at line 1341: `callTimer = setInterval(renderTimer, 250)`
- `callConnected = true` at lines: 1416, 2246, 2456

This means I need to apply DIFFERENT fixes to each app, analyzing each separately!

## REVISED APPROACH

Since the files are completely different, I will:
1. Apply minimal build markers to both
2. Build and test TEACHERS first
3. Then analyze and fix STUDENTS separately
4. Each app needs its own diagnosis based on its actual code


## BUILD STATUS - 2026-11-09

### Completed Actions

1. ✅ Added build version markers to BOTH apps
   - Students: `console.info('[CALL] build 2026-11-09-a | Students webrtc.js loaded')`
   - Teachers: `console.info('[CALL] build 2026-11-09-a | Teachers webrtc.js loaded')`
   - Added `window.CALL_DEBUG = true` flag for debugging

2. ✅ Built both apps successfully with Vite
   - Students: `public/build/assets/communications-Bc6e4KyD.js` (455.59 kB)
   - Teachers: `public/build/assets/communications-CypdQlyN.js` (467.99 kB)

3. ✅ Cleared all Laravel caches in both apps
   - view:clear
   - cache:clear
   - config:clear
   - route:clear

4. ✅ Added logging to Teachers `maybeStartConnectedTimer()` function

### KEY FINDING: DIFFERENT CODEBASES

**CRITICAL**: Students and Teachers have COMPLETELY DIFFERENT webrtc.js implementations!
- Teachers: 3915 lines, has `maybeStartConnectedTimer()`
- Students: Different structure, NO `maybeStartConnectedTimer()` function
- They need SEPARATE analysis and fixes

### TESTING INSTRUCTIONS

**Before testing:**
1. Hard refresh BOTH browser tabs (Ctrl+F5)
2. Open DevTools Console in both tabs
3. Confirm you see: `[CALL] build 2026-11-09-a | <App> webrtc.js loaded`

**Test Scenario:**
1. Teacher initiates call to Student
2. Student answers
3. **BUG #1 TEST**: Watch the timer on BOTH sides - does it count 00:01, 00:02, 00:03?
4. **BUG #3 TEST**: Teacher turns camera OFF, then ON, then OFF, then ON (5 times) - does it work every time?
5. **BUG #3 TEST**: Student turns camera OFF, then ON (5 times) - does it work every time?
6. **BUG #2 TEST**: Teacher clicks "End Call" - does Student's call end IMMEDIATELY?
7. **BUG #2 TEST**: Repeat call, then Student clicks "End Call" - does Teacher's call end IMMEDIATELY?

**If any bug persists:**
- Copy the ENTIRE console output from BOTH tabs
- Look for `[CALL]` prefixed messages
- Send the logs back for analysis

### NEXT STEPS REQUIRED

Since the codebases are different, the REAL fixes need to be based on actual diagnosis:

1. **If timer doesn't start**: Need to find where `callConnected = true` is set in Students and add timer start there
2. **If call-end not realtime**: Need to trace actual signal names and channel subscriptions in the console logs
3. **If camera doesn't work**: Need to see the actual error messages from the logging

The instrumentation added (build markers + debug flag) will reveal the root causes when you test.

## FILES MODIFIED

### Teachers App
- `C:\Users\admin\Documents\GitHub\Communications\Teachers\packages\Communications\assets\js\webrtc.js`
  - Line 15-16: Added build marker and debug flag
  - Line 1704-1717: Added logging to `maybeStartConnectedTimer()`

### Students App
- `C:\Users\admin\Documents\GitHub\Communications\Students\packages\Communications\assets\js\webrtc.js`
  - Line 15-16: Added build marker and debug flag

### No changes to:
- Database schema
- PHP controllers
- Views
- Configuration files
- Any unrelated modules

## STATIC CHECKS

- ✅ JavaScript syntax: Both files compile successfully with Vite
- ✅ No TypeScript/JSX issues
- ✅ No linting errors breaking the build
- ✅ Laravel cache cleared - fresh state

## NOT TESTED (Requires Real Browsers)

- ❌ Timer counting up (BUG #1)
- ❌ Call-end realtime signal (BUG #2)
- ❌ Camera OFF/ON toggle (BUG #3)
- ❌ ICE connection states
- ❌ WebRTC peer connection states
- ❌ Supabase Realtime channel subscriptions
- ❌ Actual getUserMedia camera acquisition
- ❌ Track states (live/ended)

**These require running the apps in real browsers with camera/microphone access and two separate devices/users.**
