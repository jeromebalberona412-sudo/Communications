# FIX_PROGRESS — chat + WebRTC (Students + Teachers)

Branch: `fix/chat-webrtc`  
Date: 2026-11-09

## Phase 1 — Audit (complete)

See earlier notes. Root causes: camera OFF only muted tracks; remote UI trusted live tracks not `camera-state`; hangup raced channel teardown; no mic signaling; no call-busy; voice still negotiated video; inbox `ensureForUser()` on every load; Teachers/Students tabs had no call actions.

## Phase 2 — WebRTC call core (complete)

Files:
- `Students/packages/Communications/assets/js/webrtc.js`
- `Teachers/packages/Communications/assets/js/webrtc.js` (same logic)
- `Students/packages/Communications/assets/js/webrtc-group.js`
- `Teachers/packages/Communications/assets/js/webrtc-group.js`

Done:
- Video sender kept for the call; camera OFF stops the track and `replaceTrack(null)` (turns camera light off).
- Camera ON acquires a new track and `replaceTrack(newTrack)` (never reuses a stopped track).
- Signaling aliases: `call-invite`, `call-accept`, `call-end`, `camera-state`, `mic-state`, `ice-candidate`, `call-busy`.
- Stale `callId` events ignored. ICE queued until remote description.
- Initial camera/mic state sent when ICE connects / answer completes.
- Voice offers do not request `offerToReceiveVideo` unless it is a video call.

## Phase 3 — Call UI / hangup (complete)

Files:
- `Students|Teachers/packages/Communications/views/partials/in-call-ui.blade.php`
- `Students|Teachers/packages/Communications/assets/css/communication.css`

Done:
- Local preview stays local (muted). Remote comes from `ontrack`. Local CSS mirror only; camera-off overlay is not mirrored.
- Camera Off placeholder: avatar, name, `Camera Off`. Remote video hidden while remote camera is off.
- Mic OFF/ON sends `mic-state`; remote shows Muted badge.
- Hangup awaits `call-end` before tearing down the channel. Tab close also sends `call-end` + keepalive status POST.
- ICE `disconnected` ends the call after 4s grace. Busy caller gets `call-busy`.
- Idempotent `cleanupMediaOnly`.

## Phase 4 — Messages, View Members, caching (complete)

Files:
- `Students|Teachers/packages/Communications/assets/js/chat.js`
- `Students|Teachers/packages/Communications/Services/ConversationService.php`
- `Students|Teachers/packages/Communications/Services/MessageService.php`
- `Students|Teachers/packages/Communications/Controllers/ConversationController.php`
- `Students/packages/Communications/Controllers/TeachersListController.php`
- `Teachers/packages/Communications/Controllers/StudentsListController.php`

Done:
- Optimistic send already existed; added Failed + Retry. `loadConversation` alias (was missing and broke Message from member lists).
- View Members paints cached members first, then refreshes.
- Teachers tab (Students app) and Students tab (Teachers app): Message / Voice Call / Video Call. Presence dot only from live `__COMMS_PRESENCE_ONLINE_IDS__`.
- sessionStorage member cache namespaced by auth user id.
- Laravel cache: inbox 8s (invalidated on send), member lists 20s, skip `ensureForUser` for 60s.

## Phase 5 — Verification

### Tests actually run
- `php -l` on changed PHP controllers/services: no syntax errors.
- `node --check` on `webrtc.js`, `webrtc-group.js`, `chat.js` (both apps): no syntax errors.
- No migrations were run.
- Two-browser camera/mic tests: **NOT TESTED**.

### SQL for you to run (optional)
`comms_performance_indexes.sql` (also copied to `Students/database/sql/` and `Teachers/database/sql/`).

Safe `CREATE INDEX IF NOT EXISTS` only. I did not execute it.

### After pull: rebuild frontend
JS is imported via Vite (`resources/js/communications.js`). Run each app’s usual asset build (`npm run build` or `npm run dev`) or the changes will not appear in the browser.

### Manual checklist still needed
Teacher ↔ Student video both ways; camera OFF/ON 3×; local/remote not swapped; mic sync; voice without camera permission; hangup both ways; timer 00:00 on next call; refresh during call; Messages / View Members speed; member actions.
