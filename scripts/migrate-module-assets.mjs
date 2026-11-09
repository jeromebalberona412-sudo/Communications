import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mkdirp(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    mkdirp(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    }
}

function copyFile(src, dest) {
    if (!fs.existsSync(src)) return;
    mkdirp(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function rmrf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function migrateApp(appName) {
    const app = path.join(root, appName);
    const res = path.join(app, 'resources');

    copyDir(path.join(res, 'views', 'layouts'), path.join(app, 'shared', 'Views', 'layouts'));
    copyFile(
        path.join(res, 'views', 'components', 'navigation-link.blade.php'),
        path.join(app, 'shared', 'Views', 'components', 'navigation-link.blade.php')
    );

    copyFile(path.join(res, 'js', 'bootstrap.js'), path.join(app, 'shared', 'Assets', 'js', 'bootstrap.js'));
    copyFile(path.join(res, 'js', 'app.js'), path.join(app, 'shared', 'Assets', 'js', 'app.js'));
    copyFile(path.join(res, 'js', 'core', 'sidebar.js'), path.join(app, 'shared', 'Assets', 'js', 'sidebar.js'));
    copyFile(path.join(res, 'js', 'core', 'forms.js'), path.join(app, 'shared', 'Assets', 'js', 'forms.js'));

    copyFile(
        path.join(res, 'js', 'core', 'password-toggle.js'),
        path.join(app, 'app', 'Modules', 'Authentication', 'Assets', 'js', 'password-toggle.js')
    );
    copyFile(
        path.join(res, 'css', 'modules', 'authentication.css'),
        path.join(app, 'app', 'Modules', 'Authentication', 'Assets', 'css', 'authentication.css')
    );

    copyFile(
        path.join(res, 'css', 'modules', 'dashboard.css'),
        path.join(app, 'app', 'Modules', 'Dashboard', 'Assets', 'css', 'dashboard.css')
    );
    if (appName === 'Teachers') {
        copyFile(
            path.join(res, 'css', 'modules', 'students.css'),
            path.join(app, 'app', 'Modules', 'Dashboard', 'Assets', 'css', 'students.css')
        );
        copyFile(
            path.join(res, 'views', 'students', 'students.blade.php'),
            path.join(app, 'app', 'Modules', 'Dashboard', 'Views', 'students.blade.php')
        );
        copyFile(
            path.join(res, 'views', 'students', 'create.blade.php'),
            path.join(app, 'app', 'Modules', 'Dashboard', 'Views', 'create.blade.php')
        );
    }

    copyDir(
        path.join(res, 'js', 'modules', 'messages'),
        path.join(app, 'app', 'Modules', 'Messages', 'Assets', 'js')
    );
    copyFile(
        path.join(res, 'css', 'modules', 'messages', 'communication.css'),
        path.join(app, 'app', 'Modules', 'Messages', 'Assets', 'css', 'communication.css')
    );
    copyFile(
        path.join(res, 'css', 'modules', 'messages', 'floating-chat.css'),
        path.join(app, 'app', 'Modules', 'Messages', 'Assets', 'css', 'floating-chat.css')
    );
    copyFile(
        path.join(res, 'css', 'modules', 'communications-header.css'),
        path.join(app, 'app', 'Modules', 'Messages', 'Assets', 'css', 'communications-header.css')
    );

    rmrf(path.join(app, 'app', 'Modules', 'Messages', 'Assets', 'js', 'webrtc', 'core', '_bootSnippet.js'));
    rmrf(path.join(app, 'public', 'js', 'communications'));
    rmrf(path.join(app, 'public', 'js', 'media-constraints.js'));
    rmrf(path.join(app, 'app', 'Modules', 'Messages', 'Views', 'index.blade.php'));

    const cssImports = [
        "@import '../../../app/Modules/Authentication/Assets/css/authentication.css';",
        "@import '../../../app/Modules/Dashboard/Assets/css/dashboard.css';",
    ];
    if (appName === 'Teachers') {
        cssImports.push("@import '../../../app/Modules/Dashboard/Assets/css/students.css';");
    }
    cssImports.push(
        "@import '../../../app/Modules/Messages/Assets/css/communications-header.css';",
        "@import '../../../app/Modules/Messages/Assets/css/communication.css';",
        "@import '../../../app/Modules/Messages/Assets/css/floating-chat.css';"
    );
    mkdirp(path.join(app, 'shared', 'Assets', 'css'));
    fs.writeFileSync(path.join(app, 'shared', 'Assets', 'css', 'app.css'), cssImports.join('\n') + '\n');

    const appJs = `import './bootstrap';
import '../../../app/Modules/Authentication/Assets/js/password-toggle.js';
import './sidebar';
import './forms';

(function () {
    var boot = document.getElementById('commsRealtimeBoot') || document.getElementById('commsApp');
    if (!boot) {
        return;
    }
    var routes = {};
    try {
        routes = JSON.parse(boot.dataset.routes || '{}');
    } catch (e) {
        routes = {};
    }
    if (!window.CommsChat) {
        window.CommsChat = { routes: routes, getActiveId: function () { return null; } };
    } else if (!window.CommsChat.routes) {
        window.CommsChat.routes = routes;
    }
})();
`;
    fs.writeFileSync(path.join(app, 'shared', 'Assets', 'js', 'app.js'), appJs);

    const indexPath = path.join(app, 'app', 'Modules', 'Messages', 'Assets', 'js', 'index.js');
    if (fs.existsSync(indexPath)) {
        let index = fs.readFileSync(indexPath, 'utf8');
        index = index.replace(
            "import '../../../css/modules/messages/floating-chat.css';",
            "import '../css/floating-chat.css';"
        );
        fs.writeFileSync(indexPath, index);
    }

    const vitePath = path.join(app, 'vite.config.js');
    let vite = fs.readFileSync(vitePath, 'utf8');
    vite = vite.replace(
        `input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/js/modules/messages/index.js',
            ],`,
        `input: [
                'shared/Assets/css/app.css',
                'shared/Assets/js/app.js',
                'app/Modules/Messages/Assets/js/messages.js',
            ],`
    );
    fs.writeFileSync(vitePath, vite);

    patchLayouts(app);
    rmrf(res);
    console.log(`[migrate] ${appName} assets moved, resources/ removed`);
}

function patchLayouts(app) {
    const appBlade = path.join(app, 'shared', 'Views', 'layouts', 'app.blade.php');
    const guestBlade = path.join(app, 'shared', 'Views', 'layouts', 'guest.blade.php');
    if (fs.existsSync(appBlade)) {
        let html = fs.readFileSync(appBlade, 'utf8');
        html = html.replace(
            "@vite(['resources/css/app.css', 'resources/js/app.js', 'resources/js/modules/messages/index.js'])",
            "@vite(['shared/Assets/css/app.css', 'shared/Assets/js/app.js', 'app/Modules/Messages/Assets/js/messages.js'])"
        );
        fs.writeFileSync(appBlade, html);
    }
    if (fs.existsSync(guestBlade)) {
        let html = fs.readFileSync(guestBlade, 'utf8');
        html = html.replace(
            "@vite(['resources/css/app.css', 'resources/js/app.js'])",
            "@vite(['shared/Assets/css/app.css', 'shared/Assets/js/app.js'])"
        );
        fs.writeFileSync(guestBlade, html);
    }
}

migrateApp('Students');
migrateApp('Teachers');
