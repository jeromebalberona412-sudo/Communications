<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | Read here so `php artisan config:cache` on Render still has the values.
    | env() outside config files returns null after that cache.
    | broadcast_key stays server-side. The browser only receives publishable_key.
    */
    'supabase' => [
        'url' => env('SUPABASE_URL', env('VITE_SUPABASE_URL', '')),
        'publishable_key' => env('SUPABASE_PUBLISHABLE_KEY', env('VITE_SUPABASE_PUBLISHABLE_KEY', '')),
        'secret_key' => env('SUPABASE_SECRET_KEY', env('SUPABASE_SERVICE_ROLE_KEY', '')),
        'service_role_key' => env('SUPABASE_SECRET_KEY', env('SUPABASE_SERVICE_ROLE_KEY', '')),
        'communication_bucket' => env('SUPABASE_COMMUNICATION_BUCKET', 'communication'),
        'broadcast_key' => env('SUPABASE_SECRET_KEY', env('SUPABASE_SERVICE_ROLE_KEY', env('SUPABASE_PUBLISHABLE_KEY', env('VITE_SUPABASE_PUBLISHABLE_KEY', '')))),
    ],

    'cloudinary' => [
        'cloud_name' => env('CLOUDINARY_CLOUD_NAME', ''),
        'api_key' => env('CLOUDINARY_API_KEY', ''),
        'api_secret' => env('CLOUDINARY_API_SECRET', ''),
        'message_preset' => env('CLOUDINARY_MESSAGE_PRESET', 'message_images'),
        'group_preset' => env('CLOUDINARY_GROUP_PRESET', 'Groupchat_Images'),
    ],

];
