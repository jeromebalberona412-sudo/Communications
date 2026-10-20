# Communications
A real-time communication platform that allows users to send chat messages, make voice calls, and start video calls for seamless one-on-one and group communication.

## LAN HTTPS (camera / mic / WebRTC on phones)

See **[LAN-HTTPS.md](./LAN-HTTPS.md)** for mkcert certificates, firewall rules, and `npm run serve:lan`.

| App | URL |
|-----|-----|
| Students | `https://192.168.1.50:8440` |
| Teachers | `https://192.168.1.50:8441` |

## Vercel

See **[VERCEL.md](./VERCEL.md)**. After changing the shared package, run `node scripts/sync-comms-package.mjs` and commit `Students/packages/Communications` + `Teachers/packages/Communications`.

## Render (recommended for Laravel/PHP)

See **[RENDER.md](./RENDER.md)**. Render has **no native PHP runtime** — use **Docker** Web Services (`Students/Dockerfile`, `Teachers/Dockerfile`). Do not use Node + `php artisan serve`.
