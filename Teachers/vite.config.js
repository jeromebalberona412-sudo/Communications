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
});
