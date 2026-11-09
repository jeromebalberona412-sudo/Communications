export function callLog() {
    if (!window.CALL_DEBUG) return;
    var args = ['[CALL]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
}

export function callInfo(message) {
    console.info('[CALL] ' + message);
}
