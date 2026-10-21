/**
 * Group mesh WebRTC (multi-party voice/video) for default GCs.
 * Loaded after webrtc.js — takes over group ring-all calls so every
 * joined participant sees/hears every other participant.
 */
import {
    mediaConstraints,
    videoOnlyConstraints,
    prepareLocalStream
} from './media-constraints.js';

(function () {
    'use strict';

    if (!window.CommsWebRTC || window.CommsWebRTC.__groupMesh) {
        return;
    }

    var meshPeers = Object.create(null);
    var meshLocalStream = null;
    var meshCall = null;
    var meshWantsVideo = false;
    var meshCameraOn = false;
    var meshRole = null;
    var meshConnected = false;
    var meshInvitees = [];
    var RING_MS = 30000;
    var ringTimer = null;

    function rootEl() {
        return document.getElementById('commsApp') || document.getElementById('commsRealtimeBoot');
    }

    function me() {
        var root = rootEl();
        return {
            id: root ? Number(root.dataset.currentUserId || 0) : 0,
            type: root ? String(root.dataset.portalUserType || '') : '',
            name: root ? String(root.dataset.currentUserName || 'You') : 'You'
        };
    }

    function peerKey(id, type) {
        return String(id) + ':' + String(type || '');
    }

    function toast(msg, type) {
        if (window.Comms && typeof window.Comms.showToast === 'function') {
            window.Comms.showToast(msg, type || 'error');
            return;
        }
        window.alert(msg);
    }

    function routes() {
        return (window.CommsChat && window.CommsChat.routes) || {};
    }

    function els() {
        return {
            inCall: document.getElementById('commsInCall'),
            incoming: document.getElementById('commsIncomingCall'),
            remoteGrid: document.getElementById('commsRemoteGrid'),
            remoteVideo: document.getElementById('commsRemoteVideo'),
            localVideo: document.getElementById('commsLocalVideo'),
            peerName: document.getElementById('commsCallPeerName'),
            callStatus: document.getElementById('commsCallStatus'),
            timer: document.getElementById('commsCallTimer'),
            callCenter: document.getElementById('commsCallCenter'),
            callAvatar: document.getElementById('commsCallPeerAvatar'),
            muteBtn: document.getElementById('commsMuteBtn'),
            cameraBtn: document.getElementById('commsCameraBtn')
        };
    }

    function stunConfig() {
        return {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' }
            ]
        };
    }

    function signal(payload, targetPeer) {
        if (!meshCall || !window.CommsRealtime || typeof window.CommsRealtime.broadcastSignal !== 'function') {
            return Promise.resolve();
        }
        var options = {};
        if (targetPeer) {
            options.peerId = targetPeer.id;
            options.peerType = targetPeer.type || targetPeer.user_type;
        } else if (meshInvitees.length) {
            options.peers = meshInvitees.map(function (p) {
                return { id: p.id, type: p.user_type || p.type };
            });
        }
        var self = me();
        payload.from_user_id = self.id;
        payload.from_user_type = self.type;
        payload.from_name = self.name;
        payload.call_id = meshCall.id;
        payload.conversation_id = meshCall.conversation_id;
        payload.is_group_call = true;
        return window.CommsRealtime.broadcastSignal(meshCall.conversation_id, payload, options);
    }

    function setStatus(text) {
        var e = els();
        if (e.callStatus) e.callStatus.textContent = text || '';
    }

    function refreshGridLayout() {
        var e = els();
        if (!e.remoteGrid) return;
        var count = e.remoteGrid.querySelectorAll('.comms-remote-tile').length;
        var remoteVideoLive = false;
        e.remoteGrid.querySelectorAll('.comms-remote-tile video').forEach(function (video) {
            var stream = video.srcObject;
            if (!stream || typeof stream.getVideoTracks !== 'function') return;
            if (stream.getVideoTracks().some(function (t) {
                return t && t.readyState === 'live' && t.enabled !== false;
            })) {
                remoteVideoLive = true;
            }
        });
        e.remoteGrid.dataset.count = String(count);
        e.remoteGrid.hidden = count === 0;
        if (e.inCall) {
            e.inCall.classList.toggle('has-remote-video', remoteVideoLive);
            e.inCall.classList.toggle('is-video-call', remoteVideoLive || !!meshWantsVideo);
            e.inCall.classList.toggle('is-connected', meshConnected || count > 0);
        }
        if (e.callCenter) {
            e.callCenter.classList.toggle('is-compact', remoteVideoLive);
        }
        if (count > 0) {
            setStatus(count === 1 ? 'Connected (1 peer)' : ('Connected (' + count + ' peers)'));
        }
    }

    function ensureTile(key, name) {
        var e = els();
        if (!e.remoteGrid) return null;
        var tile = e.remoteGrid.querySelector('[data-peer-key="' + key.replace(/"/g, '') + '"]');
        if (tile) return tile;
        tile = document.createElement('div');
        tile.className = 'comms-remote-tile';
        tile.dataset.peerKey = key;
        tile.innerHTML = '<video autoplay playsinline muted></video><audio autoplay playsinline></audio><div class="comms-remote-tile-label"></div>';
        var label = tile.querySelector('.comms-remote-tile-label');
        if (label) label.textContent = name || 'Participant';
        e.remoteGrid.appendChild(tile);
        refreshGridLayout();
        return tile;
    }

    function removeTile(key) {
        var e = els();
        if (!e.remoteGrid) return;
        var tile = e.remoteGrid.querySelector('[data-peer-key="' + key.replace(/"/g, '') + '"]');
        if (tile) tile.remove();
        refreshGridLayout();
    }

    function bindPeerStream(key, name, stream) {
        var tile = ensureTile(key, name);
        if (!tile) return;
        var video = tile.querySelector('video');
        if (video) {
            video.muted = true;
            video.setAttribute('muted', '');
            video.playsInline = true;
            video.srcObject = stream;
            var play = video.play();
            if (play && typeof play.catch === 'function') play.catch(function () { /* ignore */ });
        }
        var audio = tile.querySelector('audio');
        if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.setAttribute('playsinline', '');
            tile.appendChild(audio);
        }
        audio.muted = false;
        audio.volume = 1;
        audio.srcObject = new MediaStream(stream.getAudioTracks ? stream.getAudioTracks() : []);
        var audioPlay = audio.play();
        if (audioPlay && typeof audioPlay.catch === 'function') audioPlay.catch(function () { /* ignore */ });
        var label = tile.querySelector('.comms-remote-tile-label');
        if (label) label.textContent = name || 'Participant';
        refreshGridLayout();
    }

    async function getLocalStream(videoEnabled) {
        var devices = navigator.mediaDevices;
        if (!devices || typeof devices.getUserMedia !== 'function') {
            throw new Error('Camera/microphone is not available.');
        }
        try {
            var stream = await devices.getUserMedia(mediaConstraints(!!videoEnabled));
            if (videoEnabled) {
                await prepareLocalStream(stream);
            }
            return stream;
        } catch (err) {
            if (videoEnabled) {
                try {
                    var fallback = await devices.getUserMedia({
                        audio: mediaConstraints(false).audio,
                        video: { facingMode: 'user' }
                    });
                    await prepareLocalStream(fallback);
                    return fallback;
                } catch (e2) {
                    err = e2;
                }
            }
            var name = (err && err.name) || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                throw new Error('Microphone/camera permission was denied. Allow access and try again.');
            }
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                throw new Error(videoEnabled
                    ? 'No camera or microphone was found on this device.'
                    : 'No microphone was found on this device.');
            }
            if (name === 'NotReadableError' || name === 'TrackStartError') {
                throw new Error('Camera/microphone is already in use by another app.');
            }
            throw new Error((err && err.message) || 'Unable to access camera/microphone.');
        }
    }

    async function ensureLocalMedia() {
        if (meshLocalStream) return meshLocalStream;
        meshLocalStream = await getLocalStream(meshWantsVideo);
        meshCameraOn = meshWantsVideo;
        var e = els();
        if (e.localVideo) {
            e.localVideo.srcObject = meshLocalStream;
            var play = e.localVideo.play();
            if (play && typeof play.catch === 'function') play.catch(function () { /* ignore */ });
            e.localVideo.classList.toggle('is-cam-landscape', false);
            e.localVideo.classList.toggle('is-cam-portrait', true);
            try {
                var track = meshLocalStream.getVideoTracks()[0];
                var settings = track && typeof track.getSettings === 'function' ? track.getSettings() : null;
                if (settings && settings.width && settings.height) {
                    var landscape = (Number(settings.width) / Number(settings.height)) >= 1.15;
                    e.localVideo.classList.toggle('is-cam-landscape', landscape);
                    e.localVideo.classList.toggle('is-cam-portrait', !landscape);
                }
            } catch (err) { /* ignore */ }
        }
        return meshLocalStream;
    }

    function shouldOffer(remoteId, remoteType) {
        var self = me();
        if (self.id === Number(remoteId) && self.type === String(remoteType)) return false;
        if (self.id !== Number(remoteId)) return self.id > Number(remoteId);
        return String(self.type) > String(remoteType || '');
    }

    async function createPeerConnection(remoteId, remoteType, remoteName) {
        var key = peerKey(remoteId, remoteType);
        if (meshPeers[key] && meshPeers[key].pc) return meshPeers[key];

        await ensureLocalMedia();
        var pc = new RTCPeerConnection(stunConfig());
        var entry = {
            pc: pc,
            iceQueue: [],
            id: Number(remoteId),
            type: String(remoteType || ''),
            name: remoteName || 'Participant',
            stream: null
        };
        meshPeers[key] = entry;

        meshLocalStream.getTracks().forEach(function (track) {
            pc.addTrack(track, meshLocalStream);
        });

        pc.onicecandidate = function (ev) {
            if (!ev.candidate) return;
            signal({
                type: 'group-ice',
                candidate: ev.candidate,
                to_user_id: entry.id,
                to_user_type: entry.type
            }, { id: entry.id, type: entry.type });
        };

        pc.ontrack = function (ev) {
            if (!entry.stream) entry.stream = new MediaStream();
            if (ev.track && !entry.stream.getTracks().some(function (t) { return t.id === ev.track.id; })) {
                entry.stream.addTrack(ev.track);
            }
            if (ev.streams && ev.streams[0]) {
                ev.streams[0].getTracks().forEach(function (t) {
                    if (!entry.stream.getTracks().some(function (x) { return x.id === t.id; })) {
                        entry.stream.addTrack(t);
                    }
                });
            }
            bindPeerStream(key, entry.name, entry.stream);
            meshConnected = true;
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__startTimer === 'function') {
                window.CommsWebRTC.__startTimer();
            }
            var e = els();
            if (e.timer) e.timer.hidden = false;
            refreshGridLayout();
        };

        pc.onconnectionstatechange = function () {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
                // keep tile until hangup for brief reconnect attempts
            }
        };

        return entry;
    }

    async function connectToPeer(remoteId, remoteType, remoteName) {
        var self = me();
        if (Number(remoteId) === self.id && String(remoteType) === self.type) return;
        var key = peerKey(remoteId, remoteType);
        var max = Number((meshCall && meshCall.call_max_participants) || 8);
        if (Object.keys(meshPeers).length >= Math.max(1, max - 1) && !meshPeers[key]) {
            toast('Call participant limit reached (' + max + ').', 'error');
            return;
        }

        var entry = await createPeerConnection(remoteId, remoteType, remoteName);
        if (!shouldOffer(remoteId, remoteType)) return;

        var offer = await entry.pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await entry.pc.setLocalDescription(offer);
        await signal({
            type: 'group-offer',
            sdp: offer,
            to_user_id: entry.id,
            to_user_type: entry.type,
            call_type: meshCall.call_type,
            peer_name: me().name
        }, { id: entry.id, type: entry.type });
    }

    async function handleGroupOffer(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id || String(payload.to_user_type || '') !== self.type) {
            return;
        }
        var entry = await createPeerConnection(
            payload.from_user_id,
            payload.from_user_type,
            payload.from_name || payload.peer_name || 'Participant'
        );
        await entry.pc.setRemoteDescription(payload.sdp);
        while (entry.iceQueue.length) {
            await entry.pc.addIceCandidate(entry.iceQueue.shift());
        }
        var answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        await signal({
            type: 'group-answer',
            sdp: answer,
            to_user_id: entry.id,
            to_user_type: entry.type
        }, { id: entry.id, type: entry.type });
        meshConnected = true;
        setStatus('Connected');
    }

    async function handleGroupAnswer(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id || String(payload.to_user_type || '') !== self.type) {
            return;
        }
        var key = peerKey(payload.from_user_id, payload.from_user_type);
        var entry = meshPeers[key];
        if (!entry || !entry.pc) return;
        await entry.pc.setRemoteDescription(payload.sdp);
        while (entry.iceQueue.length) {
            await entry.pc.addIceCandidate(entry.iceQueue.shift());
        }
        meshConnected = true;
        setStatus('Connected');
    }

    async function handleGroupIce(payload) {
        var self = me();
        if (Number(payload.to_user_id) !== self.id || String(payload.to_user_type || '') !== self.type) {
            return;
        }
        if (!payload.candidate) return;
        var key = peerKey(payload.from_user_id, payload.from_user_type);
        var entry = meshPeers[key];
        if (!entry) {
            entry = await createPeerConnection(payload.from_user_id, payload.from_user_type, payload.from_name || 'Participant');
        }
        if (!entry.pc.remoteDescription) {
            entry.iceQueue.push(payload.candidate);
        } else {
            await entry.pc.addIceCandidate(payload.candidate);
        }
    }

    function showGroupUi(call, statusText) {
        var e = els();
        if (!e.inCall) return;
        if (e.incoming) e.incoming.hidden = true;
        e.inCall.hidden = false;
        e.inCall.classList.add('is-group-call');
        e.inCall.classList.toggle('is-video-call', !!meshWantsVideo || !!meshCameraOn);
        if (e.remoteGrid) e.remoteGrid.hidden = false;
        if (e.remoteVideo) e.remoteVideo.srcObject = null;
        if (e.peerName) e.peerName.textContent = (call.peer && call.peer.name) || 'Group call';
        if (e.callAvatar) {
            var src = (call.peer && call.peer.profile_image_url) || '';
            if (src) {
                e.callAvatar.innerHTML = '<img src="' + String(src).replace(/"/g, '&quot;') + '" alt="">';
            } else {
                e.callAvatar.textContent = 'G';
            }
        }
        setStatus(statusText || 'Calling group…');
        if (e.muteBtn) e.muteBtn.hidden = false;
        if (e.cameraBtn) e.cameraBtn.hidden = false;
        if (e.localVideo) {
            e.localVideo.hidden = false;
            e.localVideo.classList.toggle('is-camera-off', !meshCameraOn);
        }
        var off = document.getElementById('commsLocalVideoOff');
        if (off) off.hidden = !!meshCameraOn;
    }

    async function cleanupMesh(opts) {
        opts = opts || {};
        if (ringTimer) {
            clearTimeout(ringTimer);
            ringTimer = null;
        }
        Object.keys(meshPeers).forEach(function (key) {
            try { meshPeers[key].pc && meshPeers[key].pc.close(); } catch (e) { /* ignore */ }
            removeTile(key);
        });
        meshPeers = Object.create(null);
        if (meshLocalStream) {
            meshLocalStream.getTracks().forEach(function (t) { t.stop(); });
            meshLocalStream = null;
        }
        var e = els();
        if (e.localVideo) e.localVideo.srcObject = null;
        if (e.remoteGrid) {
            e.remoteGrid.innerHTML = '';
            e.remoteGrid.hidden = true;
        }
        if (e.inCall) {
            e.inCall.classList.remove('is-group-call', 'has-remote-video', 'is-video-call', 'is-connected');
            if (!opts.keepOverlay) e.inCall.hidden = true;
        }
        meshCall = null;
        meshInvitees = [];
        meshConnected = false;
        meshRole = null;
        meshWantsVideo = false;
        meshCameraOn = false;
        window.__commsMeshTimerStarted = false;
    }

    async function updateStatus(status) {
        if (!meshCall || !window.Comms) return null;
        var r = routes();
        if (!r.callStatus) return null;
        return window.Comms.api(window.Comms.route(r.callStatus, meshCall.id), {
            method: 'POST',
            body: JSON.stringify({ status: status }),
            dedupe: false
        }).then(function (data) {
            if (data && data.message && window.CommsChat && typeof window.CommsChat.publishSentMessage === 'function') {
                window.CommsChat.publishSentMessage(data.message, (data.call && data.call.invitees) || meshInvitees);
                if (typeof window.CommsChat.appendMessage === 'function') window.CommsChat.appendMessage(data.message);
            }
            return data && data.call;
        }).catch(function () { return null; });
    }

    async function startGroupCall(conversationId, callType, conversation) {
        if (!window.Comms) return;
        if (meshCall) return;
        try {
            meshWantsVideo = callType === 'video';
            meshRole = 'caller';
            var r = routes();
            var data = await window.Comms.api(window.Comms.route(r.startCall, conversationId), {
                method: 'POST',
                body: JSON.stringify({ call_type: callType }),
                dedupe: false
            });
            meshCall = data.call;
            if (data.message && window.CommsChat && typeof window.CommsChat.publishSentMessage === 'function') {
                window.CommsChat.publishSentMessage(data.message, meshCall.invitees || []);
                if (typeof window.CommsChat.appendMessage === 'function') window.CommsChat.appendMessage(data.message);
            }
            if (!meshCall || !meshCall.is_group_call) {
                // Fall back to 1:1 path if server did not create a group room.
                await cleanupMesh({ keepOverlay: true });
                if (window.CommsWebRTC.__startDirect) {
                    return window.CommsWebRTC.__startDirect(conversationId, callType, conversation);
                }
                return;
            }
            meshInvitees = Array.isArray(meshCall.invitees) ? meshCall.invitees.slice() : [];
            showGroupUi(meshCall, 'Ringing group…');
            await signal({
                type: 'group-invite',
                call_type: callType,
                peer_name: me().name,
                caller_id: meshCall.caller_id,
                caller_type: meshCall.caller_type,
                invitees: meshInvitees
            });
            await ensureLocalMedia();
            ringTimer = setTimeout(function () {
                if (!meshConnected && meshRole === 'caller') {
                    leaveGroupCall('missed');
                }
            }, RING_MS);
            if (window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
                window.CommsChat.reloadActiveMessages();
            }
        } catch (err) {
            toast((err && err.message) || 'Unable to start group call.', 'error');
            await cleanupMesh();
        }
    }

    async function acceptGroupInvite(payload) {
        if (meshCall && Number(meshCall.id) === Number(payload.call_id)) return;
        meshWantsVideo = (payload.call_type || 'voice') === 'video';
        meshRole = 'callee';
        meshCall = {
            id: payload.call_id,
            conversation_id: payload.conversation_id,
            call_type: payload.call_type || 'voice',
            caller_id: payload.caller_id,
            caller_type: payload.caller_type,
            is_group_call: true,
            call_max_participants: payload.call_max_participants || 8,
            peer: { name: payload.peer_name || 'Group call', is_group: true },
            invitees: payload.invitees || []
        };
        meshInvitees = Array.isArray(meshCall.invitees) ? meshCall.invitees.slice() : [];
        showGroupUi(meshCall, 'Connecting…');
        await ensureLocalMedia();
        await updateStatus('accepted');
        await signal({
            type: 'group-join',
            peer_name: me().name,
            call_type: meshCall.call_type
        });
        // Connect to caller immediately.
        if (payload.caller_id) {
            await connectToPeer(payload.caller_id, payload.caller_type, payload.peer_name || 'Caller');
        }
        meshConnected = true;
        setStatus('Connected');
    }

    async function leaveGroupCall(reason) {
        if (!meshCall) {
            await cleanupMesh();
            return;
        }
        var callId = meshCall.id;
        var convId = meshCall.conversation_id;
        var isCaller = meshRole === 'caller';
        await signal({ type: 'group-leave', reason: reason || 'ended' });
        if (isCaller) {
            var nextStatus = reason === 'cancelled' ? 'cancelled' : 'ended';
            if (reason === 'missed' && !meshConnected) nextStatus = 'missed';
            await updateStatus(nextStatus);
        } else if (reason === 'rejected') {
            await updateStatus('rejected');
        }
        await cleanupMesh();
        if (window.CommsWebRTC && typeof window.CommsWebRTC.__showEnded === 'function') {
            window.CommsWebRTC.__showEnded(reason || 'ended', 'Group call', callId);
        }
        if (window.CommsChat && typeof window.CommsChat.reloadActiveMessages === 'function') {
            window.CommsChat.reloadActiveMessages();
        } else if (convId && window.CommsChat && typeof window.CommsChat.reloadConversations === 'function') {
            window.CommsChat.reloadConversations();
        }
    }

    async function handleSignal(payload) {
        if (!payload || !payload.type) return false;
        if (!payload.is_group_call && payload.type !== 'group-invite' && String(payload.type || '').indexOf('group-') !== 0) {
            return false;
        }

        if (payload.type === 'group-invite') {
            var self = me();
            if (Number(payload.from_user_id) === self.id && String(payload.from_user_type) === self.type) {
                return true;
            }
            // Show incoming via core UI, stash for accept.
            window.__commsPendingGroupInvite = payload;
            if (window.CommsWebRTC && typeof window.CommsWebRTC.__showIncomingGroup === 'function') {
                window.CommsWebRTC.__showIncomingGroup(payload);
            }
            return true;
        }

        if (payload.type === 'group-join') {
            if (!meshCall || Number(payload.call_id) !== Number(meshCall.id)) return true;
            meshConnected = true;
            if (ringTimer) {
                clearTimeout(ringTimer);
                ringTimer = null;
            }
            await connectToPeer(payload.from_user_id, payload.from_user_type, payload.from_name || payload.peer_name || 'Participant');
            return true;
        }

        if (payload.type === 'group-offer') {
            if (!meshCall) {
                // Late offer before local accept finished — ignore.
                return true;
            }
            await handleGroupOffer(payload);
            return true;
        }

        if (payload.type === 'group-answer') {
            await handleGroupAnswer(payload);
            return true;
        }

        if (payload.type === 'group-ice') {
            await handleGroupIce(payload);
            return true;
        }

        if (payload.type === 'group-leave' || payload.type === 'hangup') {
            if (!meshCall || Number(payload.call_id) !== Number(meshCall.id)) return true;
            var key = peerKey(payload.from_user_id, payload.from_user_type);
            if (meshPeers[key]) {
                try { meshPeers[key].pc.close(); } catch (e) { /* ignore */ }
                delete meshPeers[key];
                removeTile(key);
            }
            // If caller left, end room for everyone.
            if (Number(payload.from_user_id) === Number(meshCall.caller_id)
                && String(payload.from_user_type) === String(meshCall.caller_type)) {
                await leaveGroupCall('ended');
            }
            return true;
        }

        return false;
    }

    /**
     * Toggle the camera of a group call.
     *
     * Same contract as the one-to-one call: the track is only disabled (never
     * stopped) when the camera goes off, a dead track is replaced instead of
     * reused, and rapid clicks are serialised so the last intent wins.
     */
    var meshCameraChain = Promise.resolve();
    var meshCameraPending = null;

    function setCameraEnabled(enabled) {
        meshCameraPending = !!enabled;
        meshCameraChain = meshCameraChain
            .then(function () {
                return applyMeshCameraState(meshCameraPending);
            })
            .catch(function (err) {
                toast((err && err.message) || 'Unable to toggle camera.', 'error');
            })
            .then(function () {
                if (meshCameraPending !== null && meshCameraPending !== meshCameraOn) {
                    return setCameraEnabled(meshCameraPending);
                }
                return null;
            });
        return meshCameraChain;
    }

    async function applyMeshCameraState(enabled) {
        if (!meshLocalStream) return;
        enabled = !!enabled;

        var videoTracks = meshLocalStream.getVideoTracks();
        var live = videoTracks.filter(function (t) { return t.readyState === 'live'; });

        if (!enabled) {
            videoTracks.forEach(function (t) { t.enabled = false; });
            meshCameraOn = false;
            syncMeshCameraUi();
            return;
        }

        if (!live.length) {
            // The previous track died (device removed, permission revoked):
            // acquire a new one and install it on every peer connection.
            var cam = await navigator.mediaDevices.getUserMedia(videoOnlyConstraints());
            await prepareLocalStream(cam);
            var newTrack = cam.getVideoTracks()[0];
            if (!newTrack) throw new Error('No camera found.');

            // Drop dead tracks so the stream never accumulates duplicates.
            videoTracks.forEach(function (t) {
                if (t.readyState === 'ended') {
                    try { meshLocalStream.removeTrack(t); } catch (e) {}
                    try { t.stop(); } catch (e2) {}
                }
            });
            cam.getVideoTracks().forEach(function (t) {
                if (t !== newTrack) {
                    try { t.stop(); } catch (e3) {}
                }
            });

            meshLocalStream.addTrack(newTrack);
            Object.keys(meshPeers).forEach(function (key) {
                var pc = meshPeers[key].pc;
                var sender = pc.getSenders().find(function (s) { return s.track && s.track.kind === 'video'; });
                if (sender) {
                    sender.replaceTrack(newTrack);
                } else {
                    pc.addTrack(newTrack, meshLocalStream);
                }
            });
            var e = els();
            if (e.localVideo) {
                e.localVideo.srcObject = meshLocalStream;
                try {
                    var lp = e.localVideo.play();
                    if (lp && typeof lp.catch === 'function') lp.catch(function () {});
                } catch (ePlay) { /* ignore */ }
            }
        } else {
            live.forEach(function (t) { t.enabled = true; });
        }

        meshCameraOn = true;
        syncMeshCameraUi();
    }

    /**
     * Keep the self-view and the camera-off placeholder in sync.
     */
    function syncMeshCameraUi() {
        var e = els();
        if (e.localVideo) {
            // The element stays mounted; the placeholder covers it.
            e.localVideo.hidden = false;
            e.localVideo.classList.toggle('is-camera-off', !meshCameraOn);
        }
        var off = document.getElementById('commsLocalVideoOff');
        if (off) {
            off.hidden = !!meshCameraOn;
        }
        if (e.inCall) {
            e.inCall.classList.toggle('is-local-camera-off', !meshCameraOn);
        }
    }

    function setMuted(muted) {
        if (!meshLocalStream) return;
        meshLocalStream.getAudioTracks().forEach(function (t) { t.enabled = !muted; });
    }

    function isActive() {
        return !!meshCall;
    }

    // Wrap core WebRTC API.
    var core = window.CommsWebRTC;
    var originalStart = core.startCall;
    var originalHandle = core.handleSignal;
    var originalEnd = core.endCall;

    core.__startDirect = function (conversationId, callType, conversation, receiverId) {
        return originalStart(conversationId, callType, conversation, receiverId);
    };

    core.joinActiveGroupCall = async function (conversationId) {
        if (meshCall && Number(meshCall.conversation_id) === Number(conversationId)) return;
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
        await acceptGroupInvite({
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
            return startGroupCall(conversationId, callType, conversation);
        }
        return originalStart(conversationId, callType, conversation, receiverId);
    };

    core.handleSignal = async function (payload) {
        if (await handleSignal(payload)) return;
        return originalHandle(payload);
    };

    core.endCall = async function () {
        if (isActive()) {
            await leaveGroupCall(meshRole === 'caller' ? 'ended' : 'ended');
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
        // Fallback: accept path reads pending invite.
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
        await acceptGroupInvite(pending);
        return true;
    };

    core.__rejectGroupIfPending = async function () {
        var pending = window.__commsPendingGroupInvite;
        if (!pending) return false;
        window.__commsPendingGroupInvite = null;
        meshCall = {
            id: pending.call_id,
            conversation_id: pending.conversation_id,
            caller_id: pending.caller_id,
            caller_type: pending.caller_type,
            is_group_call: true
        };
        meshRole = 'callee';
        await leaveGroupCall('rejected');
        return true;
    };

    core.__meshSetCamera = setCameraEnabled;
    core.__meshSetMuted = setMuted;
    core.__meshActive = isActive;
    core.__meshLeave = leaveGroupCall;

    core.__groupMesh = true;
})();
