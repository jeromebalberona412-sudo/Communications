export function bindParticipantTile(videoEl, stream, name) {
    if (!videoEl) return;
    videoEl.srcObject = stream || null;
    videoEl.setAttribute('data-peer-name', name || '');
    var play = videoEl.play && videoEl.play();
    if (play && typeof play.catch === 'function') play.catch(function () {});
}

export function removeParticipantTile(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
}
