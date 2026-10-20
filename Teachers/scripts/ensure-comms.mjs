/**
 * Ensure packages/Communications exists before Vite build.
 * On Vercel (Root Directory = Teachers) the package must already be in git.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRootFromScript = path.resolve(scriptDir, '..');
const cwd = process.cwd();

const candidateRoots = [
    appRootFromScript,
    cwd,
    // Vercel Root Directory = monorepo root, build run via `cd Teachers && …`
    path.join(cwd, 'Teachers'),
    path.resolve(cwd, '..', 'Teachers'),
];

function markerFor(root) {
    return path.join(
        root,
        'packages',
        'Communications',
        'assets',
        'js',
        'communication.js'
    );
}

function findReadyRoot() {
    for (const root of candidateRoots) {
        const marker = markerFor(root);
        if (fs.existsSync(marker)) {
            return { root, marker };
        }
    }
    return null;
}

function tryMonorepoSync() {
    const monorepoSync = path.resolve(appRootFromScript, '..', 'scripts', 'sync-comms-package.mjs');
    const monorepoSource = path.resolve(appRootFromScript, '..', 'Communications');
    if (!fs.existsSync(monorepoSync) || !fs.existsSync(monorepoSource)) {
        return false;
    }
    console.log('[ensure-comms] Syncing from monorepo Communications/ …');
    const result = spawnSync(process.execPath, [monorepoSync], {
        cwd: path.resolve(appRootFromScript, '..'),
        stdio: 'inherit',
    });
    return result.status === 0 && Boolean(findReadyRoot());
}

const ready = findReadyRoot();
if (ready) {
    console.log(`[ensure-comms] packages/Communications ready at ${ready.root}`);
    process.exit(0);
}

if (tryMonorepoSync()) {
    process.exit(0);
}

console.error('[ensure-comms] Missing packages/Communications.');
console.error(`[ensure-comms] cwd=${cwd}`);
console.error(`[ensure-comms] scriptAppRoot=${appRootFromScript}`);
for (const root of candidateRoots) {
    const packagesDir = path.join(root, 'packages');
    let listing = '(missing)';
    try {
        listing = fs.existsSync(packagesDir)
            ? fs.readdirSync(packagesDir).join(', ') || '(empty)'
            : '(no packages/)';
    } catch (err) {
        listing = String(err && err.message ? err.message : err);
    }
    console.error(`[ensure-comms] checked ${root} → ${listing}`);
}
console.error(
    '[ensure-comms] Fix: commit Teachers/packages/Communications (and Students),\n' +
        '  set Vercel Root Directory to Teachers (or Students), then redeploy latest main.'
);
process.exit(1);
