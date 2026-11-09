export async function listDevices() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return { audioinput: [], videoinput: [], audiooutput: [] };
    }
    var list = await navigator.mediaDevices.enumerateDevices();
    var grouped = { audioinput: [], videoinput: [], audiooutput: [] };
    list.forEach(function (device) {
        if (grouped[device.kind]) grouped[device.kind].push(device);
    });
    return grouped;
}

export function onDeviceChange(handler) {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.addEventListener !== 'function') return function () {};
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return function () {
        navigator.mediaDevices.removeEventListener('devicechange', handler);
    };
}
