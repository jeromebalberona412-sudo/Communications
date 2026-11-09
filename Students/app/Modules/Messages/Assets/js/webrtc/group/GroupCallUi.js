import { callElements } from './GroupCallUtils.js';

export function createGroupCallUi(ctx) {
    function els() {
        return callElements();
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
            e.inCall.classList.toggle('is-video-call', remoteVideoLive || !!ctx.meshWantsVideo);
            e.inCall.classList.toggle('is-connected', ctx.meshConnected || count > 0);
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
        tile.innerHTML = '<video autoplay playsinline></video><audio autoplay playsinline></audio><div class="comms-remote-tile-label"></div>';
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
            video.muted = false;
            video.removeAttribute('muted');
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

    function showGroupUi(call, statusText) {
        var e = els();
        if (!e.inCall) return;
        if (e.incoming) e.incoming.hidden = true;
        e.inCall.hidden = false;
        e.inCall.classList.add('is-group-call');
        e.inCall.classList.toggle('is-video-call', !!ctx.meshWantsVideo || !!ctx.meshCameraOn);
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
            e.localVideo.classList.toggle('is-camera-off', !ctx.meshCameraOn);
        }
        var off = document.getElementById('commsLocalVideoOff');
        if (off) off.hidden = !!ctx.meshCameraOn;
        if (e.timer) e.timer.hidden = !ctx.meshConnected;
    }

    return {
        els: els,
        setStatus: setStatus,
        refreshGridLayout: refreshGridLayout,
        ensureTile: ensureTile,
        removeTile: removeTile,
        bindPeerStream: bindPeerStream,
        showGroupUi: showGroupUi
    };
}
