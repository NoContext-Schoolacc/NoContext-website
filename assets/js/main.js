// Load the shared visual theme before revealing the page so the base stylesheet never flashes first.
(() => {
    const baseStylesheet = document.querySelector('link[href*="assets/css/style.css"]');
    if (!baseStylesheet) return;

    const guard = document.createElement('style');
    guard.id = 'nc-theme-guard';
    guard.textContent = `
        html.nc-theme-pending body{visibility:hidden}
        body{opacity:0;transition:opacity .28s ease,transform .28s ease}
        body.nc-page-ready{opacity:1;transform:translateY(0)}
        body.nc-page-leaving{opacity:0;transform:translateY(4px)}
        @media(prefers-reduced-motion:reduce){body{transition:none!important}}
    `;
    document.head.appendChild(guard);
    document.documentElement.classList.add('nc-theme-pending');

    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = new URL('theme.css?v=ui7', baseStylesheet.href).href;

    const palette = document.createElement('link');
    palette.rel = 'stylesheet';
    palette.href = new URL('palette.css?v=visual3', baseStylesheet.href).href;

    let themeReady = false;
    let paletteReady = false;
    const reveal = () => {
        if (!themeReady || !paletteReady) return;
        document.documentElement.classList.remove('nc-theme-pending');
        document.body.classList.add('nc-page-ready');
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
        document.body.classList.add('nc-page-ready');
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

    // Fade between internal pages so navigation feels like one continuous app.
    document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href]');
        if (!anchor || event.defaultPrevented) return;
        if (anchor.target && anchor.target !== '_self') return;
        if (anchor.hasAttribute('download')) return;

        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

        let destination;
        try { destination = new URL(href, window.location.href); } catch { return; }
        if (destination.origin !== window.location.origin) return;
        if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) return;

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!reduceMotion && document.body.classList.contains('nc-page-ready')) {
            event.preventDefault();
            document.body.classList.remove('nc-page-ready');
            document.body.classList.add('nc-page-leaving');
            window.setTimeout(() => { window.location.href = destination.href; }, 180);
        }
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
