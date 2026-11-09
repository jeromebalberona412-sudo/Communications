function ready(run) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
}

ready(() => {
    document.querySelectorAll('form[data-disable-on-submit]').forEach((form) => {
        form.addEventListener('submit', () => {
            const button = form.querySelector('[type="submit"]');

            if (!button) {
                return;
            }

            window.setTimeout(() => {
                button.disabled = true;
                button.textContent = 'Please wait...';
            }, 0);
        });
    });
});
