export async function setSpeakerOutput(element, deviceId) {
    if (!element || typeof element.setSinkId !== 'function' || !deviceId) return false;
    try {
        await element.setSinkId(deviceId);
        return true;
    } catch (e) {
        return false;
    }
}
