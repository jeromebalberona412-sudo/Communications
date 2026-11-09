import fs from 'node:fs';

const src = fs.readFileSync(
    'C:/Users/admin/Documents/GitHub/Communications/Teachers/packages/Communications/assets/js/webrtc-group.js',
    'utf8'
);
let body = src.replace(/^[\s\S]*?\(function \(\) \{\n    'use strict';\n\n/, '');
body = body.replace(/\n\}\)\(\);\s*$/, '\n');

const out = `import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from '../../../media-constraints.js';
import { CALL_BUILD } from '../utils/WebRTCConfig.js';

export function installGroupCalls() {
    if (!window.CommsWebRTC || window.CommsWebRTC.__groupMesh) {
        return;
    }
    console.info('[CALL] build ' + CALL_BUILD + ' | GroupCallManager loaded');

${body}
}
`;

fs.mkdirSync(
    'C:/Users/admin/Documents/GitHub/Communications/Teachers/packages/Communications/assets/js/communications/webrtc/group',
    { recursive: true }
);
fs.writeFileSync(
    'C:/Users/admin/Documents/GitHub/Communications/Teachers/packages/Communications/assets/js/communications/webrtc/group/GroupCallManager.js',
    out
);
console.log('group lines', out.split('\n').length);
