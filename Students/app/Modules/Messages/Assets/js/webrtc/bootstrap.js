import { CALL_BUILD } from './utils/WebRTCConfig.js';
import { callInfo } from './utils/CallLogger.js';

import './core/SignalingManager.js';
import './core/MediaManager.js';
import './core/PeerConnection.js';
import './media/CameraController.js';
import './media/MicrophoneController.js';
import './media/AudioCall.js';
import './media/VideoCall.js';
import './media/DeviceManager.js';
import './media/ScreenShareController.js';
import './lifecycle/CallTimer.js';
import './lifecycle/IncomingCall.js';
import './lifecycle/OutgoingCall.js';
import './lifecycle/CallAnswer.js';
import './lifecycle/CallReject.js';
import './lifecycle/CallEnd.js';
import './lifecycle/CallCleanup.js';
import './ui/CallUI.js';
import './ui/AudioCallUI.js';
import './ui/VideoCallUI.js';
import './ui/IncomingCallModal.js';
import './ui/CallNotification.js';
import './realtime/CallEvents.js';
import './realtime/CallPresence.js';
import './realtime/CallStatusSync.js';
import './realtime/CallRecovery.js';
import './controls/AudioToggle.js';
import './controls/VideoToggle.js';
import './controls/CameraToggle.js';
import './controls/MicrophoneToggle.js';
import './controls/SpeakerToggle.js';
import './controls/CallControls.js';
import { bootOneToOne } from './core/WebRTCManager.js';
import { installGroupCalls } from './group/GroupCallManager.js';
import './group/ParticipantManager.js';
import './group/GroupPeerManager.js';
import './group/GroupMediaManager.js';

export function bootCommunicationsWebrtc() {
    if (window.__COMMS_WEBRTC_BOOTSTRAPPED__) return window.CommsWebRTC;
    window.__COMMS_WEBRTC_BOOTSTRAPPED__ = true;
    callInfo('build ' + CALL_BUILD + ' | webrtc/bootstrap.js');
    bootOneToOne();
    installGroupCalls();
    return window.CommsWebRTC;
}

