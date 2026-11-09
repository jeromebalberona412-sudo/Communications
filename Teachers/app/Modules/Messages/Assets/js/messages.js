import './chat/MessageManager.js';
import './chat/Realtime.js';
import './chat/HeaderChat.js';
import './chat/ConversationManager.js';
import { loadWebrtc } from './webrtc/load.js';
import '../css/floating-chat.css';

window.CommsLoadWebrtc = loadWebrtc;

if (document.getElementById('commsApp')) {
    document.body.classList.add('comms-messages-layout');
    import('./chat/ChatManager.js');
}

if (document.getElementById('commsAutomationsApp')) {
    import('./chat/Automations.js');
}

if (document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp')) {
    loadWebrtc();
}
