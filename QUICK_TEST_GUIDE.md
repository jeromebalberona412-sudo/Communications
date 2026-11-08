# Quick Testing Guide

## 🚀 How to Test Everything

### Setup
1. Open two browsers (or one normal + one incognito)
2. Browser 1: Login as **Student** account
3. Browser 2: Login as **Teacher** account

---

## Test 1: Students Portal - Teachers List

**Browser 1 (Student):**
1. Click on **Messages** in the navigation
2. Look at the sidebar - you should see **two tabs**: "Conversations" and "Teachers"
3. Click the **"Teachers"** tab
4. ✅ **Expected:** List of teachers appears with names, positions, and barangays
5. Type a teacher name in the search box
6. ✅ **Expected:** List filters as you type
7. Click on any teacher name
8. ✅ **Expected:** Conversation opens with that teacher
9. Type a message and send
10. ✅ **Expected:** Message appears in conversation

**Browser 2 (Teacher):**
1. Open Messages
2. ✅ **Expected:** You receive the message from the student
3. Reply to the message
4. ✅ **Expected:** Student sees your reply instantly

---

## Test 2: Teachers Portal - Students List (Already Working)

**Browser 2 (Teacher):**
1. In Messages, click the **"Students"** tab
2. ✅ **Expected:** List of students appears
3. Search for a student name
4. ✅ **Expected:** List filters correctly
5. Click a student
6. ✅ **Expected:** Opens conversation with that student

---

## Test 3: View Members - Message Button

**Browser 1 (Student):**
1. Open any **group conversation** (SK Officials, SK Federations, or any group)
2. Click the **three-dot menu** (⋮) in top right
3. Click **"View Members"**
4. ✅ **Expected:** Modal opens showing all members
5. Look at each member entry
6. ✅ **Expected:** Each member (except yourself) has two buttons: **"Message"** (blue) and **"Call"** (green)
7. Click the **"Message"** button on any member
8. ✅ **Expected:** Modal closes and 1-on-1 conversation opens with that member
9. Send a test message
10. ✅ **Expected:** Message sends successfully

**Browser 2 (Teacher):**
1. If the member you messaged is a teacher, they should receive the message

---

## Test 4: View Members - Call Button

**Browser 1 (Student):**
1. Open any group conversation
2. Click three-dot menu → "View Members"
3. Click the **"Call"** button on a teacher member
4. ✅ **Expected:** Modal closes and video call screen appears

**Browser 2 (Teacher):**
1. ✅ **Expected:** Incoming call notification appears
2. Click "Answer"
3. ✅ **Expected:** Video call connects
4. Toggle camera ON/OFF
5. ✅ **Expected:** Both sides see camera state change correctly
6. Click "Hang Up"
7. ✅ **Expected:** Both sides disconnect cleanly

---

## Test 5: Reverse Direction (Teacher → Student)

**Browser 2 (Teacher):**
1. Open any group conversation
2. Click View Members
3. Click "Message" on a student member
4. ✅ **Expected:** Opens 1-on-1 conversation
5. Send message
6. ✅ **Expected:** Student receives it

**Browser 1 (Student):**
1. ✅ **Expected:** Receives message from teacher

---

## Test 6: Call from Teachers List

**Browser 1 (Student):**
1. Click "Teachers" tab
2. Find a teacher
3. If there's a **Call button** visible (optional feature), click it
4. ✅ **Expected:** Initiates video call

**Browser 2 (Teacher):**
1. ✅ **Expected:** Receives incoming call
2. Answer and verify video/audio works

---

## ✅ Success Checklist

Mark each as you test:

### Students Portal
- [ ] Teachers tab appears in sidebar
- [ ] Teachers list loads with names/positions
- [ ] Search filters teachers correctly
- [ ] Clicking teacher opens conversation
- [ ] Messages send and receive properly

### View Members (Both Portals)
- [ ] View Members modal opens
- [ ] Message and Call buttons appear for each member
- [ ] Message button opens 1-on-1 conversation
- [ ] Call button initiates video call
- [ ] Modal closes after clicking button

### WebRTC Calls
- [ ] Video calls connect successfully
- [ ] Camera ON/OFF works correctly
- [ ] Both sides see camera state changes
- [ ] Hangup disconnects both sides
- [ ] Timer starts at 00:00
- [ ] No frozen video frames

### Cross-Portal
- [ ] Teacher can message Student
- [ ] Student can message Teacher
- [ ] Teacher can call Student
- [ ] Student can call Teacher
- [ ] All messages appear instantly
- [ ] No JavaScript errors in console

---

## 🐛 What to Check in Browser Console

Open browser console (F12) and check:

1. **No red errors** when loading page
2. **No errors** when clicking Teachers tab
3. **No errors** when opening View Members
4. **No errors** when clicking Message/Call buttons
5. **Network tab** shows successful API calls (200 OK)

### Expected Console Messages (OK)
- ✅ "Route loaded" or similar info messages
- ✅ WebRTC connection messages
- ✅ Supabase realtime messages

### Unexpected Console Messages (BAD)
- ❌ "404 Not Found" errors
- ❌ "Cannot read property..." errors
- ❌ "Undefined function..." errors
- ❌ CORS errors
- ❌ Permission denied errors

---

## 🔧 Quick Fixes

### If Teachers List Doesn't Load
```bash
cd C:\Users\admin\Documents\GitHub\Communications\Students
php artisan route:clear
php artisan route:cache
```
Then **refresh browser with Ctrl+F5**

### If View Members Buttons Don't Appear
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+F5)
3. Check console for CSS loading errors

### If Calls Don't Connect
1. Check browser has camera/microphone permissions
2. Close and reopen both browsers
3. Try different browsers
4. Check network connection

---

## 📱 Mobile Testing (Optional)

If you have mobile devices:

1. Open Students portal on phone
2. Click Teachers tab
3. ✅ Should be responsive and work on small screen
4. Try View Members on mobile
5. ✅ Buttons should be properly sized

---

## 🎯 Priority Tests

**If short on time, test these first:**

1. **HIGH:** Students portal Teachers tab loads and shows list
2. **HIGH:** View Members shows Message and Call buttons
3. **HIGH:** Message button opens conversation
4. **HIGH:** Call button starts video call
5. **MEDIUM:** Search filters work correctly
6. **MEDIUM:** Camera ON/OFF synchronizes
7. **LOW:** Mobile responsive design

---

## 📊 Expected Results

After testing, you should have:

✅ **0 JavaScript errors** in console  
✅ **All API calls return 200 OK**  
✅ **Teachers list displays correctly**  
✅ **View Members has action buttons**  
✅ **Message button opens conversations**  
✅ **Call button starts video calls**  
✅ **Everything works bidirectionally**

---

## 🎉 When Testing is Complete

If all tests pass:
1. Close test browsers
2. Deploy to production
3. Monitor for any user-reported issues
4. Celebrate! 🎊

If any tests fail:
1. Note which test failed
2. Check browser console for errors
3. Check server logs for API errors
4. Report specific error messages for debugging

---

**Happy Testing!** 🚀

This should take approximately **15-20 minutes** to test everything thoroughly.
