function ready(run) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
}

ready(() => {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
        const fieldId = button.getAttribute('aria-controls');
        const field = fieldId ? document.getElementById(fieldId) : null;

        if (!field) {
            return;
        }

        button.addEventListener('click', () => {
            const showing = field.type === 'text';
            field.type = showing ? 'password' : 'text';
            button.setAttribute('aria-pressed', showing ? 'false' : 'true');
            button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        });
    });
});
