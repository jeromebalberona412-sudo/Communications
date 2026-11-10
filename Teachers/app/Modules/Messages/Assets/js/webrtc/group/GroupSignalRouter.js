import { participantKey } from './ParticipantManager.js';
import { me, samePortalType } from './GroupCallUtils.js';

export function createGroupSignalRouter(ctx, deps) {
    var ui = deps.ui;
    var peers = deps.peers;
    var lifecycle = deps.lifecycle;

    async function handleSignal(payload) {
        if (!payload || !payload.type) return false;
        if (!payload.is_group_call && payload.type !== 'group-invite' && String(payload.type || '').indexOf('group-') !== 0) {
            return false;
        }

        if (payload.type === 'group-invite') {
            var self = me();
            if (Number(payload.from_user_id) === self.id && samePortalType(payload.from_user_type, self.type)) {
                return true;
            }
            if (ctx.meshCall && Number(ctx.meshCall.id) === Number(payload.call_id)) return true;
            if (ctx.meshCall && Number(ctx.meshCall.conversation_id) === Number(payload.conversation_id)) {
                await lifecycle.cleanupMesh();
            }
            window.__commsPendingGroupInvite = payload;
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__showIncomingGroup === 'function') {
                window.CommsWebRTC.__showIncomingGroup(payload);
            }
            return true;
        }

        if (payload.type === 'group-join') {
            if (!ctx.meshCall || Number(payload.call_id) !== Number(ctx.meshCall.id)) return true;
            ctx.meshConnected = true;
            if (ctx.ringTimer) {
                clearTimeout(ctx.ringTimer);
                ctx.ringTimer = null;
            }
            if (ctx.meshRole === 'caller' && window.CommsWebRTC && typeof window.CommsWebRTC.__stopRingtone === 'function') {
                window.CommsWebRTC.__stopRingtone();
            }
            if (payload.started_at && window.CommsWebRTC && typeof window.CommsWebRTC.__syncTimer === 'function') {
                window.CommsWebRTC.__syncTimer(payload.started_at, payload.server_time || null);
            }
            await peers.connectToPeer(payload.from_user_id, payload.from_user_type, payload.from_name || payload.peer_name || 'Participant');
            return true;
        }

        if (payload.type === 'group-offer' || payload.type === 'group-answer' || payload.type === 'group-ice') {
            if (!ctx.meshCall) {
                if (!ctx.pendingSignals) ctx.pendingSignals = [];
                ctx.pendingSignals.push(payload);
                return true;
            }
            if (payload.type === 'group-offer') await peers.handleGroupOffer(payload);
            else if (payload.type === 'group-answer') await peers.handleGroupAnswer(payload);
            else await peers.handleGroupIce(payload);
            return true;
        }

        if (payload.type === 'camera-state') {
            if (!ctx.meshCall || Number(payload.call_id) !== Number(ctx.meshCall.id)) return true;

            var selfCam = me();
            if (Number(payload.from_user_id) === selfCam.id && samePortalType(payload.from_user_type, selfCam.type)) {
                return true;
            }

            var key = participantKey(payload.from_user_id, payload.from_user_type);

            var incomingSeq = Number(payload.seq || 0);
            var lastSeq = ctx.meshPeerCameraSeq[key] || 0;
            if (incomingSeq > 0 && incomingSeq <= lastSeq) {
                console.debug('[cam] Ignored stale camera-state from', key, 'seq', incomingSeq, '<=', lastSeq);
                return true;
            }
            ctx.meshPeerCameraSeq[key] = incomingSeq;

            console.debug('[cam] Apply camera-state from', key, 'enabled:', payload.enabled, 'seq:', incomingSeq);

            var tile = document.getElementById('commsRemoteGrid')?.querySelector('[data-peer-key="' + key.replace(/"/g, '') + '"]');
            if (tile) {
                var video = tile.querySelector('video');
                if (video) {
                    video.style.display = payload.enabled ? '' : 'none';
                }
                tile.classList.toggle('camera-off', !payload.enabled);
            }
            return true;
        }

        if (payload.type === 'group-leave' || payload.type === 'hangup') {
            if (!ctx.meshCall || Number(payload.call_id) !== Number(ctx.meshCall.id)) return true;
            var leaveKey = participantKey(payload.from_user_id, payload.from_user_type);

            if (ctx.meshPeers[leaveKey]) {
                try { ctx.meshPeers[leaveKey].pc.close(); } catch (e) { /* ignore */ }
                delete ctx.meshPeers[leaveKey];
                ui.removeTile(leaveKey);
            }

            return true;
        }

        if (payload.type === 'group-end') {
            if (!ctx.meshCall || Number(payload.call_id) !== Number(ctx.meshCall.id)) return true;
            await lifecycle.leaveGroupCall('ended');
            return true;
        }

        return false;
    }

    return {
        handleSignal: handleSignal
    };
}
