/**
 * Ensure Messages module assets exist before Vite build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRootFromScript = path.resolve(scriptDir, '..');
const cwd = process.cwd();

const candidateRoots = [
    appRootFromScript,
    cwd,
    path.join(cwd, 'Students'),
    path.resolve(cwd, '..', 'Students'),
];

function markerFor(root) {
    return path.join(root, 'app', 'Modules', 'Messages', 'Assets', 'js', 'messages.js');
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

const ready = findReadyRoot();
if (ready) {
    console.log(`[ensure-comms] Messages assets ready at ${ready.marker}`);
    process.exit(0);
}

console.error('[ensure-comms] Missing app/Modules/Messages/Assets/js/messages.js');
console.error(`[ensure-comms] cwd=${cwd}`);
process.exit(1);
