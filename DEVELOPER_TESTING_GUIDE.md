# WebRTC Bug Fix - Developer Testing Guide

## Quick Start Testing

### Prerequisites
1. Two test accounts (Student and Teacher)
2. Two devices or two browser windows
3. HTTPS enabled (required for WebRTC)

### Essential Tests (5 minutes)

#### Test 1: Self-Camera Preview (Bug #1)
```
1. Student initiates video call to Teacher
2. ✅ VERIFY: Student sees own camera IMMEDIATELY
3. Teacher accepts call
4. ✅ VERIFY: Teacher sees own camera IMMEDIATELY
5. ✅ VERIFY: Both see each other's video
```

**PASS CRITERIA:** Camera preview visible within 1 second

#### Test 2: Camera Toggle (Bug #2)
```
While in active call:
1. Click camera OFF button
   ✅ VERIFY: Local video preview shows placeholder
   ✅ VERIFY: Remote user sees "camera off" indicator

2. Click camera ON button
   ✅ VERIFY: Local video preview shows camera feed
   ✅ VERIFY: Remote user sees live video

3. Repeat OFF → ON → OFF → ON 3 more times
   ✅ VERIFY: Works every time without freezing
```

**PASS CRITERIA:** Camera toggles instantly, no errors in console

#### Test 3: Timer Reset (Bug #3)
```
Call #1:
1. Start call, wait 30 seconds
2. ✅ VERIFY: Timer shows ~00:30
3. End call
4. ✅ VERIFY: End screen shows ~30 seconds duration

Call #2 (immediately after):
5. Start new call
6. ✅ VERIFY: Timer shows 00:00
7. Wait 15 seconds
8. ✅ VERIFY: Timer shows ~00:15
9. End call

Call #3:
10. Start another call
11. ✅ VERIFY: Timer shows 00:00 (not 00:15 or 00:45)
```

**PASS CRITERIA:** Every new call starts at 00:00

#### Test 4: Multiple Consecutive Calls (Bug #5)
```
WITHOUT refreshing browser:
1. Call → end
2. Call → end  
3. Call → end
4. Call → end
5. Call → end

✅ VERIFY: All 5 calls work correctly
✅ VERIFY: No memory leaks (check Chrome DevTools Memory)
✅ VERIFY: Each call starts fresh
```

**PASS CRITERIA:** 5 consecutive calls without issues

---

## Browser Console Checks

### Expected: Clean Console
```javascript
// No errors like:
❌ "Cannot read property 'getTracks' of null"
❌ "video.play() failed"  
❌ "MediaStreamTrack ended"
❌ "RTCPeerConnection is closed"
```

### Chrome DevTools → Network
```
✅ STUN requests to stun.l.google.com
✅ Supabase realtime websocket connected
❌ No repeated getUserMedia calls (should be 1 per call)
```

---

## Device-Specific Testing

### Desktop Chrome
- [ ] Camera preview works
- [ ] Camera toggle works
- [ ] Timer resets
- [ ] Audio + Video synchronized

### Desktop Firefox
- [ ] Same as Chrome tests
- [ ] Check for Firefox-specific permission UI

### Mobile Chrome (Android)
- [ ] Camera preview immediate
- [ ] Portrait/landscape works
- [ ] Background → foreground works
- [ ] Lock → unlock maintains call

### Mobile Safari (iOS)
- [ ] Camera preview works (autoplay policy)
- [ ] playsInline prevents fullscreen
- [ ] Background → foreground works
- [ ] Picture-in-picture if supported

---

## Common Issues & Solutions

### Issue: Camera preview black screen
**Check:**
- Browser permissions granted?
- HTTPS enabled?
- Camera not used by another app?
- Check console for getUserMedia errors

### Issue: Timer continues from previous call
**This should be FIXED now**
- If still occurs, check browser cache cleared
- Verify you're testing the updated files

### Issue: Camera won't turn back on
**This should be FIXED now**
- If still occurs, check console for track.stop() errors
- Verify camera permissions not revoked

### Issue: Remote video not appearing
**Check:**
- Network connectivity (ICE connection state)
- Firewall/NAT not blocking STUN
- Both users on same call_id
- Console for WebRTC errors

---

## Performance Benchmarks

### Expected Performance
| Metric | Target | Acceptable |
|--------|--------|-----------|
| Camera preview appears | < 1s | < 2s |
| Remote video appears | < 3s | < 5s |
| Camera toggle response | < 500ms | < 1s |
| Timer accuracy | ±1s | ±2s |
| Call setup time | < 3s | < 5s |

### Memory Usage
- Initial: ~50-100 MB
- During call: ~150-250 MB
- After 5 calls: Should not exceed +50 MB from initial

---

## Automated Test Script

Copy to browser console during call:

```javascript
// Camera Toggle Test
async function testCameraToggle() {
    console.log('Starting camera toggle test...');
    for (let i = 0; i < 5; i++) {
        await window.CommsWebRTC.toggleCamera();
        await new Promise(r => setTimeout(r, 1000));
        console.log(`Toggle ${i + 1}/5: Camera ${window.CommsWebRTC.isCameraEnabled() ? 'ON' : 'OFF'}`);
    }
    console.log('✅ Camera toggle test complete');
}

// Run test
testCameraToggle();
```

---

## Regression Testing Checklist

Ensure these still work after fixes:

- [ ] Voice-only calls (camera off by default)
- [ ] Microphone mute/unmute
- [ ] Call rejection
- [ ] Call cancellation
- [ ] Missed call handling
- [ ] Group calls (if implemented)
- [ ] Call history display
- [ ] Incoming call notification
- [ ] Ringtone playback
- [ ] Call ended screen
- [ ] Redial functionality

---

## Edge Cases to Test

### Network Interruption
1. Start call
2. Disable WiFi for 5 seconds
3. Re-enable WiFi
4. ✅ VERIFY: Call reconnects or fails gracefully

### Device Change
1. Start call with camera A
2. Unplug camera A
3. Toggle camera off → on
4. ✅ VERIFY: Prompts for new camera or shows error

### Rapid Actions
1. Start call
2. Immediately click camera OFF
3. Immediately click camera ON
4. Immediately click camera OFF
5. ✅ VERIFY: No race conditions, final state correct

### Permission Denied
1. Block camera/microphone in browser settings
2. Attempt video call
3. ✅ VERIFY: Clear error message
4. ✅ VERIFY: Instructions to enable permissions

---

## Sign-Off Checklist

Before marking as DONE:

- [ ] All 4 essential tests pass
- [ ] Tested on at least 2 browsers
- [ ] No console errors during normal use
- [ ] 5 consecutive calls work
- [ ] Both Students ↔ Teachers directions work
- [ ] Mobile tested (if available)
- [ ] Edge cases handled gracefully
- [ ] Performance within acceptable range

---

## Reporting Issues

If you find a bug:

1. **Describe** the exact steps to reproduce
2. **Include** browser version and OS
3. **Attach** console error screenshot
4. **Note** which specific fix (Bug #1, #2, #3) is affected
5. **Check** if it's a regression or new issue

---

## Contact

For questions about these fixes:
- See: `WEBRTC_BUG_FIXES_REPORT.md` (technical details)
- See: `BUG_FIX_SUMMARY.txt` (executive summary)

---

**Last Updated:** 2026-11-09
**Version:** 1.0
**Status:** Ready for Testing
