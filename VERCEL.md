# Vercel deployment (Students / Teachers)

## Root cause of `404: NOT_FOUND`

Your project **`communications`** deploys from the **repository root**.

- `Students/vercel.json` is **ignored** unless Root Directory = `Students`
- With no root config, Vercel had nothing to serve → platform `NOT_FOUND`
- Old `outputDirectory: public/build` also caused 404 (static assets only, no PHP)

Laravel already does `Route::get('/', fn () => redirect()->route('students.login'))`. PHP must run for `/` → `/login`.

## Fix applied

Root [`vercel.json`](./vercel.json) builds **Students** and routes all requests to `Students/api/index.php` (vercel-php).

## Project settings (communications)

| Setting | Value |
|---------|--------|
| Root Directory | **`.`** (empty / repository root) — keep this if using root `vercel.json` |
| Output Directory | **leave empty** |
| Framework | Other |

**OR** set Root Directory to `Students` and rely on `Students/vercel.json` (then root `vercel.json` is unused).

Do not set Output Directory to `public/build`.

## Teachers (separate Vercel project)

Create a second project with:

- Root Directory = `Teachers`
- Uses `Teachers/vercel.json`

## Required env vars (Students project)

```
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...
APP_URL=https://communications-x3rg.vercel.app
SESSION_DRIVER=cookie
SESSION_SECURE_COOKIE=true
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

## Redeploy

```powershell
git add vercel.json VERCEL.md
git commit -m "Fix Vercel 404: serve Students Laravel from repo-root vercel.json"
git push
```

Then Redeploy without build cache. Opening `/` should redirect to `/login`.
