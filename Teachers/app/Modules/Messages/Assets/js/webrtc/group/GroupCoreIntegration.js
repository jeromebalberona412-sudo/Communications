import { me, routes, toast } from './GroupCallUtils.js';

export function installGroupCoreHooks(ctx, mesh) {
    var core = window.CommsWebRTC;
    var originalStart = core.startCall;
    var originalHandle = core.handleSignal;
    var originalEnd = core.endCall;

    core.__startDirect = function (conversationId, callType, conversation, receiverId) {
        return originalStart(conversationId, callType, conversation, receiverId);
    };

    core.joinActiveGroupCall = async function (conversationId) {
        if (ctx.meshCall && Number(ctx.meshCall.conversation_id) === Number(conversationId)) return;
        if (!window.Comms) return;
        var r = routes();
        if (!r.calls) return;
        var data = await window.Comms.api(r.calls, { method: 'GET', dedupe: false });
        var list = (data && data.calls) || [];
        var row = null;
        for (var i = 0; i < list.length; i += 1) {
            var item = list[i];
            if (!item || !item.is_group_call) continue;
            if (Number(item.conversation_id) !== Number(conversationId)) continue;
            if (item.status !== 'ringing' && item.status !== 'accepted') continue;
            row = item;
            break;
        }
        if (!row) {
            toast('That group call has already ended.', 'info');
            return;
        }
        var self = me();
        if (Number(row.caller_id) === self.id) {
            toast('You are already the host of this call.', 'info');
            return;
        }
        await mesh.acceptGroupInvite({
            call_id: row.id,
            conversation_id: row.conversation_id,
            call_type: row.call_type,
            caller_id: row.caller_id,
            caller_type: row.caller_type,
            peer_name: (row.peer && row.peer.name) || 'Group call',
            invitees: row.invitees || [],
            call_max_participants: row.call_max_participants
        });
    };

    core.startCall = function (conversationId, callType, conversation, receiverId) {
        var isGroup = conversation && (
            conversation.conversation_type === 'group'
            || conversation.is_default_group
            || (conversation.other_user && conversation.other_user.is_group)
        );
        if (isGroup && !receiverId) {
            return mesh.startGroupCall(conversationId, callType, conversation);
        }
        return originalStart(conversationId, callType, conversation, receiverId);
    };

    core.handleSignal = async function (payload) {
        if (await mesh.handleSignal(payload)) return;
        return originalHandle(payload);
    };

    core.endCall = async function () {
        if (mesh.isActive()) {
            await mesh.leaveGroupCall(ctx.meshRole === 'caller' ? 'ended' : 'ended');
            return;
        }
        if (typeof originalEnd === 'function') return originalEnd();
    };

    core.__showIncomingGroup = function (payload) {
        if (typeof core.__paintIncoming === 'function') {
            core.__paintIncoming({
                id: payload.call_id,
                conversation_id: payload.conversation_id,
                call_type: payload.call_type || 'voice',
                is_group_call: true,
                peer: { name: (payload.peer_name ? payload.peer_name + ' · Group' : 'Group call') },
                caller_id: payload.caller_id,
                caller_type: payload.caller_type,
                _groupInvite: payload
            });
            return;
        }
        var incoming = document.getElementById('commsIncomingCall');
        var peer = document.getElementById('commsIncomingPeer');
        var type = document.getElementById('commsIncomingType');
        if (peer) peer.textContent = payload.peer_name || 'Group call';
        if (type) type.textContent = (payload.call_type === 'video' ? 'Group video call' : 'Group voice call');
        if (incoming) incoming.hidden = false;
    };

    core.__acceptGroupIfPending = async function () {
        var pending = window.__commsPendingGroupInvite;
        if (!pending) return false;
        window.__commsPendingGroupInvite = null;
        await mesh.acceptGroupInvite(pending);
        return true;
    };

    core.__rejectGroupIfPending = async function () {
        var pending = window.__commsPendingGroupInvite;
        if (!pending) return false;
        window.__commsPendingGroupInvite = null;
        ctx.meshCall = {
            id: pending.call_id,
            conversation_id: pending.conversation_id,
            caller_id: pending.caller_id,
            caller_type: pending.caller_type,
            is_group_call: true
        };
        ctx.meshRole = 'callee';
        await mesh.leaveGroupCall('rejected');
        return true;
    };

    core.__meshSetCamera = mesh.setCameraEnabled;
    core.__meshSetMuted = mesh.setMuted;
    core.__meshActive = mesh.isActive;
    core.__meshLeave = mesh.leaveGroupCall;

    core.__groupMesh = true;
}
