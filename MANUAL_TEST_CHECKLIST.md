# Manual Testing Checklist - WebRTC Video/Audio Calls

**Date:** November 9, 2026  
**Purpose:** Verify WebRTC fixes work in real environment  
**Requirements:** 2 browsers with camera/microphone permissions

---

## Setup Instructions

### Browser A (Teacher Account)
1. Open Chrome/Edge/Firefox
2. Navigate to Teachers portal
3. Login as a Teacher
4. Grant camera and microphone permissions when prompted

### Browser B (Student Account)  
1. Open another browser (or incognito window)
2. Navigate to Students portal
3. Login as a Student
4. Grant camera and microphone permissions when prompted

**Important:** Position browsers side-by-side to see both screens simultaneously

---

## Test 1: Teacher Calls Student (Video Call)

### Step 1.1: Initiate Call
- [ ] **Browser A (Teacher):** Start video call to a Student
- [ ] **Browser B (Student):** Incoming call notification appears
- [ ] **Browser B:** Answer button and Decline button visible
- [ ] **Browser A:** "Calling..." status shows

### Step 1.2: Answer Call
- [ ] **Browser B (Student):** Click "Answer"
- [ ] **Browser A:** Call connects (status changes to "Connected")
- [ ] **Browser B:** Call connects

### Step 1.3: Video Display
- [ ] **Browser A (Teacher):** 
  - Local preview shows YOUR camera in small pip
  - Remote video shows STUDENT's camera in main view
  - Local preview is mirrored (correct)
  - Remote video is NOT mirrored (correct)

- [ ] **Browser B (Student):**
  - Local preview shows YOUR camera in small pip
  - Remote video shows TEACHER's camera in main view
  - Local preview is mirrored (correct)
  - Remote video is NOT mirrored (correct)

### Step 1.4: **CRITICAL: Audio Test**
- [ ] **Browser A:** Speak into microphone
- [ ] **Browser B:** Can HEAR Teacher speaking (**This was broken before**)
- [ ] **Browser B:** Speak into microphone  
- [ ] **Browser A:** Can HEAR Student speaking (**This was broken before**)

✅ **If you can hear each other, the critical audio fix works!**

### Step 1.5: Camera Toggle - Teacher Side
- [ ] **Browser A (Teacher):** Click "Camera Off" button
- [ ] **Browser A:** Local preview shows placeholder with YOUR initials
- [ ] **Browser A:** "Camera off" label visible
- [ ] **Browser B (Student):** Teacher's video changes to placeholder
- [ ] **Browser B:** Shows Teacher's profile picture or initials
- [ ] **Browser B:** "Camera off" label visible
- [ ] **Browser B:** NO frozen video frame (should be clean placeholder)

- [ ] **Browser A (Teacher):** Click "Camera On" button
- [ ] **Browser A:** Local preview shows YOUR camera again
- [ ] **Browser A:** Placeholder disappears
- [ ] **Browser B (Student):** Teacher's video returns
- [ ] **Browser B:** Placeholder disappears
- [ ] **Browser B:** Video is live (not frozen)

**Repeat 3 times in a row:**
- [ ] Camera OFF → Placeholder shows
- [ ] Camera ON → Video returns
- [ ] Camera OFF → Placeholder shows  
- [ ] Camera ON → Video returns
- [ ] Camera OFF → Placeholder shows
- [ ] Camera ON → Video returns

### Step 1.6: Camera Toggle - Student Side
- [ ] **Browser B (Student):** Click "Camera Off" button
- [ ] **Browser B:** Local preview shows placeholder with YOUR initials
- [ ] **Browser A (Teacher):** Student's video changes to placeholder
- [ ] **Browser A:** Shows Student's profile picture or initials
- [ ] **Browser A:** "Camera off" label visible

- [ ] **Browser B (Student):** Click "Camera On" button
- [ ] **Browser B:** Local preview shows YOUR camera again
- [ ] **Browser A (Teacher):** Student's video returns

**Repeat 3 times in a row:**
- [ ] Camera OFF → Placeholder shows
- [ ] Camera ON → Video returns
- [ ] (Repeat pattern)

### Step 1.7: Microphone Toggle
- [ ] **Browser A (Teacher):** Click "Mute" button
- [ ] **Browser A:** Button changes to show muted state
- [ ] **Browser B (Student):** Muted indicator appears
- [ ] **Browser A:** Speak - Student should NOT hear you
- [ ] **Browser A:** Click "Unmute" button
- [ ] **Browser B:** Muted indicator disappears
- [ ] **Browser A:** Speak - Student CAN hear you again

- [ ] **Browser B (Student):** Click "Mute" button
- [ ] **Browser A (Teacher):** Muted indicator appears
- [ ] **Browser B:** Click "Unmute"
- [ ] **Browser A:** Muted indicator disappears

### Step 1.8: Call Timer
- [ ] **Both browsers:** Timer starts at `00:00`
- [ ] **Both browsers:** Timer increments (00:01, 00:02, etc.)
- [ ] **Both browsers:** Timer shows same approximate time

### Step 1.9: End Call from Teacher
- [ ] **Browser A (Teacher):** Click "End Call" button
- [ ] **Browser A:** Call ends, returns to chat
- [ ] **Browser B (Student):** Call ends automatically
- [ ] **Browser B:** "Call ended" message or returns to chat
- [ ] **Both browsers:** Timer stops

---

## Test 2: Student Calls Teacher (Video Call)

### Step 2.1: Initiate Call
- [ ] **Browser B (Student):** Start video call to the Teacher
- [ ] **Browser A (Teacher):** Incoming call notification appears
- [ ] **Browser A:** Answer and Decline buttons visible

### Step 2.2: Answer and Verify
- [ ] **Browser A (Teacher):** Click "Answer"
- [ ] **Both browsers:** Call connects
- [ ] **Both browsers:** Video displays correctly (local + remote)
- [ ] **Both browsers:** Can hear each other (**Critical test**)

### Step 2.3: Camera Toggle from Both Sides
- [ ] **Browser B (Student):** Turn camera OFF
- [ ] **Browser A (Teacher):** Sees Student's placeholder
- [ ] **Browser B:** Turn camera ON
- [ ] **Browser A:** Sees Student's video

- [ ] **Browser A (Teacher):** Turn camera OFF
- [ ] **Browser B (Student):** Sees Teacher's placeholder
- [ ] **Browser A:** Turn camera ON
- [ ] **Browser B:** Sees Teacher's video

### Step 2.4: End Call from Student
- [ ] **Browser B (Student):** Click "End Call"
- [ ] **Browser B:** Call ends
- [ ] **Browser A (Teacher):** Call ends automatically
- [ ] **Both browsers:** Clean disconnection

---

## Test 3: Audio-Only Call

### Step 3.1: Voice Call
- [ ] **Browser A (Teacher):** Start AUDIO call (not video)
- [ ] **Browser B (Student):** Receive audio call notification
- [ ] **Browser B:** Answer
- [ ] **Both browsers:** No camera permission requested
- [ ] **Both browsers:** No video elements visible
- [ ] **Both browsers:** Show avatars/profile pictures
- [ ] **Both browsers:** Audio works in both directions

### Step 3.2: Microphone Control
- [ ] Mute/unmute works in audio call
- [ ] No camera button visible (audio-only)

### Step 3.3: End Audio Call
- [ ] Either side can end
- [ ] Both sides disconnect cleanly

---

## Test 4: Multiple Consecutive Calls

### Step 4.1: First Call
- [ ] Teacher calls Student
- [ ] Accept, verify audio/video
- [ ] End call

### Step 4.2: Second Call (Immediate)
- [ ] Student calls Teacher (start immediately after first call ends)
- [ ] **Timer starts at `00:00`** (NOT from where previous call ended)
- [ ] Accept, verify audio/video
- [ ] End call

### Step 4.3: Third Call
- [ ] Teacher calls Student again
- [ ] Timer starts at `00:00`
- [ ] No duplicate event listeners (test by toggling camera - should work smoothly)
- [ ] End call

### Step 4.4: Fourth Call
- [ ] Student calls Teacher
- [ ] Timer starts at `00:00`
- [ ] Everything still works smoothly
- [ ] End call

### Step 4.5: Fifth Call
- [ ] Teacher calls Student
- [ ] **Verify:** No accumulated lag, no frozen states, no duplicate connections
- [ ] Camera toggle still instant
- [ ] Audio still works
- [ ] End call

**Result:** If all 5 calls work without issues, cleanup logic is working correctly

---

## Test 5: Edge Cases

### Step 5.1: Refresh During Call
- [ ] Start video call between Teacher and Student
- [ ] **Browser A:** Refresh the page (F5 or Ctrl+R)
- [ ] **Browser B:** Should receive "call ended" or disconnect
- [ ] **Browser B:** Returns to chat cleanly
- [ ] **Browser A:** After refresh, can start new call

### Step 5.2: Close Tab During Call
- [ ] Start call
- [ ] Close one browser tab
- [ ] Other side should detect disconnection
- [ ] Other side should clean up and return to chat

### Step 5.3: Network Interruption (Optional)
- [ ] Start call
- [ ] Disable network on one device briefly
- [ ] Re-enable network
- [ ] Verify call behavior (may disconnect or reconnect)

---

## Test 6: Messaging During Call

### Step 6.1: Send Messages While on Call
- [ ] Start video call
- [ ] **Browser A:** Send a text message in the chat
- [ ] **Browser B:** Message appears in realtime (while call active)
- [ ] **Browser B:** Send reply message
- [ ] **Browser A:** Reply appears
- [ ] Messages don't break the call

---

## Test 7: View Members Integration

### Step 7.1: Teachers Portal - View Members
- [ ] **Browser A (Teacher):** Open Messages
- [ ] Click "Students" tab
- [ ] List of students appears quickly
- [ ] Each student has Message and Call buttons
- [ ] Click "Call" button on a student
- [ ] Video call initiates correctly

### Step 7.2: Students Portal - View Members  
- [ ] **Browser B (Student):** Open Messages
- [ ] Click "Teachers" tab
- [ ] List of teachers appears quickly
- [ ] Each teacher has Message and Call buttons
- [ ] Click "Call" button on a teacher
- [ ] Video call initiates correctly

---

## Success Criteria

### ✅ PASS if:
- [ ] Audio works in BOTH directions (hear each other)
- [ ] Video works in BOTH directions (see each other)
- [ ] Local preview is YOUR camera (mirrored)
- [ ] Remote video is OTHER person's camera (not mirrored)
- [ ] Camera OFF shows placeholder (not frozen frame)
- [ ] Camera ON restores video immediately
- [ ] Microphone toggle works on both sides
- [ ] Timer resets to 00:00 for each new call
- [ ] Either side can end call (both disconnect)
- [ ] 5 consecutive calls work without issues
- [ ] No JavaScript errors in console

### ❌ FAIL if:
- Cannot hear each other (audio broken)
- Videos are swapped or reversed
- Camera OFF leaves frozen frame
- Camera ON doesn't restore video
- Timer doesn't reset between calls
- One side can't end the call
- Multiple calls cause lag or errors

---

## Browser Console Check

Open Developer Tools (F12) in both browsers:

### During Setup
- [ ] No red errors when page loads
- [ ] No errors when granting camera/mic permissions

### During Call
- [ ] No errors when call connects
- [ ] No errors when toggling camera
- [ ] No errors when toggling microphone
- [ ] No errors when ending call

### After Multiple Calls
- [ ] No accumulating errors
- [ ] No memory warnings
- [ ] No "too many listeners" warnings

---

## Report Results

After testing, document:

1. **What Worked:**
   - List all tests that passed

2. **What Failed:**
   - List any tests that failed
   - Describe the failure
   - Note any error messages

3. **Audio Status:**
   - ✅ Can hear each other in video calls
   - ❌ Still cannot hear (if broken)

4. **Camera Toggle:**
   - ✅ Works on both sides
   - ❌ Issues found (describe)

5. **Overall:**
   - ✅ Ready for production
   - ⚠️ Minor issues (list them)
   - ❌ Major issues (list them)

---

**Testing Time Estimate:** 30-45 minutes for complete testing

**Priority Tests (if short on time):**
1. Audio works (CRITICAL)
2. Camera toggle works
3. Call hangup works
4. Timer resets between calls
