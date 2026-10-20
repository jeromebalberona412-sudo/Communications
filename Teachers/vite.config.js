import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/js/communications.js',
            ],
            refresh: true,
        }),
    ],
    resolve: {
        alias: {
            '@comms': path.resolve(__dirname, '../Communications/assets'),
            '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
        },
    },
    server: {
        fs: {
            allow: [path.resolve(__dirname, '..')],
        },
    },
});
