export function callIdOf(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return isNaN(n) ? null : n;
}

export function sameCallId(a, b) {
    var left = callIdOf(a);
    var right = callIdOf(b);
    return left != null && right != null && left === right;
}

export function isValidPayload(payload) {
    return !!(payload && typeof payload === 'object' && payload.type);
}

export function canTransition(from, to) {
    var allowed = {
        idle: ['outgoing', 'ringing', 'ended'],
        outgoing: ['ringing', 'connecting', 'cancelled', 'failed', 'ended'],
        ringing: ['connecting', 'active', 'rejected', 'cancelled', 'missed', 'ended'],
        connecting: ['active', 'failed', 'ended', 'cancelled'],
        active: ['ended', 'failed'],
        ended: [],
        rejected: [],
        failed: [],
        cancelled: [],
        missed: []
    };
    var next = allowed[from] || [];
    return next.indexOf(to) !== -1;
}
