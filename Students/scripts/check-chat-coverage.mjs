import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '../app/Modules/Messages/Assets/js/chat/ChatManager.js');
const mgr = path.join(__dirname, '../app/Modules/Messages/Assets/js/chat/manager');
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const bodyStart = lines.findIndex((l, i) => i > 5 && l.trim() === "'use strict';") + 1;
const bodyEnd = lines.findIndex((l) => l.trim() === 'window.CommsChat = {') - 1;
const covered = new Set();
const ranges = [
    [1478, 1730], [113, 389], [515, 557], [642, 718], [559, 640], [1276, 1476],
    [720, 1004], [1006, 1275], [391, 513], [1849, 1880], [1732, 1847],
    [1882, 2412], [3159, 3428], [2414, 3157],
];
for (const [a, b] of ranges) for (let i = a; i <= b; i++) covered.add(i);
const missing = [];
for (let i = bodyStart + 1; i <= bodyEnd + 1; i++) if (!covered.has(i)) missing.push(i);
console.log('missing lines', missing.length, missing);

const files = fs.readdirSync(mgr).filter((f) => f.endsWith('.js'));
for (const f of files) {
    const n = fs.readFileSync(path.join(mgr, f), 'utf8').split(/\n/).length;
    console.log(f, n);
}
