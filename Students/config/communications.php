<?php

return [
    'portal_user_type' => env('COMMS_PORTAL_USER_TYPE', 'students'),
    'message_max_length' => 1000,
    'message_max_lines' => 500,
    'messages_per_page' => 40,
    'search_limit' => 20,
    'call_max_participants' => 8,
    'default_group_avatar' => null,
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
