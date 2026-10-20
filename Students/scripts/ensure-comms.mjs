/**
 * Ensure packages/Communications exists before Vite build.
 * On Vercel (Root Directory = this app) the package must already be committed.
 * Locally, if the monorepo source exists, sync it first.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = path.join(
    appRoot,
    'packages',
    'Communications',
    'assets',
    'js',
    'communication.js'
);
const monorepoSync = path.resolve(appRoot, '..', 'scripts', 'sync-comms-package.mjs');
const monorepoSource = path.resolve(appRoot, '..', 'Communications');

function ok() {
    return fs.existsSync(marker);
}

if (ok()) {
    console.log('[ensure-comms] packages/Communications ready');
    process.exit(0);
}

if (fs.existsSync(monorepoSync) && fs.existsSync(monorepoSource)) {
    console.log('[ensure-comms] Syncing from monorepo Communications/ …');
    const result = spawnSync(process.execPath, [monorepoSync], {
        cwd: path.resolve(appRoot, '..'),
        stdio: 'inherit',
    });
    if (result.status === 0 && ok()) {
        process.exit(0);
    }
}

console.error(
    '[ensure-comms] Missing packages/Communications.\n' +
        '  From repo root run: node scripts/sync-comms-package.mjs\n' +
        '  Then commit Students/packages/Communications (and Teachers) for Vercel.'
);
process.exit(1);
