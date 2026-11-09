export function callLog() {
    if (!window.CALL_DEBUG) return;
    console.log.apply(console, ['[CALL]'].concat(Array.prototype.slice.call(arguments)));
}

export function callInfo(message) {
    console.info('[CALL] ' + message);
}

export function callWarn(message) {
    console.warn('[CALL] ' + message);
}

export function callError(message, err) {
    console.error('[CALL] ' + message, err || '');
}
