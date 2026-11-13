/**
 * Shared chat context: state, DOM refs, routes, api registry.
 */
import { loadWebrtc } from '../../webrtc/load.js';

export function createChatContext() {
    var root = document.getElementById('commsApp');
    if (!root || !window.Comms) return null;

    var routes = {};
    try { routes = JSON.parse(root.dataset.routes || '{}'); } catch (e) { routes = {}; }

    var state = {
        currentUserId: Number(root.dataset.currentUserId || 0),
        portalUserType: root.dataset.portalUserType || '',
        messageMaxLength: Math.max(1, Number(root.dataset.messageMaxLength || 1000) || 1000),
        conversations: [],
        activeId: null,
        activeConversation: null,
        messages: [],
        messagesHasMore: true,
        sendInFlight: false,
        searchTimer: null,
        filterTimer: null,
        loadingOlder: false,
        listMode: 'conversations',
        directoryFilter: 'officials',
        directoryGroups: [],
        barangayId: '',
        reactionEmojis: ['❤️', '😆', '😮', '😢', '😠', '👍', '😂', '🙏'],
        openReactionPickerId: null,
        reactInFlight: {},
        reactSkipRealtime: {},
        reactSeq: {},
        pendingAttachments: [],
        pendingPreviewUrls: [],
        pendingAttachment: null,
        pendingPreviewUrl: null,
        editingId: null,
        msgChangeSkipToast: {},
        maxTotalBytes: 25 * 1024 * 1024,
        maxImageCount: 3,
        maxFileCount: 10,
        messageCache: {},
        peerProfileRefreshTimer: null
    };

    var els = {
        sidebar: document.getElementById('commsSidebar'),
        convList: document.getElementById('commsConvList'),
        directoryList: document.getElementById('commsDirectoryList'),
        convEmpty: document.getElementById('commsConvEmpty'),
        threadEmpty: document.getElementById('commsThreadEmpty'),
        threadActive: document.getElementById('commsThreadActive'),
        messages: document.getElementById('commsMessages'),
        composer: document.getElementById('commsComposer'),
        input: document.getElementById('commsMessageInput'),
        sendBtn: document.getElementById('commsSendBtn'),
        userSearch: document.getElementById('commsConvFilter') || document.getElementById('commsUserSearch'),
        searchResults: document.getElementById('commsSearchResults'),
        convFilter: document.getElementById('commsConvFilter') || document.getElementById('commsUserSearch'),
        peerName: document.getElementById('commsPeerName'),
        peerMeta: document.getElementById('commsPeerMeta'),
        peerAvatar: document.getElementById('commsPeerAvatar'),
        peerStatusDot: document.getElementById('commsPeerStatusDot'),
        backBtn: document.getElementById('commsBackBtn'),
        typing: document.getElementById('commsTyping'),
        voiceBtn: document.getElementById('commsVoiceBtn'),
        videoBtn: document.getElementById('commsVideoBtn'),
        filterBar: document.getElementById('commsFilterBar'),
        barangayFilter: document.getElementById('commsBarangayFilter'),
        attachBtn: document.getElementById('commsAttachBtn'),
        photoInput: document.getElementById('commsPhotoInput'),
        cameraInput: document.getElementById('commsCameraInput'),
        fileInput: document.getElementById('commsFileInput'),
        attachPreview: document.getElementById('commsAttachPreview'),
        attachPreviewInner: document.getElementById('commsAttachPreviewInner'),
        attachClear: document.getElementById('commsAttachClear'),
        attachMenu: document.getElementById('commsAttachMenu'),
        pickCameraBtn: document.getElementById('commsPickCameraBtn'),
        pickPhotosBtn: document.getElementById('commsPickPhotosBtn'),
        pickFilesBtn: document.getElementById('commsPickFilesBtn'),
        uploadProgress: document.getElementById('commsUploadProgress'),
        uploadProgressBar: document.getElementById('commsUploadProgressBar'),
        scrollBottom: document.getElementById('commsScrollBottom'),
        threadMenuBtn: document.getElementById('commsThreadMenuBtn'),
        threadMenu: document.getElementById('commsThreadMenu'),
        renameGroupBtn: document.getElementById('commsRenameGroupBtn'),
        changeGroupPhotoBtn: document.getElementById('commsChangeGroupPhotoBtn'),
        groupPhotoBtn: document.getElementById('commsGroupPhotoBtn'),
        groupAvatarInput: document.getElementById('commsGroupAvatarInput'),
        viewMembersBtn: document.getElementById('commsViewMembersBtn'),
        groupInfoBtn: document.getElementById('commsGroupInfoBtn'),
        groupModal: document.getElementById('commsGroupModal'),
        groupModalTitle: document.getElementById('commsGroupModalTitle'),
        groupModalBody: document.getElementById('commsGroupModalBody'),
        renameModal: document.getElementById('commsRenameModal'),
        renameForm: document.getElementById('commsRenameForm'),
        renameInput: document.getElementById('commsRenameInput'),
        renameSubmit: document.getElementById('commsRenameSubmit'),
        peerAvatarWrap: document.getElementById('commsPeerAvatarWrap') || document.querySelector('.comms-peer-avatar-wrap'),
        peerAvatarStack: document.getElementById('commsPeerAvatarStack')
    };

    function withWebrtc(run) {
        loadWebrtc().then(function (webrtcApi) {
            if (webrtcApi) run(webrtcApi);
        });
    }

    return {
        root: root,
        routes: routes,
        state: state,
        els: els,
        api: {},
        withWebrtc: withWebrtc
    };
}
