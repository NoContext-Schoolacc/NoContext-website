// Lightweight, privacy-conscious client monitoring.
// It sends only a short error message, event type, and current path to the backend.
(() => {
    const report = (kind, value) => {
        const message = typeof value === 'string' ? value : value?.message;
        if (!message || !navigator.sendBeacon && !window.fetch) return;

        const payload = JSON.stringify({
            kind,
            message: message.slice(0, 500),
            page: `${location.pathname}${location.search ? '' : ''}`
        });

        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/telemetry/client-error', blob);
                return;
            }
            void fetch('/api/telemetry/client-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
                credentials: 'same-origin'
            });
        } catch {
            // Monitoring must never interfere with the site.
        }
    };

    window.addEventListener('error', event => report('error', event.error || event.message));
    window.addEventListener('unhandledrejection', event => report('unhandledrejection', event.reason));
})();
