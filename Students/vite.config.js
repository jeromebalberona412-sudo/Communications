import path from 'node:path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'shared/Assets/css/app.css',
                'shared/Assets/js/app.js',
                'app/Modules/Authentication/Assets/css/authentication.css',
                'app/Modules/Authentication/Assets/js/password-toggle.js',
                'app/Modules/Messages/Assets/js/messages.js',
            ],
            refresh: true,
        }),
    ],
    resolve: {
        alias: {
            '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/@supabase')) {
                        return 'vendor-supabase';
                    }
                    if (id.includes('node_modules/axios')) {
                        return 'vendor-axios';
                    }
                },
            },
        },
    },
});
