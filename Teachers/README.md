# Teachers

Teacher sign-in, dashboard, and student account management for iLearnU. This application is separate from Students and is the owner of the shared `users` migration.

## Requirements

- PHP 8.3 with `pdo_pgsql`
- Node.js for Vite
- Review and run `database/sql/supabase_users.sql` in the Supabase SQL Editor before using login or student creation. Do not run `php artisan migrate` against Supabase unless that has been explicitly approved.

## Environment

Use the existing `.env`. Do not commit secrets.

Local URL already configured: `http://127.0.0.1:8006`

Sessions use the file driver. The session cookie defaults to `teachers_session` and the XSRF cookie defaults to `teachers-xsrf`.

## Default teacher

The SQL script inserts username `Teacher_001` with a bcrypt password hash and does nothing if that username already exists. It does not reset an existing password. Change the password after the first successful sign-in.

An optional seeder, `DefaultTeacherSeeder`, creates the same username only when `TEACHER_PASSWORD` or `TEACHER_PASSWORD_HASH` is set in the process environment. It also leaves an existing password unchanged. Do not run it against Supabase unless you intend to write that one account.

## Run

```powershell
cd C:\Users\admin\Documents\GitHub\Communications\Teachers
npm run build
php artisan serve --host=127.0.0.1 --port=8006
```

Students and Teachers can run at the same time.

## Tests

```powershell
php -d extension=pdo_sqlite vendor/phpunit/phpunit/phpunit
```

`phpunit.xml` forces SQLite `:memory:`. `RefreshDatabase` therefore cannot wipe Supabase.

## Routes

- `teachers.login`
- `teachers.login.store`
- `teachers.dashboard`
- `teachers.logout`
- `teachers.students.index`
- `teachers.students.create`
- `teachers.students.store`
