# Call JS load order (Students and Teachers, identical)

Vite entry: `resources/js/communications.js`

1. `communication.js` — HTTP helpers, toasts
2. `realtime.js` — Supabase channels `comms-signal-{conversationId}`, `comms-inbox-{type}-{id}`
3. `calls/config.js` — constants + event names (imported by webrtc.js)
4. `calls/logger.js` — `[CALL]` debug helpers
5. `media-constraints.js` — getUserMedia helpers
6. `webrtc.js` — 1:1 WebRTC (`window.CommsWebRTC`)
7. `webrtc-group.js` — group mesh (wraps `startCall` / `handleSignal` / `endCall`)
8. `chat.js` — Messages page
9. `header-chat.js` — header inbox
10. `floating-chat.js` — `window.openChatWindow(conversationId)`

Do not add a second WebRTC stack. Shared event names (do not rename):

| Signal | Send | Listen (aliases) |
| --- | --- | --- |
| hangup | `call-end` | `call-end`, `hangup` |
| camera | `camera-state` | `camera-state`, `camera` |
| mic | `mic-state` | `mic-state`, `mic` |
| group host end | `group-end` | `group-end` |
| group leave | `group-leave` | `group-leave`, `hangup` |
