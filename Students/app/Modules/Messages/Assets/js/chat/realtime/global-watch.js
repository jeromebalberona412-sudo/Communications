import { loadWebrtc } from '../../webrtc/load.js';
import { ensureClient } from './client.js';
import { deliverRealtimeInsert, handleMessageChange, handleReactionPayload } from './message-delivery.js';
import { scheduleInboxReload } from './inbox-schedule.js';

export function initGlobalMessageWatch() {
    var sb = ensureClient();
    if (!sb) return;
    sb.channel('comms-messages-global')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, function (payload) {
            deliverRealtimeInsert(payload.new || {});
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages'
        }, function (payload) {
            handleMessageChange(payload.new || {});
            scheduleInboxReload();
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'message_reactions'
        }, function (payload) {
            handleReactionPayload(payload);
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'calls'
        }, function (payload) {
            loadWebrtc().then(function (api) {
                if (api && typeof api.handleCallRow === 'function') {
                    api.handleCallRow(payload);
                }
            });
        })
        .subscribe();
}
