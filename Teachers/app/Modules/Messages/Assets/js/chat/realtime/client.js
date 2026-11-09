import { createClient } from '@supabase/supabase-js';
import { state } from './state.js';

export function ensureClient() {
    if (!state.enabled) return null;
    if (!state.client) {
        state.client = createClient(state.url, state.key, {
            realtime: { params: { eventsPerSecond: 20 } }
        });
    }
    return state.client;
}
