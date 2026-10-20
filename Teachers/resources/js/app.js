import './bootstrap';
import './modules/password-toggle';
import './modules/sidebar';
import './modules/forms';

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
