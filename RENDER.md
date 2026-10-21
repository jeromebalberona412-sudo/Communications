# Deploy Students & Teachers on Render (Docker)

Render has **no native PHP**. Use **Docker** Web Services.

Students is verified live: `https://communications-chats.onrender.com/login` → **200**.

## Teachers (same stack as Students)

### Create / fix the Teachers service

1. **New → Web Service** (or edit existing)
2. **Runtime: Docker** (not Node)
3. **Root Directory:** `Teachers`
4. **Dockerfile Path:** `./Dockerfile`
5. **Start / Docker Command:** leave **blank**
6. **Health Check Path:** `/up`
7. Set env vars (below) → **Deploy** (clear build cache)

### Teachers env vars

```
APP_NAME=iLearnU Teachers
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...
APP_URL=https://YOUR-TEACHERS-SERVICE.onrender.com

LOG_CHANNEL=stderr
SESSION_DRIVER=cookie
SESSION_SECURE_COOKIE=true
SESSION_COOKIE=teachers_session
CACHE_STORE=file
QUEUE_CONNECTION=sync

DB_CONNECTION=pgsql
DB_HOST=...supabase pooler...
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=...
DB_PASSWORD=...
DB_SSLMODE=require

VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
COMMS_PORTAL_USER_TYPE=teachers
MIGRATE_ON_DEPLOY=false

# Required for voice/video + realtime chat (publishable only in VITE_*)
SUPABASE_URL=https://tcvjvihwntnhofflskhb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
VITE_SUPABASE_URL=https://tcvjvihwntnhofflskhb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use a **different** `APP_KEY` and `SESSION_COOKIE` than Students.

### Realtime / calls (“Realtime is not configured”)

Vite embeds `VITE_*` at **Docker build** time. Also set the same keys as **runtime** env (Blade injects `window.__COMMS_SUPABASE__`).

On Render Environment for **both** services, set at least:

| Key | Notes |
|-----|--------|
| `VITE_SUPABASE_URL` | `https://….supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` only |
| `SUPABASE_URL` | same URL |
| `SUPABASE_PUBLISHABLE_KEY` | same publishable key |
| `SUPABASE_SECRET_KEY` | server-only (`sb_secret_…`) — never `VITE_` |

Then **Clear build cache & deploy** so Docker rebuilds assets with the keys.

### Verify Teachers

1. `https://YOUR-TEACHERS.onrender.com/up` → 200  
2. `/` → redirect to `/login`  
3. `/login` → teacher login page (not nginx sad-face 404)

## Students (already working pattern)

| Setting | Value |
|---------|--------|
| Runtime | Docker |
| Root Directory | `Students` |
| Dockerfile | `./Dockerfile` |
| Health | `/up` |

## What the Docker image does

- PHP 8 + nginx/php-fpm (`richarvey/nginx-php-fpm`)
- `composer install` + `npm run build` at **image build** time
- `WEBROOT=public`, `PHP_CATCHALL=1`
- Explicit `conf/nginx/nginx-site.conf` (Laravel `try_files` → `index.php`)
- Boot script caches config/routes/views; **no migrate** unless `MIGRATE_ON_DEPLOY=true`

## Common failures

| Symptom | Fix |
|---------|-----|
| `php: command not found` | Runtime must be **Docker**, clear `php artisan serve` |
| `/` OK but `/login` nginx 404 | Need `PHP_CATCHALL=1` + nginx-site.conf (already in repo) |
| Build OK, blank/errors | Check `APP_KEY`, `APP_URL`, DB env vars |

## Before push

```powershell
cd C:\Users\admin\Documents\GitHub\Communications
node scripts\sync-comms-package.mjs
```

Commit `Students/` + `Teachers/` Docker/nginx/scripts changes, then redeploy Teachers.
