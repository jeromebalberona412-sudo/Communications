import './chat/MessageManager.js';
import './chat/Realtime.js';
import './chat/HeaderChat.js';
import './chat/ConversationManager.js';
import { loadWebrtc } from './webrtc/load.js';
import '../css/floating-chat.css';

window.CommsLoadWebrtc = loadWebrtc;

if (document.getElementById('commsApp')) {
    import('./chat/ChatManager.js');
    loadWebrtc();
}

if (document.getElementById('commsAutomationsApp')) {
    import('./chat/Automations.js');
}

function preloadWebrtcWhenIdle() {
    var run = function () {
        loadWebrtc();
    };
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 4000 });
        return;
    }
    window.setTimeout(run, 2500);
}

if (document.getElementById('commsRealtimeBoot') && !document.getElementById('commsApp')) {
    preloadWebrtcWhenIdle();
}
