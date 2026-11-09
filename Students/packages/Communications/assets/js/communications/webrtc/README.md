# Modular WebRTC (Students + Teachers)

Vite loads `communications/communications.js` → `webrtc/bootstrap.js`.

1. Core/media/lifecycle/ui/realtime/control modules register functions on `api`.
2. `bootOneToOne()` exposes `window.CommsWebRTC` (same methods chat/floating-chat already call).
3. `installGroupCalls()` wraps that API with the existing mesh (`group-invite`, `group-end`, `group-leave`).

Event names are unchanged: `call-end`/`hangup`, `camera-state`, `mic-state`, `comms-signal-{id}`.

`webrtc.js` and `webrtc-group.js` in `assets/js/` are deprecated shims and are **not** imported by Vite.
