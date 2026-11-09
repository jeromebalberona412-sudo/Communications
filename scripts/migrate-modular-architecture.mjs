/**
 * Moves Students/Teachers into app/Modules/{Authentication,Dashboard,Messages}.
 * Run: node scripts/migrate-modular-architecture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full, acc);
        else acc.push(full);
    }
    return acc;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function write(file, contents) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, contents);
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
        const from = path.join(src, name);
        const to = path.join(dest, name);
        if (fs.statSync(from).isDirectory()) copyDir(from, to);
        else copyFile(from, to);
    }
}

function replaceAll(str, map) {
    let out = str;
    for (const [from, to] of map) out = out.split(from).join(to);
    return out;
}

function rewriteNamespaces(contents) {
    return replaceAll(contents, [
        ['App\\Modules\\Communications\\', 'App\\Modules\\Messages\\'],
        ['App\\Services\\', 'App\\Core\\Services\\'],
        ['namespace App\\Http\\Controllers\\Auth;', 'namespace App\\Modules\\Authentication\\Controllers;'],
        ['namespace App\\Http\\Middleware;', 'namespace App\\Modules\\Authentication\\Middleware;'],
        ['use App\\Http\\Middleware\\EnsureStudentRole', 'use App\\Modules\\Authentication\\Middleware\\EnsureStudentRole'],
        ['use App\\Http\\Middleware\\EnsureTeacherRole', 'use App\\Modules\\Authentication\\Middleware\\EnsureTeacherRole'],
        ['use App\\Http\\Controllers\\Auth\\StudentLoginController', 'use App\\Modules\\Authentication\\Controllers\\StudentLoginController'],
        ['use App\\Http\\Controllers\\Auth\\TeacherLoginController', 'use App\\Modules\\Authentication\\Controllers\\TeacherLoginController'],
        ['use App\\Http\\Controllers\\StudentDashboardController', 'use App\\Modules\\Dashboard\\Controllers\\StudentDashboardController'],
        ['use App\\Http\\Controllers\\TeacherDashboardController', 'use App\\Modules\\Dashboard\\Controllers\\TeacherDashboardController'],
        ['use App\\Http\\Controllers\\StudentManagementController', 'use App\\Modules\\Dashboard\\Controllers\\StudentManagementController'],
        ['use App\\Http\\Requests\\StoreStudentRequest', 'use App\\Modules\\Dashboard\\Requests\\StoreStudentRequest'],
    ]);
}

function migrateApp(appName, opts) {
    const app = path.join(root, appName);
    console.log('\n===', appName, '===');

    const pkg = path.join(app, 'packages', 'Communications');
    const modules = path.join(app, 'app', 'Modules');
    const authDir = path.join(modules, 'Authentication');
    const dashDir = path.join(modules, 'Dashboard');
    const msgDir = path.join(modules, 'Messages');

    // Core services
    const servicesSrc = path.join(app, 'app', 'Services');
    if (fs.existsSync(servicesSrc)) {
        for (const file of walk(servicesSrc)) {
            const rel = path.relative(servicesSrc, file);
            let body = rewriteNamespaces(read(file));
            body = body.replace('namespace App\\Core\\Services;', 'namespace App\\Core\\Services;');
            if (body.includes('namespace App\\Http') || body.includes('namespace App\\Modules')) {
                /* already rewritten */
            } else {
                body = body.replace('namespace App\\Services;', 'namespace App\\Core\\Services;');
            }
            write(path.join(app, 'app', 'Core', 'Services', rel), body);
        }
    }

    // Authentication
    const loginSrc = path.join(app, 'app', 'Http', 'Controllers', 'Auth', opts.loginFile);
    if (fs.existsSync(loginSrc)) {
        let body = read(loginSrc);
        body = body.replace('namespace App\\Http\\Controllers\\Auth;', 'namespace App\\Modules\\Authentication\\Controllers;');
        body = body.replace("return view('auth.login');", "return view('authentication::login');");
        write(path.join(authDir, 'Controllers', opts.loginFile), body);
    }
    const mwSrc = path.join(app, 'app', 'Http', 'Middleware', opts.middlewareFile);
    if (fs.existsSync(mwSrc)) {
        let body = read(mwSrc);
        body = body.replace('namespace App\\Http\\Middleware;', 'namespace App\\Modules\\Authentication\\Middleware;');
        write(path.join(authDir, 'Middleware', opts.middlewareFile), body);
    }
    const loginView = path.join(app, 'resources', 'views', 'auth', 'login.blade.php');
    if (fs.existsSync(loginView)) {
        copyFile(loginView, path.join(authDir, 'Views', 'login.blade.php'));
    }

    write(path.join(authDir, 'Routes', 'web.php'), opts.authRoutes);

    // Dashboard
    const dashSrc = path.join(app, 'app', 'Http', 'Controllers', opts.dashboardFile);
    if (fs.existsSync(dashSrc)) {
        let body = read(dashSrc);
        body = body.replace('namespace App\\Http\\Controllers;', 'namespace App\\Modules\\Dashboard\\Controllers;');
        body = body.replace("view('dashboard.dashboard'", "view('dashboard::dashboard'");
        write(path.join(dashDir, 'Controllers', opts.dashboardFile), body);
    }
    if (opts.extraControllers) {
        for (const item of opts.extraControllers) {
            if (!fs.existsSync(item.src)) continue;
            let body = read(item.src);
            body = rewriteNamespaces(body);
            body = body.replace('namespace App\\Http\\Controllers;', 'namespace App\\Modules\\Dashboard\\Controllers;');
            body = body.replace('namespace App\\Http\\Requests;', 'namespace App\\Modules\\Dashboard\\Requests;');
            write(item.dest, body);
        }
    }
    const dashView = path.join(app, 'resources', 'views', 'dashboard', 'dashboard.blade.php');
    if (fs.existsSync(dashView)) {
        copyFile(dashView, path.join(dashDir, 'Views', 'dashboard.blade.php'));
    }
    write(path.join(dashDir, 'Routes', 'web.php'), opts.dashboardRoutes);

    // Messages: copy PHP package (skip assets)
    if (fs.existsSync(pkg)) {
        for (const name of fs.readdirSync(pkg)) {
            if (name === 'assets') continue;
            const from = path.join(pkg, name);
            const toName = name === 'views' ? 'Views' : name === 'routes' ? 'Routes' : name === 'Providers' ? 'Providers' : name;
            copyDir(from, path.join(msgDir, toName));
        }
        for (const file of walk(msgDir)) {
            if (!file.endsWith('.php')) continue;
            let body = read(file);
            body = rewriteNamespaces(body);
            body = body.replace('class CommunicationsServiceProvider', 'class MessagesServiceProvider');
            body = body.replace("loadViewsFrom(__DIR__.'/../views'", "loadViewsFrom(__DIR__.'/../Views'");
            body = body.replace("View::composer('components.header'", "View::composer('layouts.components.header'");
            if (file.endsWith('CommunicationsPageController.php')) {
                body = body.replace("view()->exists('communications.messages')\n            ? view('communications.messages', $data)\n            : view('communications::index', $data);", "view('messages::messages', $data);");
                body = body.replace("view()->exists('communications.call-history')\n            ? view('communications.call-history')\n            : view('communications::call-history');", "view('messages::call-history');");
            }
            write(file, body);
        }
        const oldProvider = path.join(msgDir, 'Providers', 'CommunicationsServiceProvider.php');
        const newProvider = path.join(msgDir, 'Providers', 'MessagesServiceProvider.php');
        if (fs.existsSync(oldProvider)) {
            fs.renameSync(oldProvider, newProvider);
        }
        const pageViews = [
            ['communications', 'messages.blade.php', 'messages.blade.php'],
            ['communications', 'call-history.blade.php', 'call-history.blade.php'],
        ];
        for (const [folder, srcName, destName] of pageViews) {
            const src = path.join(app, 'resources', 'views', folder, srcName);
            if (fs.existsSync(src)) copyFile(src, path.join(msgDir, 'Views', destName));
        }
        const appCommsRoutes = path.join(app, 'routes', 'communications.php');
        if (fs.existsSync(appCommsRoutes)) {
            let body = rewriteNamespaces(read(appCommsRoutes));
            write(path.join(msgDir, 'Routes', 'web.php'), body);
        }
    }

    // Layouts
    const layoutsComp = path.join(app, 'resources', 'views', 'layouts', 'components');
    ensureDir(layoutsComp);
    for (const name of ['header.blade.php', 'sidebar.blade.php']) {
        const src = path.join(app, 'resources', 'views', 'components', name);
        if (fs.existsSync(src)) copyFile(src, path.join(layoutsComp, name));
    }
    write(path.join(layoutsComp, 'footer.blade.php'), `<footer class="app-footer">{{ config('app.name', 'Messages') }}</footer>\n`);

    let appLayout = read(path.join(app, 'resources', 'views', 'layouts', 'app.blade.php'));
    appLayout = appLayout.replace('<x-sidebar />', "@include('layouts.components.sidebar')");
    appLayout = appLayout.replace('<x-header />', "@include('layouts.components.header')");
    appLayout = appLayout.replace(
        /<footer class="app-footer">[\s\S]*?<\/footer>/,
        "@include('layouts.components.footer')"
    );
    appLayout = appLayout.replace(
        "@vite(['resources/css/app.css', 'resources/js/app.js', 'resources/js/communications.js'])",
        "@vite(['resources/css/app.css', 'resources/js/app.js', 'resources/js/modules/messages/index.js'])"
    );
    write(path.join(app, 'resources', 'views', 'layouts', 'app.blade.php'), appLayout);

    // JS: copy webrtc + chat files
    const jsPkg = path.join(pkg, 'assets', 'js');
    const jsMsg = path.join(app, 'resources', 'js', 'modules', 'messages');
    copyDir(path.join(jsPkg, 'communications', 'webrtc'), path.join(jsMsg, 'webrtc'));
    copyFile(path.join(jsPkg, 'media-constraints.js'), path.join(jsMsg, 'webrtc', 'utils', 'media-constraints.js'));
    if (fs.existsSync(path.join(jsPkg, 'calls', 'config.js'))) {
        copyFile(path.join(jsPkg, 'calls', 'config.js'), path.join(jsMsg, 'webrtc', 'utils', 'callConstants.js'));
    }
    const jsMap = [
        ['communication.js', 'chat/MessageManager.js'],
        ['chat.js', 'chat/ChatManager.js'],
        ['floating-chat.js', 'chat/ConversationManager.js'],
        ['header-chat.js', 'chat/HeaderChat.js'],
        ['realtime.js', 'chat/Realtime.js'],
        ['automations.js', 'chat/Automations.js'],
    ];
    for (const [from, to] of jsMap) {
        const src = path.join(jsPkg, from);
        if (fs.existsSync(src)) copyFile(src, path.join(jsMsg, to));
    }

    for (const file of walk(path.join(jsMsg, 'webrtc'))) {
        if (!file.endsWith('.js')) continue;
        let body = read(file);
        body = body.split("from '../../../media-constraints.js'").join("from '../utils/media-constraints.js'");
        body = body.split("from '../../../calls/config.js'").join("from './callConstants.js'");
        write(file, body);
    }

    write(path.join(jsMsg, 'calls', 'CallManager.js'), `import '../webrtc/bootstrap.js';\n`);
    write(path.join(jsMsg, 'calls', 'IncomingCallHandler.js'), `export { paintIncoming, hideIncomingModal } from '../webrtc/ui/IncomingCallModal.js';\n`);
    write(path.join(jsMsg, 'calls', 'CallUIManager.js'), `export * from '../webrtc/ui/CallUI.js';\n`);

    write(path.join(jsMsg, 'index.js'), `import './chat/MessageManager.js';
import './chat/Realtime.js';
import './webrtc/bootstrap.js';
import './chat/ChatManager.js';
import './chat/HeaderChat.js';
import './chat/ConversationManager.js';
import './calls/CallManager.js';
import '../../../css/modules/messages/floating-chat.css';
`);

    // CSS
    const cssPkg = path.join(pkg, 'assets', 'css');
    const cssMsg = path.join(app, 'resources', 'css', 'modules', 'messages');
    if (fs.existsSync(path.join(cssPkg, 'communication.css'))) {
        copyFile(path.join(cssPkg, 'communication.css'), path.join(cssMsg, 'communication.css'));
    }
    if (fs.existsSync(path.join(cssPkg, 'floating-chat.css'))) {
        copyFile(path.join(cssPkg, 'floating-chat.css'), path.join(cssMsg, 'floating-chat.css'));
    }
    let appCss = read(path.join(app, 'resources', 'css', 'app.css'));
    appCss = appCss.replace(
        "@import '../../packages/Communications/assets/css/communication.css';",
        "@import './modules/messages/communication.css';"
    );
    write(path.join(app, 'resources', 'css', 'app.css'), appCss);

    write(path.join(app, 'resources', 'js', 'communications.js'), `import './modules/messages/index.js';\n`);

    // routes/web.php
    write(path.join(app, 'routes', 'web.php'), opts.webPhp);

    // bootstrap/app.php middleware imports
    let boot = read(path.join(app, 'bootstrap', 'app.php'));
    boot = rewriteNamespaces(boot);
    write(path.join(app, 'bootstrap', 'app.php'), boot);

    // providers
    let providers = read(path.join(app, 'bootstrap', 'providers.php'));
    providers = providers.replace(
        'App\\Modules\\Communications\\Providers\\CommunicationsServiceProvider::class',
        'App\\Modules\\Messages\\Providers\\MessagesServiceProvider::class'
    );
    write(path.join(app, 'bootstrap', 'providers.php'), providers);

    // composer autoload
    const composerPath = path.join(app, 'composer.json');
    const composer = JSON.parse(read(composerPath));
    if (composer.autoload && composer.autoload['psr-4']) {
        delete composer.autoload['psr-4']['App\\Modules\\Communications\\'];
    }
    write(composerPath, JSON.stringify(composer, null, 4) + '\n');

    // vite: still works with resources/js paths; keep alias optional
    let vite = read(path.join(app, 'vite.config.js'));
    vite = vite.replace("'resources/js/communications.js'", "'resources/js/modules/messages/index.js'");
    write(path.join(app, 'vite.config.js'), vite);

    // ensure-comms: allow new marker
    const ensure = path.join(app, 'scripts', 'ensure-comms.mjs');
    if (fs.existsSync(ensure)) {
        let body = read(ensure);
        body = body.replace(
            `path.join(
        root,
        'packages',
        'Communications',
        'assets',
        'js',
        'communication.js'
    )`,
            `path.join(root, 'resources', 'js', 'modules', 'messages', 'index.js')`
        );
        write(ensure, body);
    }

    // Delete moved sources (keep packages/Communications until after build? user asked no duplicates)
    const deleteList = [
        path.join(app, 'app', 'Http', 'Controllers', 'Auth', opts.loginFile),
        path.join(app, 'app', 'Http', 'Middleware', opts.middlewareFile),
        path.join(app, 'app', 'Http', 'Controllers', opts.dashboardFile),
        path.join(app, 'routes', 'communications.php'),
        path.join(app, 'resources', 'views', 'auth', 'login.blade.php'),
        path.join(app, 'resources', 'views', 'dashboard', 'dashboard.blade.php'),
        path.join(app, 'resources', 'views', 'communications', 'messages.blade.php'),
        path.join(app, 'resources', 'views', 'communications', 'call-history.blade.php'),
        path.join(app, 'resources', 'views', 'components', 'header.blade.php'),
        path.join(app, 'resources', 'views', 'components', 'sidebar.blade.php'),
    ];
    if (opts.extraControllers) {
        for (const item of opts.extraControllers) deleteList.push(item.src);
    }
    for (const file of walk(servicesSrc)) deleteList.push(file);
    for (const file of deleteList) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    console.log('migrated', appName);
}

const studentsAuthRoutes = `<?php

use App\\Modules\\Authentication\\Controllers\\StudentLoginController;
use Illuminate\\Support\\Facades\\Route;

Route::get('/', function () {
    return redirect()->route('students.login');
});

Route::middleware('guest')->group(function () {
    Route::get('/login', [StudentLoginController::class, 'create'])->name('students.login');
    Route::post('/login', [StudentLoginController::class, 'store'])->name('students.login.store');
});

Route::middleware(['auth', 'student'])->group(function () {
    Route::post('/logout', [StudentLoginController::class, 'destroy'])->name('students.logout');
});
`;

const studentsDashRoutes = `<?php

use App\\Modules\\Dashboard\\Controllers\\StudentDashboardController;
use Illuminate\\Support\\Facades\\Route;

Route::middleware(['auth', 'student'])->group(function () {
    Route::get('/dashboard', [StudentDashboardController::class, 'index'])->name('students.dashboard');
});
`;

const teachersAuthRoutes = `<?php

use App\\Modules\\Authentication\\Controllers\\TeacherLoginController;
use Illuminate\\Support\\Facades\\Route;

Route::get('/', function () {
    return redirect()->route('teachers.login');
});

Route::middleware('guest')->group(function () {
    Route::get('/login', [TeacherLoginController::class, 'create'])->name('teachers.login');
    Route::post('/login', [TeacherLoginController::class, 'store'])->name('teachers.login.store');
});

Route::middleware(['auth', 'teacher'])->group(function () {
    Route::post('/logout', [TeacherLoginController::class, 'destroy'])->name('teachers.logout');
});
`;

const teachersDashRoutes = `<?php

use App\\Modules\\Dashboard\\Controllers\\StudentManagementController;
use App\\Modules\\Dashboard\\Controllers\\TeacherDashboardController;
use Illuminate\\Support\\Facades\\Route;

Route::middleware(['auth', 'teacher'])->group(function () {
    Route::get('/dashboard', [TeacherDashboardController::class, 'index'])->name('teachers.dashboard');
    Route::get('/students', [StudentManagementController::class, 'index'])->name('teachers.students.index');
    Route::get('/students/create', [StudentManagementController::class, 'create'])->name('teachers.students.create');
    Route::post('/students', [StudentManagementController::class, 'store'])->name('teachers.students.store');
});
`;

const studentsWeb = `<?php

use Illuminate\\Support\\Facades\\Route;

require app_path('Modules/Authentication/Routes/web.php');
require app_path('Modules/Dashboard/Routes/web.php');

Route::middleware(['auth', 'student'])->group(function () {
    require app_path('Modules/Messages/Routes/web.php');
});
`;

const teachersWeb = `<?php

use Illuminate\\Support\\Facades\\Route;

require app_path('Modules/Authentication/Routes/web.php');
require app_path('Modules/Dashboard/Routes/web.php');

Route::middleware(['auth', 'teacher'])->group(function () {
    require app_path('Modules/Messages/Routes/web.php');
});
`;

migrateApp('Students', {
    loginFile: 'StudentLoginController.php',
    middlewareFile: 'EnsureStudentRole.php',
    dashboardFile: 'StudentDashboardController.php',
    authRoutes: studentsAuthRoutes,
    dashboardRoutes: studentsDashRoutes,
    webPhp: studentsWeb,
});

migrateApp('Teachers', {
    loginFile: 'TeacherLoginController.php',
    middlewareFile: 'EnsureTeacherRole.php',
    dashboardFile: 'TeacherDashboardController.php',
    authRoutes: teachersAuthRoutes,
    dashboardRoutes: teachersDashRoutes,
    webPhp: teachersWeb,
    extraControllers: [
        {
            src: path.join(root, 'Teachers', 'app', 'Http', 'Controllers', 'StudentManagementController.php'),
            dest: path.join(root, 'Teachers', 'app', 'Modules', 'Dashboard', 'Controllers', 'StudentManagementController.php'),
        },
        {
            src: path.join(root, 'Teachers', 'app', 'Http', 'Requests', 'StoreStudentRequest.php'),
            dest: path.join(root, 'Teachers', 'app', 'Modules', 'Dashboard', 'Requests', 'StoreStudentRequest.php'),
        },
    ],
});

console.log('\nDone.');
