export const RING_MS = 30000;

export function createMeshState() {
    return {
        meshPeers: Object.create(null),
        meshLocalStream: null,
        meshCall: null,
        meshWantsVideo: false,
        meshCameraOn: false,
        meshRole: null,
        meshConnected: false,
        meshInvitees: [],
        meshCameraSeq: 0,
        meshPeerCameraSeq: Object.create(null),
        ringTimer: null,
        meshCameraChain: Promise.resolve(),
        meshCameraPending: null,
        pendingSignals: []
    };
}
