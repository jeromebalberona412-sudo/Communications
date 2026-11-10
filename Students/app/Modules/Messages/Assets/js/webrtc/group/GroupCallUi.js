import { callElements } from './GroupCallUtils.js';

export function createGroupCallUi(ctx) {
    function els() {
        return callElements();
    }

    function setStatus(text) {
        var e = els();
        if (e.callStatus) e.callStatus.textContent = text || '';
    }

    function shapeFor(cells, width, height) {
        var gap = 8;
        var availW = Math.max(140, width - 8);
        var availH = Math.max(110, height - 8);
        var best = { cols: 1, rows: Math.max(1, cells) };
        var bestScore = -1;
        var cols;
        for (cols = 1; cols <= Math.max(1, cells); cols += 1) {
            var rows = Math.ceil(cells / cols);
            var tileW = (availW - gap * (cols - 1)) / cols;
            var tileH = (availH - gap * (rows - 1)) / rows;
            var side = Math.min(tileW, tileH * (4 / 3));
            var empty = (cols * rows) - cells;
            var score = side - (empty * 12);
            if (score > bestScore) {
                bestScore = score;
                best = { cols: cols, rows: rows };
            }
        }
        return best;
    }

    function slotsThatFit(width, height) {
        var gap = 8;
        var minW = width < 520 ? 92 : 120;
        var minH = width < 520 ? 70 : 90;
        var cols = Math.max(1, Math.floor((width + gap) / (minW + gap)));
        var rows = Math.max(1, Math.floor((height + gap) / (minH + gap)));
        return Math.max(1, Math.min(12, cols * rows));
    }

    function refreshGridLayout() {
        var e = els();
        if (!e.remoteGrid) return;
        var tiles = Array.prototype.slice.call(e.remoteGrid.querySelectorAll('.comms-remote-tile'));
        var count = tiles.length;
        var remoteVideoLive = false;
        tiles.forEach(function (tile) {
            var video = tile.querySelector('video');
            var stream = video && video.srcObject;
            if (!stream || typeof stream.getVideoTracks !== 'function') return;
            if (stream.getVideoTracks().some(function (t) {
                return t && t.readyState === 'live' && t.enabled !== false && t.muted !== true
                    && video && Number(video.videoWidth || 0) > 0;
            })) {
                remoteVideoLive = true;
            }
        });
        var box = e.remoteGrid.getBoundingClientRect();
        var width = box.width || window.innerWidth;
        var height = box.height || window.innerHeight;
        var capacity = slotsThatFit(width, height);
        var overflow = count > capacity;
        var pageSize = overflow ? Math.max(1, capacity - 1) : count;
        var pages = Math.max(1, pageSize ? Math.ceil(count / pageSize) : 1);
        var page = Math.min(pages - 1, Math.max(0, Number(e.remoteGrid.dataset.page || 0)));
        var start = page * pageSize;
        tiles.forEach(function (tile, index) {
            var visible = !overflow || (index >= start && index < start + pageSize);
            tile.classList.toggle('is-overflow-hidden', !visible);
        });
        var shown = overflow ? pageSize + 1 : Math.max(count, 1);
        var shape = shapeFor(Math.max(1, overflow ? pageSize + 1 : count), width, height);
        e.remoteGrid.style.setProperty('--comms-cols', String(shape.cols));
        e.remoteGrid.style.setProperty('--comms-rows', String(shape.rows));
        e.remoteGrid.dataset.count = String(count);
        e.remoteGrid.dataset.cells = String(shown);
        e.remoteGrid.dataset.page = String(page);
        if (e.inCall) e.inCall.classList.toggle('has-remote-video', count > 0);
        var more = e.remoteGrid.querySelector('.comms-remote-more');
        if (overflow) {
            if (!more) {
                more = document.createElement('button');
                more.type = 'button';
                more.className = 'comms-remote-more';
                more.setAttribute('aria-label', 'Show more participants');
                e.remoteGrid.appendChild(more);
            }
            var hidden = count - pageSize;
            more.hidden = false;
            more.textContent = '+' + hidden;
            more.onclick = function () {
                var next = (Number(e.remoteGrid.dataset.page || 0) + 1) % pages;
                e.remoteGrid.dataset.page = String(next);
                refreshGridLayout();
            };
        } else if (more) {
            more.remove();
            e.remoteGrid.dataset.page = '0';
        }
        e.remoteGrid.hidden = count === 0;
        if (!e.remoteGrid._commsResizeBound) {
            e.remoteGrid._commsResizeBound = true;
            window.addEventListener('resize', function () {
                if (e.remoteGrid && !e.remoteGrid.hidden) refreshGridLayout();
            });
        }
        if (e.inCall) {
            var localCamera = !!ctx.meshCameraOn;
            var startedAsVideo = !!(ctx.meshCall && ctx.meshCall.call_type === 'video');
            var showVideo = startedAsVideo || remoteVideoLive || localCamera;
            e.inCall.classList.toggle('has-remote-video', remoteVideoLive);
            e.inCall.classList.toggle('is-video-call', showVideo);
            e.inCall.classList.toggle('is-audio-call', !showVideo);
            e.inCall.classList.toggle('is-local-camera-off', !localCamera);
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
            var videoTracks = stream.getVideoTracks ? stream.getVideoTracks().filter(function (track) {
                return track && track.readyState !== 'ended';
            }) : [];
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.autoplay = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            if (videoTracks.length) {
                var inboundHasOnlyVideo = stream.getTracks && videoTracks.length === stream.getTracks().length;
                video.srcObject = inboundHasOnlyVideo ? stream : new MediaStream(videoTracks);
            }
            var play = video.play();
            if (play && typeof play.catch === 'function') play.catch(function () { /* ignore */ });
            if (!video._commsCameraBound) {
                video._commsCameraBound = true;
                video.addEventListener('resize', function () { refreshGridLayout(); });
                video.addEventListener('loadeddata', function () { refreshGridLayout(); });
            }
            videoTracks.forEach(function (track) {
                if (track._commsGroupMuteBound) return;
                track._commsGroupMuteBound = true;
                track.addEventListener('mute', function () { refreshGridLayout(); });
                track.addEventListener('unmute', function () { refreshGridLayout(); });
            });
        }
        var audio = tile.querySelector('audio');
        if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.setAttribute('playsinline', '');
            tile.appendChild(audio);
        }
        audio.muted = false;
        audio.removeAttribute('muted');
        audio.volume = 1;
        var audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
        if (audioTracks.length) {
            audio.srcObject = new MediaStream(audioTracks);
        }
        var audioPlay = audio.play();
        if (audioPlay && typeof audioPlay.catch === 'function') audioPlay.catch(function () { /* ignore */ });
        var label = tile.querySelector('.comms-remote-tile-label');
        if (label) label.textContent = name || 'Participant';
        refreshGridLayout();
        var stage = els();
        if (stage.inCall) stage.inCall.classList.remove('is-ringing-preview');
    }

    function showGroupUi(call, statusText) {
        var e = els();
        if (!e.inCall) return;
        if (e.incoming) e.incoming.hidden = true;
        e.inCall.hidden = false;
        e.inCall.removeAttribute('hidden');
        e.inCall.classList.add('is-group-call');
        e.inCall.classList.remove('is-ringing-preview');
        e.inCall.classList.toggle('is-video-call', !!ctx.meshWantsVideo || !!ctx.meshCameraOn);
        document.documentElement.classList.add('comms-in-call');
        document.body.classList.add('comms-in-call');
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
            var cameraOff = !!(ctx.meshLocalStream && !ctx.meshCameraOn);
            e.localVideo.classList.toggle('is-camera-off', cameraOff);
            if (ctx.meshLocalStream && e.localVideo.srcObject !== ctx.meshLocalStream) {
                e.localVideo.srcObject = ctx.meshLocalStream;
                e.localVideo.muted = true;
                e.localVideo.autoplay = true;
                e.localVideo.playsInline = true;
                var replay = e.localVideo.play();
                if (replay && typeof replay.catch === 'function') replay.catch(function () { /* ignore */ });
            }
        }
        var off = document.getElementById('commsLocalVideoOff');
        if (off) off.hidden = !ctx.meshLocalStream || !!ctx.meshCameraOn;
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
