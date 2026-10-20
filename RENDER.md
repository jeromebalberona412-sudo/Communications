# Deploy Students & Teachers on Render (Docker)

## Root causes (common)

### A. `php: command not found`

Render **native runtimes** are Node, Python, Ruby, Go, Rust, Elixir — **not PHP**. Use **Docker**.

### B. `/` redirects but `/login` (and `/up`) show nginx “Page not Found”

The `richarvey/nginx-php-fpm` image defaults to `try_files … =404`. Only `/` hits `index.php`.

**Fix:** `PHP_CATCHALL=1` in the Dockerfile (already set) so nginx rewrites to `/index.php?$args`.

## Solution (Option B — keep Render + Docker)

Official approach: [Deploy Laravel with Docker on Render](https://render.com/docs/deploy-php-laravel-docker)

Files added:

| Path | Purpose |
|------|---------|
| `Students/Dockerfile` | PHP 8 + nginx/php-fpm, Composer, Vite build, `public` web root |
| `Teachers/Dockerfile` | Same for Teachers |
| `Students/scripts/00-laravel-deploy.sh` | Config/route/view cache on boot (migrations **off** by default) |
| `Teachers/scripts/00-laravel-deploy.sh` | Same |
| `Students/.dockerignore` / `Teachers/.dockerignore` | Exclude `.env`, `node_modules`, local `vendor` |
| `render.yaml` | Optional Blueprint for both services |

Web server: **nginx + php-fpm** (image `richarvey/nginx-php-fpm`), document root = `/var/www/html/public`.  
Not `php artisan serve` in production.

## Redeploy (manual Dashboard — recommended once)

### Students

1. Render → **New → Web Service** → connect this repo  
2. **Language / Runtime: Docker** (not Node)  
3. **Root Directory:** `Students`  
4. **Dockerfile Path:** `./Dockerfile`  
5. Clear any old **Start Command** like `php artisan serve` (use image `CMD`)  
6. **Health Check Path:** `/up`  
7. Set environment variables (below)  
8. Deploy  

### Teachers

Same steps with Root Directory `Teachers`.

Or use Blueprint: **New → Blueprint** → select `render.yaml`.

## Environment variables (set in Render UI — never commit)

```
APP_NAME=iLearnU Students
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...          # php artisan key:generate --show
APP_URL=https://YOUR-SERVICE.onrender.com

LOG_CHANNEL=stderr
SESSION_DRIVER=cookie
SESSION_SECURE_COOKIE=true
SESSION_COOKIE=students_session
CACHE_STORE=file
QUEUE_CONNECTION=sync

DB_CONNECTION=pgsql
DB_HOST=aws-0-....pooler.supabase.com
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres....
DB_PASSWORD=...
DB_SSLMODE=require
# Optional instead of discrete DB_* :
# DB_URL=postgresql://USER:PASS@HOST:5432/postgres?sslmode=require

VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=https://....supabase.co
SUPABASE_PUBLISHABLE_KEY=...
COMMS_PORTAL_USER_TYPE=students
MIGRATE_ON_DEPLOY=false
```

Teachers: same, with `teachers_session` and `COMMS_PORTAL_USER_TYPE=teachers`.

Use Supabase **session pooler** (port 5432) for long-lived PHP, not the transaction pooler (6543), unless you know you need it.

## Migrations

Not run automatically. When you approve:

```
MIGRATE_ON_DEPLOY=true
```

or one-off Render Shell: `php artisan migrate --force`

## Verify after deploy

1. Service status **Live**  
2. `https://YOUR-SERVICE.onrender.com/up` → 200  
3. `/` redirects to `/login`  
4. Login works against Supabase Postgres  

Local Docker check (optional, if Docker Desktop installed):

```powershell
cd Students
docker build -t communications-students .
```

## Free-tier notes

- Free web services **spin down** after idle; cold start can take ~30–60s  
- Ephemeral disk — prefer `SESSION_DRIVER=cookie`  
- Separate free services for Students and Teachers  

## Do not

- Use Node runtime + `php artisan serve`  
- Commit `.env` or secrets  
- Set `APP_DEBUG=true` in production  
