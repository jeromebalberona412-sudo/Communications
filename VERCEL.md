# Deploy Students & Teachers on Vercel (Laravel + Vite)

## Why you saw `404: NOT_FOUND`

The old `vercel.json` set `outputDirectory: public/build`. Vercel then served **only** compiled JS/CSS — no PHP, no Laravel routes, no `/login`. Opening `https://….vercel.app/` returned platform 404 even when status was **Ready**.

Laravel already redirects `/` → `/login` in `routes/web.php`. PHP must run for that to work.

## Correct setup (two Vercel projects)

| Setting | Students project | Teachers project |
|---------|------------------|------------------|
| Root Directory | `Students` | `Teachers` |
| Framework Preset | Other | Other |
| Install / Build | from each app’s `vercel.json` | same |

Do **not** set Output Directory in the Vercel UI (leave empty). Routing is handled by `vercel.json`.

## Required Environment Variables (Vercel → Settings → Environment Variables)

Set for **Production** (and Preview if needed). Never commit secrets.

```
APP_NAME=iLearnU Students
APP_ENV=production
APP_KEY=base64:...          # php artisan key:generate --show
APP_DEBUG=false
APP_URL=https://YOUR-students-project.vercel.app

SESSION_DRIVER=cookie
SESSION_SECURE_COOKIE=true
SESSION_COOKIE=students_session
XSRF_COOKIE=students-xsrf
CACHE_STORE=array
LOG_CHANNEL=stderr
QUEUE_CONNECTION=sync

DB_CONNECTION=pgsql
DB_HOST=...
DB_PORT=5432
DB_DATABASE=...
DB_USERNAME=...
DB_PASSWORD=...
DB_SSLMODE=require

VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
COMMS_PORTAL_USER_TYPE=students
```

Teachers: same pattern with `teachers_session`, `COMMS_PORTAL_USER_TYPE=teachers`, and that project’s `APP_URL`.

## After pushing

1. Commit `api/index.php`, updated `vercel.json`, and `AppServiceProvider` changes.
2. Redeploy **without** build cache.
3. Open the deployment URL — you should get redirected to `/login` and see the login page.

## Limits on Vercel

- Writable disk is `/tmp` only (configured automatically).
- No long-running queues/websockets on the PHP function.
- WebRTC / Supabase Realtime still use cloud endpoints from the browser.
- Prefer a VPS/Forge for heavy file uploads or persistent local storage.
