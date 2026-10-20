import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Prefer the vendored package inside this app (Vercel Root Directory = Teachers).
 * Fall back to the monorepo sibling only for local development.
 */
function resolveCommsAssets() {
    const candidates = [
        path.resolve(__dirname, 'packages/Communications/assets'),
        path.resolve(__dirname, '../Communications/assets'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'js', 'communication.js'))) {
            return candidate;
        }
    }

    throw new Error(
        'Communications assets not found at packages/Communications/assets. ' +
            'From repo root run: node scripts/sync-comms-package.mjs'
    );
}

const commsAssets = resolveCommsAssets();

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
            // Optional alias; production imports use ../../packages/... relative paths.
            '@comms': commsAssets,
            '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
        },
    },
    server: {
        fs: {
            allow: [
                path.resolve(__dirname),
                path.resolve(__dirname, '..'),
                path.dirname(commsAssets),
            ],
        },
    },
});
