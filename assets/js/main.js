// Load the shared visual theme before revealing the page so the old purple base stylesheet never flashes first.
(() => {
    const baseStylesheet = document.querySelector('link[href*="assets/css/style.css"]');
    if (!baseStylesheet) return;

    const guard = document.createElement('style');
    guard.id = 'nc-theme-guard';
    guard.textContent = 'html.nc-theme-pending body{visibility:hidden}';
    document.head.appendChild(guard);
    document.documentElement.classList.add('nc-theme-pending');

    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = new URL('theme.css?v=ui3', baseStylesheet.href).href;

    const reveal = () => {
        document.documentElement.classList.remove('nc-theme-pending');
        guard.remove();
    };

    theme.addEventListener('load', reveal, { once: true });
    theme.addEventListener('error', reveal, { once: true });
    document.head.appendChild(theme);
    window.setTimeout(reveal, 1800);
})();

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.faq-question').forEach(question => {
        const item = question.closest('.faq-item');
        if (!item) return;

        const toggle = () => {
            const isOpen = item.classList.toggle('open');
            question.setAttribute('aria-expanded', String(isOpen));
        };

        question.addEventListener('click', toggle);
        question.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', event => {
            const selector = anchor.getAttribute('href');
            if (!selector || selector === '#') return;

            const target = document.querySelector(selector);
            if (target) {
                event.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});

async function copyToClipboard(text, btnElement) {
    if (typeof text !== 'string' || !btnElement) return;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.className = 'clipboard-fallback';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }

        const originalText = btnElement.textContent;
        btnElement.textContent = 'Copied!';
        setTimeout(() => {
            btnElement.textContent = originalText;
        }, 2000);
    } catch {
        // Do not expose clipboard errors or sensitive text in console logs.
    }
}
