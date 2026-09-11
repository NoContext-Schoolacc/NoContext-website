// Load the shared visual theme before revealing the page so the base stylesheet never flashes first.
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
    theme.href = new URL('theme.css?v=ui5', baseStylesheet.href).href;

    const palette = document.createElement('link');
    palette.rel = 'stylesheet';
    palette.href = new URL('palette.css?v=visual1', baseStylesheet.href).href;

    let themeReady = false;
    let paletteReady = false;
    const reveal = () => {
        if (!themeReady || !paletteReady) return;
        document.documentElement.classList.remove('nc-theme-pending');
        guard.remove();
    };

    theme.addEventListener('load', () => { themeReady = true; reveal(); }, { once: true });
    theme.addEventListener('error', () => { themeReady = true; reveal(); }, { once: true });
    palette.addEventListener('load', () => { paletteReady = true; reveal(); }, { once: true });
    palette.addEventListener('error', () => { paletteReady = true; reveal(); }, { once: true });

    document.head.appendChild(theme);
    document.head.appendChild(palette);
    window.setTimeout(() => {
        document.documentElement.classList.remove('nc-theme-pending');
        guard.remove();
    }, 2200);
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

    const revealTargets = document.querySelectorAll(
        '.section-title, .features-grid > *, .store-grid > *, .feature-list-detailed > *, .update-entry, .update-card, .card, .product-main, .product-side, .form-card, .ticket-card, .faq-item, .admin-stat, .admin-table-card'
    );

    revealTargets.forEach((element, index) => {
        if (element.classList.contains('nc-reveal')) return;
        element.classList.add('nc-reveal');
        const delay = Math.min((index % 5) + 1, 4);
        element.classList.add(`nc-delay-${delay}`);
    });

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('nc-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

        revealTargets.forEach(element => observer.observe(element));
    } else {
        revealTargets.forEach(element => element.classList.add('nc-visible'));
    }
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
