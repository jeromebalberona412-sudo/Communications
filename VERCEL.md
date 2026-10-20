# Vercel build (Students & Teachers)

## Why the old build failed

`resources/js/communications.js` imported `../../../Communications/...`.
On Vercel with **Root Directory = Students** (or Teachers), that sibling folder was missing — and the shared `Communications/` package was not in git.

## Fix

1. Shared package is mirrored into each app:
   - `Students/packages/Communications`
   - `Teachers/packages/Communications`
2. Vite resolves `@comms` → `packages/Communications/assets`
3. Composer autoloads `App\Modules\Communications\` from `packages/Communications/`
4. `npm run build` runs `prebuild` → `scripts/ensure-comms.mjs`

## Before every push (after editing root `Communications/`)

```powershell
cd C:\Users\admin\Documents\GitHub\Communications
node scripts\sync-comms-package.mjs
cd Students; npm run build
cd ..\Teachers; npm run build
```

Commit **both** `packages/Communications` folders (required for Vercel).

## Vercel project settings

Create **two** projects from the same monorepo:

| Setting | Students | Teachers |
|---------|----------|----------|
| Root Directory | `Students` | `Teachers` |
| Install Command | `npm install` | `npm install` |
| Build Command | `npm run build` | `npm run build` |
| Output Directory | `public/build` | `public/build` |

`vercel.json` in each app already sets install/build/output.

> Note: `npm run build` only builds frontend assets. Full Laravel PHP hosting on Vercel needs a separate PHP runtime / different host (e.g. Forge, Railway, Cloudways). This fix unblocks the Vite step that was failing.
