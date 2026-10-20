# Students

Student sign-in and dashboard for iLearnU. This application is separate from Teachers and uses the shared Supabase `users` table. Only accounts with role `students` can sign in.

## Requirements

- PHP 8.3 with `pdo_pgsql`
- Node.js for Vite
- The shared `users` table created from `Teachers/database/sql/supabase_users.sql` (run that script yourself in the Supabase SQL Editor; do not run migrations against Supabase)

## Environment

Copy `.env.example` only when `.env` does not already exist. Keep database passwords and Supabase keys in `.env`, never in frontend code.

Local URL already configured: `http://127.0.0.1:8005`

Sessions use the file driver. The session cookie defaults to `students_session` and the XSRF cookie defaults to `students-xsrf`, so this app does not share a login with Teachers.

`config/database.php` reads `DB_SSLMODE` and defaults to `require`.

## Run

```powershell
cd C:\Users\admin\Documents\GitHub\Communications\Students
npm run build
php artisan serve --host=127.0.0.1 --port=8005
```

## Tests

Tests use SQLite in memory from `phpunit.xml`. They do not connect to Supabase. This machine's PHP does not load `pdo_sqlite` unless it is requested:

```powershell
php -d extension=pdo_sqlite vendor/phpunit/phpunit/phpunit
```

## Routes

- `students.login`
- `students.login.store`
- `students.dashboard`
- `students.logout`
