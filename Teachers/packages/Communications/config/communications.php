<?php

return [
    'portal_user_type' => env('COMMS_PORTAL_USER_TYPE', 'teachers'),
    'message_max_length' => 1000,
    'message_max_lines' => 500,
    'messages_per_page' => 40,
    'search_limit' => 20,
    'call_max_participants' => 8,
    'custom_group_max_members' => 50,
    'default_group_avatar' => null,
    // How long an unanswered invitation stays valid (seconds).
    'call_ring_timeout_seconds' => (int) env('COMMS_CALL_RING_TIMEOUT', 60),
    // How often the browser reports a live call so the server can tell a
    // dead tab apart from a real call (seconds).
    'call_heartbeat_seconds' => (int) env('COMMS_CALL_HEARTBEAT', 30),
    // Safety-net poll for missed call invitations (milliseconds).
    'call_poll_interval_ms' => (int) env('COMMS_CALL_POLL_MS', 8000),
    'reaction_emojis' => ['👍', '❤️', '😂', '😮', '😢', '🙏'],
    'attachments' => [
        'max_image_kb' => 5120,
        'max_file_kb' => 10240,
        'image_extensions' => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        'file_extensions' => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip'],
    ],
    'faq' => [
        'cooldown_seconds' => 30,
    ],
];
