/**
 * Shared mutable state for Comms realtime (single boot per page).
 */
export const state = {
    enabled: false,
    url: '',
    key: '',
    client: null,
    messageChannel: null,
    signalChannel: null,
    presenceChannel: null,
    inboxChannel: null,
    callChannel: null,
    callChannelId: null,
    topicChannels: Object.create(null),
    previousConversationTopic: null,
    seenSignalKeys: Object.create(null),
    seenMessageIds: Object.create(null),
    pendingSignals: [],
    typingTimers: Object.create(null),
    lastTypingSent: 0,
    unreadFetchGen: 0,
    activeConversationId: null,
    localTyping: {
        active: false,
        conversationId: null,
        idleTimer: null
    },
    markReadTimers: Object.create(null),
    countedUnreadIds: Object.create(null),
    inboxReloadTimer: null,
    inboxChannels: []
};
