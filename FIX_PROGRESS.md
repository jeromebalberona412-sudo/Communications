# FIX_PROGRESS — 2026-11-09-c

## Modular Laravel architecture (2026-11-10)
Both apps now use `app/Modules/{Authentication,Dashboard,Messages}` plus `resources/views/layouts` and `resources/js/modules/messages`. Vite entry: `resources/js/modules/messages/index.js`.

## Status
- Phase 0: done
- Phase 1: done (branding → Messages). **Set `APP_NAME=Messages` in each app `.env` yourself.** I did not edit `.env`.
- Phase 2: **modular WebRTC landed** (2026-11-09-d). Vite no longer imports the old monolith. `window.CommsWebRTC` is booted from `communications/webrtc/bootstrap.js`.
- Phase 3: migration + SQL written, **not run**
- Phase 4: call-end fire-and-forget, camera sender kept after OFF, group timer starts on overlay
- Phase 5: floating window header matches screenshot (Back, Voice, Video, Close; group calls too)
- Phase 6: floating chat no Loading overlay; group members modal no Loading text
- Phase 7: static checks in this session

## Phase 0 — what the browser actually loads
Vite entry (both apps): `resources/js/communications.js` → package JS under `packages/Communications/assets/js/`. Views: `@vite(['resources/css/app.css', 'resources/js/app.js', 'resources/js/communications.js'])`.

| File | Role | Loaded? |
| --- | --- | --- |
| `packages/Communications/assets/js/webrtc.js` | 1:1 WebRTC | yes via Vite |
| `packages/Communications/assets/js/webrtc-group.js` | group mesh | yes after webrtc.js |
| `packages/Communications/assets/js/calls/config.js` | constants | imported by webrtc.js |
| `packages/Communications/assets/js/calls/logger.js` | `[CALL]` log | imported by webrtc.js |
| `public/js/**` | none for calls | no |
| Blade inline RTCPeerConnection | none | no |

Students `webrtc.js` was 3107 lines (missing later Teachers fixes). **Copied Teachers → Students** so both are identical.

Build marker: `console.info("[CALL] build 2026-11-09-c | webrtc.js loaded")` (via `callInfo`). After `npm run build` + Ctrl+F5, console must show **2026-11-09-c**.

Oversized files still >1000: `webrtc.js` ~3820, `webrtc-group.js` ~1040, `chat.js` ~3474, `realtime.js` ~1210, `communication.js` ~1159, `communication.css` ~3815, `CallService.php` ~814.

## Students vs Teachers call events (must stay identical)

| Meaning | Send | Listen aliases | Channel |
| --- | --- | --- | --- |
| hangup | `call-end` | `call-end`, `hangup` | `comms-signal-{conversationId}` |
| camera | `camera-state` | `camera-state`, `camera` | same |
| mic | `mic-state` | `mic-state`, `mic` | same |
| group host end | `group-end` | `group-end` | same |
| group leave | `group-leave` | `group-leave`, `hangup` | same |
| inbox | call rows | `comms-inbox-{type}-{id}` | |

## Root causes (file:line, Teachers = Students after copy)
1. **Call ended not instant:** `endCall` used `await signalPeer(...)` then cleaned up (`webrtc.js` ~2934). Now fire-and-forget send first.
2. **Camera ON after OFF:** `applyCameraState` set `videoSender = null` after `replaceTrack(null)` (`webrtc.js` ~1966). Sender is kept.
3. **Duration 00:00 / group missing:** `startTimer` returned if `!callConnected` (`webrtc.js` ~1679) while group never set 1:1 `callConnected`. Group only called `__startTimer` on first `ontrack`. Now group overlay also starts the timer; `startTimer` allows `__meshActive()`.
4. **Floating group calls:** voice/video buttons were `!isGroup` (`floating-chat.js` ~133). Group chats had no call buttons. `startCall('audio')` was wrong type (`voice` is required).

Group last-participant rule: a leave sends `group-leave` (tile removed). Host End sends `group-end` (everyone ends). If one person remains, they stay until they End or Leave.

## Phase 3 — DB (do not run yet)
Owner: **Teachers** (shared Supabase). Do not duplicate migrate from Students.

Findings: `calls` has conversation/caller/receiver/type/status/started_at/answered_at/ended_at/duration_seconds. Missing/optional: `end_reason` (SQL already existed), `ended_by`, `is_group`. No unique “one active call per conversation”. Stuck ringing/accepted rows possible.

Files:
- `Teachers/database/migrations/2026_11_09_000001_add_call_schema_fixes.php`
- `Teachers/database/sql/call_schema_fixes.sql` (copy in Students + repo `database/sql/`)

**After backup, order:**
1. Review and run `Teachers/database/sql/call_schema_fixes.sql` in Supabase SQL editor (preferred).
2. Optional: `cd Teachers; php artisan migrate` (same additive columns; skip if SQL already applied).
3. Optional commented UPDATE at bottom of SQL for stale ringing/accepted > 4h.

## Phase 5 — floating window
`window.openChatWindow(conversationId)` from `header-chat.js` list clicks. Header: Back → Chats list, avatar+name, presence (“Active now” only if `online` from presence map; groups show member count), Voice, Video, Close. Docked top-right (`top: 64px`). Buttons work for group via `{ conversation_type: 'group' }` hint.

## Left
- Finish splitting `webrtc.js` / `chat.js` / `communication.css` under 1000 lines.
- Login pages: if `.env` still has `APP_NAME=iLearnU …` the title still shows that until you change `.env`.
- Logo images: none grep’d as named iLearnU; if a PNG still shows the university seal, replace it yourself.
- Real two-browser / camera / phone: NOT TESTED.
