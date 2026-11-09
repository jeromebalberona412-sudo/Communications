function ready(run) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
}

ready(() => {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.querySelector('[data-sidebar-backdrop]');
    const desktop = window.matchMedia('(min-width: 992px)');

    if (!toggle || !sidebar) {
        return;
    }

    const storageKey = document.body.dataset.sidebarStorageKey || 'sidebar';

    const setExpanded = (expanded) => {
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        sidebar.inert = !expanded;
    };

    const closeMobile = () => {
        document.body.classList.remove('sidebar-open');
        if (backdrop) {
            backdrop.hidden = true;
        }
        setExpanded(false);
    };

    const applyDesktop = () => {
        const collapsed = localStorage.getItem(storageKey) === '1';
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        document.body.classList.remove('sidebar-open');
        if (backdrop) {
            backdrop.hidden = true;
        }
        setExpanded(!collapsed);
    };

    const applyInitial = () => {
        if (desktop.matches) {
            applyDesktop();
        } else {
            document.body.classList.remove('sidebar-collapsed');
            closeMobile();
        }
    };

    applyInitial();

    toggle.addEventListener('click', () => {
        if (desktop.matches) {
            const collapsed = !document.body.classList.contains('sidebar-collapsed');
            document.body.classList.toggle('sidebar-collapsed', collapsed);
            localStorage.setItem(storageKey, collapsed ? '1' : '0');
            setExpanded(!collapsed);
            return;
        }

        const open = !document.body.classList.contains('sidebar-open');
        document.body.classList.toggle('sidebar-open', open);
        if (backdrop) {
            backdrop.hidden = !open;
        }
        setExpanded(open);
    });

    backdrop?.addEventListener('click', closeMobile);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
            closeMobile();
            toggle.focus();
        }
    });

    desktop.addEventListener('change', applyInitial);
});
