# LAN HTTPS for Students & Teachers

Camera/microphone (`getUserMedia`) and WebRTC need a **secure context**. On a phone or another PC, `http://192.168.x.x` is not secure — use HTTPS.

## URLs

| App | HTTPS (LAN) | Laravel upstream |
|-----|-------------|------------------|
| Students | `https://192.168.1.50:8440` | `http://127.0.0.1:8005` |
| Teachers | `https://192.168.1.50:8441` | `http://127.0.0.1:8006` |

Confirm your Wi‑Fi IPv4 with `ipconfig` before sharing URLs. If it changed, regenerate certs (below) and update `APP_URL` in each `.env`.

## One-time setup

1. Generate/trust local CA + server certs (already done on this machine once):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\regen-lan-certs.ps1
```

2. Build frontend assets (served by Laravel; no Vite HMR required on phones):

```powershell
cd Students; npm run build
cd ..\Teachers; npm run build
```

3. Allow inbound HTTPS on the Private network profile (**Run PowerShell as Administrator**):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-lan-firewall.ps1
```

## Start servers

Terminal A — Students Laravel:

```powershell
cd Students
php artisan serve --host=0.0.0.0 --port=8005
```

Terminal B — Teachers Laravel:

```powershell
cd Teachers
php artisan serve --host=0.0.0.0 --port=8006
```

Terminal C — HTTPS proxies (both apps):

```powershell
cd Students
npm run serve:lan
```

Or only one app:

```powershell
cd Students
npm run serve:lan:students

cd Teachers
npm run serve:lan:teachers
```

`serve:lan` starts the Node TLS reverse proxy only. Laravel must already be listening on 8005/8006.

## Phone / other PC — trust the development CA

The server certificate is signed by a **local mkcert CA**. This PC trusts it automatically after `mkcert -install`. Phones and other computers do **not**.

1. Copy **only** `certs/rootCA.pem` to the phone (AirDrop, USB, email to yourself, shared folder).
2. **Never** copy `rootCA-key.pem` or `lan-key.pem`.
3. Install / trust as a certificate authority:

### Android

- Settings → Security → Encryption & credentials → Install a certificate → CA certificate
- Or open `rootCA.pem` from Files and install as CA
- Chrome may still show a warning on some OEMs until the CA is user-trusted

### iPhone / iPad

- AirDrop or Safari-open `rootCA.pem`
- Settings → Profile Downloaded → Install
- Settings → General → About → Certificate Trust Settings → enable full trust for the mkcert root

### Another Windows PC

```powershell
certutil -addstore -f "ROOT" path\to\rootCA.pem
```

Then open `https://192.168.1.50:8440` (Students) and `https://192.168.1.50:8441` (Teachers).

## Renew / regenerate certificates

When the LAN IP changes, or after ~2–3 years (current certs expire ~Jan 2029):

```powershell
$env:LAN_IP = "YOUR.NEW.IP"
powershell -ExecutionPolicy Bypass -File .\scripts\regen-lan-certs.ps1
```

Update both apps’ `.env` `APP_URL` values, restart Laravel and `npm run serve:lan`, and reinstall `rootCA.pem` on phones only if the CA itself was recreated.

## Environment notes

- `APP_URL` must match the HTTPS URL (scheme + host + port).
- `SESSION_SECURE_COOKIE=true` so cookies work over HTTPS.
- Distinct `SESSION_COOKIE` / `XSRF_COOKIE` names prevent Students/Teachers cookie clashes on the same host.
- Supabase Realtime already uses cloud `https://` / `wss://` — no localhost rewrite needed.
- WebRTC STUN: Google/Cloudflare public STUN. Same-Wi‑Fi LAN peers usually connect without TURN; restrictive guest Wi‑Fi may need TURN.

## Security

- Certs and keys live in `certs/` (gitignored).
- Proxies bind on `0.0.0.0` for LAN only — do not port-forward these ports to the public internet.
- Do not commit `.env`, `rootCA-key.pem`, or `lan-key.pem`.
