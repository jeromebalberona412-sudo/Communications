function canonicalType(type) {
    var t = String(type || '').toLowerCase().trim();
    if (t === 'students' || t === 'student' || t === 'kabataan' || t === 'user') return 'students';
    if (t === 'teachers' || t === 'teacher' || t === 'sk_official' || t === 'official') return 'teachers';
    if (t === 'sk_fed' || t === 'admin') return 'sk_fed';
    return t;
}

export function participantKey(id, type) {
    return String(id) + ':' + canonicalType(type);
}

export function upsertParticipant(map, participant) {
    var key = participantKey(participant.id, participant.type || participant.user_type);
    map[key] = Object.assign({}, map[key] || {}, participant);
    return map[key];
}

export function removeParticipant(map, id, type) {
    var key = participantKey(id, type);
    var row = map[key] || null;
    delete map[key];
    return row;
}

export function listParticipants(map) {
    return Object.keys(map || {}).map(function (key) { return map[key]; });
}
