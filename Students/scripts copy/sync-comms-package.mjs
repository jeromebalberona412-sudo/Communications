/**
 * Mirror the shared Communications package into each Laravel app so
 * Vercel (Root Directory = Students|Teachers) can build without ../ paths.
 *
 * Source of truth:  <repo>/Communications
 * Targets:          Students/packages/Communications
 *                   Teachers/packages/Communications
 *
 * Usage (from repo root or either app):
 *   node scripts/sync-comms-package.mjs
 *
 * Safe no-op when the source folder is missing but packages/ already exists
 * (typical on Vercel after packages have been committed).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'Communications');
const TARGETS = [
    path.join(ROOT, 'Students', 'packages', 'Communications'),
    path.join(ROOT, 'Teachers', 'packages', 'Communications'),
];

function exists(p) {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

function rmDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else if (entry.isFile()) {
            fs.copyFileSync(from, to);
        }
    }
}

function packageLooksValid(dir) {
    return (
        exists(path.join(dir, 'assets', 'js', 'communication.js')) &&
        exists(path.join(dir, 'Providers', 'CommunicationsServiceProvider.php'))
    );
}

function main() {
    if (!exists(SOURCE)) {
        const allVendored = TARGETS.every(packageLooksValid);
        if (allVendored) {
            console.log('[sync-comms] Source missing; using existing packages/Communications (OK for Vercel).');
            return;
        }
        console.error(
            '[sync-comms] Missing source Communications/ and packages are incomplete.\n' +
                '  Commit/sync the shared package, then re-run this script.'
        );
        process.exit(1);
    }

    for (const dest of TARGETS) {
        console.log(`[sync-comms] ${path.relative(ROOT, SOURCE)} → ${path.relative(ROOT, dest)}`);
        rmDir(dest);
        copyDir(SOURCE, dest);
        if (!packageLooksValid(dest)) {
            console.error(`[sync-comms] Sync incomplete: ${dest}`);
            process.exit(1);
        }
    }

    console.log('[sync-comms] Done.');
}

main();
