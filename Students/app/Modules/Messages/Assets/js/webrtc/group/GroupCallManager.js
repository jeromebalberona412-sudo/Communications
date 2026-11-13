import { createMeshState } from './GroupMeshState.js';
import { toast } from './GroupCallUtils.js';
import { createGroupCallUi } from './GroupCallUi.js';
import { createGroupCallSignaling } from './GroupCallSignaling.js';
import { createGroupLocalMedia } from './GroupLocalMedia.js';
import { createGroupMeshConnections } from './GroupMeshConnections.js';
import { createGroupCallLifecycle } from './GroupCallLifecycle.js';
import { createGroupMeshCamera } from './GroupMeshCamera.js';
import { createGroupSignalRouter } from './GroupSignalRouter.js';
import { installGroupCoreHooks } from './GroupCoreIntegration.js';

export function installGroupCalls() {
    if (!window.CommsWebRTC || window.CommsWebRTC.__groupMesh) {
        return;
    }

    var ctx = createMeshState();
    var ui = createGroupCallUi(ctx);
    var signaling = createGroupCallSignaling(ctx);
    var media = createGroupLocalMedia(ctx, ui);

    var peers = createGroupMeshConnections(ctx, {
        ui: ui,
        signaling: signaling,
        media: media,
        toast: toast
    });

    var lifecycle = createGroupCallLifecycle(ctx, {
        ui: ui,
        signaling: signaling,
        media: media,
        peers: peers
    });

    var camera = createGroupMeshCamera(ctx, {
        ui: ui,
        signaling: signaling,
        media: media
    });

    var router = createGroupSignalRouter(ctx, {
        ui: ui,
        peers: peers,
        lifecycle: lifecycle,
        signaling: signaling
    });

    var mesh = {
        startGroupCall: lifecycle.startGroupCall,
        acceptGroupInvite: lifecycle.acceptGroupInvite,
        leaveGroupCall: lifecycle.leaveGroupCall,
        cleanupMesh: lifecycle.cleanupMesh,
        isActive: lifecycle.isActive,
        handleSignal: router.handleSignal,
        setCameraEnabled: camera.setCameraEnabled,
        setMuted: camera.setMuted,
        prepareRingPreview: lifecycle.prepareRingPreview,
        releaseRingPreview: lifecycle.releaseRingPreview
    };

    installGroupCoreHooks(ctx, mesh);
}
