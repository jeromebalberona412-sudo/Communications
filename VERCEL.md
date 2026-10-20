# Vercel — Students & Teachers (Vite assets only)

This builds **frontend assets** (`public/build`). It does **not** deploy the Laravel/PHP backend.

## Root cause of past failures

1. `resources/js/communications.js` imported `../../../Communications/...` (sibling outside the app).
2. With **Root Directory = Students**, Vercel only has `/vercel/path0/resources/...` — that sibling path does not exist.
3. A root `.gitignore` rule `Communications/` also ignored `Students/packages/Communications/` until fixed to `/Communications/`.

## Correct imports (inside each app)

```javascript
import '../../packages/Communications/assets/js/communication.js';
```

From `resources/js` → `packages/Communications/assets/js`.

## Vercel project settings

| Setting | Students | Teachers |
|---------|----------|----------|
| Root Directory | `Students` | `Teachers` |
| Install Command | `npm install` | `npm install` |
| Build Command | `npm run build` | `npm run build` |
| Output Directory | `public/build` | `public/build` |
| Production Branch | `main` (latest) | `main` (latest) |

Redeploy **without** build cache after changing imports.

## Before deploy

```powershell
cd C:\Users\admin\Documents\GitHub\Communications
node scripts\sync-comms-package.mjs
cd Students; npm run build
cd ..\Teachers; npm run build
```

Commit `Students/packages/Communications` and `Teachers/packages/Communications` (must be in git).

## npm warnings

- `cache-dir` — usually injected by the host (Cursor/Vercel tooling), not this repo. Safe to ignore if no project `.npmrc` sets it.
- `esbuild` install scripts — both apps set `"allowScripts": { "esbuild": true }`.
