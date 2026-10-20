/**
 * Local LAN HTTPS reverse proxy for Students / Teachers.
 *
 * Terminates TLS with mkcert certs, then forwards to Laravel
 * (php artisan serve) on loopback so getUserMedia works on phones.
 *
 * Usage:
 *   node scripts/lan-https-proxy.mjs students
 *   node scripts/lan-https-proxy.mjs teachers
 *   node scripts/lan-https-proxy.mjs both
 */

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CERTS = path.join(ROOT, 'certs');

const APPS = {
    students: {
        name: 'Students',
        httpsPort: 8440,
        upstreamHost: '127.0.0.1',
        upstreamPort: 8005,
    },
    teachers: {
        name: 'Teachers',
        httpsPort: 8441,
        upstreamHost: '127.0.0.1',
        upstreamPort: 8006,
    },
};

function detectLanIpv4() {
    const preferred = (process.env.LAN_IP || '').trim();
    const nets = os.networkInterfaces();
    const candidates = [];

    for (const [name, entries] of Object.entries(nets)) {
        if (!entries) continue;
        for (const entry of entries) {
            const family = entry.family;
            if ((family !== 'IPv4' && family !== 4) || entry.internal) continue;
            candidates.push({ name, address: entry.address });
        }
    }

    if (preferred) {
        return preferred;
    }

    // Prefer Wi-Fi / Ethernet LAN over VirtualBox (192.168.56), Hyper-V, etc.
    const ranked = candidates
        .slice()
        .sort((a, b) => score(b) - score(a));
    return (ranked[0] && ranked[0].address) || '127.0.0.1';
}

function score(item) {
    const ip = typeof item === 'string' ? item : item.address;
    const name = (typeof item === 'string' ? '' : item.name || '').toLowerCase();
    let s = 0;

    if (/wi-?fi|wlan|wireless/.test(name)) s += 50;
    else if (/ethernet|eth|lan/.test(name)) s += 40;

    // Deprioritize common virtual/host-only adapters.
    if (
        ip.startsWith('192.168.56.') ||
        ip.startsWith('192.168.137.') ||
        /virtualbox|vbox|hyper-v|vethernet|docker|wsl|loopback/i.test(name)
    ) {
        s -= 100;
    }

    if (ip.startsWith('192.168.')) s += 30;
    else if (ip.startsWith('10.')) s += 20;
    else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) s += 10;

    return s;
}

function loadCerts() {
    const certPath = path.join(CERTS, 'lan.pem');
    const keyPath = path.join(CERTS, 'lan-key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.error(
            '[lan-https] Missing certs. Run:\n' +
                '  tools\\mkcert.exe -cert-file certs\\lan.pem -key-file certs\\lan-key.pem ' +
                '192.168.1.50 localhost 127.0.0.1 ::1'
        );
        process.exit(1);
    }

    return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
    };
}

function waitForPort(host, port, timeoutMs = 15000) {
    const started = Date.now();

    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            const socket = net.connect({ host, port }, () => {
                socket.end();
                resolve();
            });

            socket.on('error', () => {
                socket.destroy();
                if (Date.now() - started >= timeoutMs) {
                    reject(
                        new Error(
                            `Upstream ${host}:${port} is not accepting connections. ` +
                                'Start Laravel with: php artisan serve --host=0.0.0.0 --port=' +
                                port
                        )
                    );
                    return;
                }
                setTimeout(tryOnce, 400);
            });
        };

        tryOnce();
    });
}

function forward(req, res, app, tls) {
    const headers = { ...req.headers };
    headers.host = `${app.upstreamHost}:${app.upstreamPort}`;
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-host'] = req.headers.host || `${detectLanIpv4()}:${app.httpsPort}`;
    headers['x-forwarded-port'] = String(app.httpsPort);
    headers['x-forwarded-for'] =
        (req.socket && req.socket.remoteAddress) ||
        headers['x-forwarded-for'] ||
        '127.0.0.1';

    const options = {
        hostname: app.upstreamHost,
        port: app.upstreamPort,
        path: req.url,
        method: req.method,
        headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`[lan-https] ${app.name} upstream error:`, err.message);
        if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        }
        res.end(`Bad gateway to ${app.name} (${app.upstreamHost}:${app.upstreamPort}): ${err.message}`);
    });

    req.pipe(proxyReq);
}

function startProxy(appKey, tls) {
    const app = APPS[appKey];
    const server = https.createServer(tls, (req, res) => forward(req, res, app, tls));

    server.on('clientError', (err, socket) => {
        console.error(`[lan-https] ${app.name} client error:`, err.message);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    return waitForPort(app.upstreamHost, app.upstreamPort).then(() => {
        return new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(app.httpsPort, '0.0.0.0', () => {
                const lanIp = detectLanIpv4();
                console.log(
                    `[lan-https] ${app.name}: https://${lanIp}:${app.httpsPort}  →  http://${app.upstreamHost}:${app.upstreamPort}`
                );
                resolve(server);
            });
        });
    });
}

async function main() {
    const arg = (process.argv[2] || 'both').toLowerCase();
    const keys =
        arg === 'both'
            ? ['students', 'teachers']
            : arg === 'students' || arg === 'teachers'
              ? [arg]
              : null;

    if (!keys) {
        console.error('Usage: node scripts/lan-https-proxy.mjs [students|teachers|both]');
        process.exit(1);
    }

    const tls = loadCerts();
    const lanIp = detectLanIpv4();

    console.log(`[lan-https] LAN IP: ${lanIp}`);
    console.log(`[lan-https] Certs: ${CERTS}`);

    for (const key of keys) {
        await startProxy(key, tls);
    }

    console.log('[lan-https] Ready. Keep this process running while testing on other devices.');
    console.log('[lan-https] Phone CA install: copy certs/rootCA.pem to the device and trust it.');
}

main().catch((err) => {
    console.error('[lan-https] Failed:', err.message || err);
    process.exit(1);
});
