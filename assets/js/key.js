const PRODUCT_CONFIG = {
    external: {
        name: 'NoContext External',
        url: 'https://work.ink/external-link'
    },
    executor: {
        name: 'NoContext Executor',
        url: 'https://work.ink/executor-link'
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-product]').forEach(button => {
        button.addEventListener('click', () => selectProduct(button.dataset.product));
    });
    document.getElementById('copy-key')?.addEventListener('click', event => copyKey(event.currentTarget));

    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    const productParam = url.searchParams.get('product');

    if (token) {
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }

    if (token) {
        const product = productParam && PRODUCT_CONFIG[productParam] ? productParam : null;
        if (!product) {
            showError('Invalid product selection.');
            return;
        }

        showState('loading');

        try {
            const response = await ApiService.claimFreeKey(token, product);
            if (response.success && response.key) {
                document.getElementById('generated-key').textContent = response.key;
                showState('success');
            } else {
                showError(response.error || 'Verification failed.');
            }
        } catch {
            showError('Verification could not be completed. Please try again.');
        }
    } else if (productParam && PRODUCT_CONFIG[productParam]) {
        selectProduct(productParam);
    } else {
        showState('selection');
    }
});

function selectProduct(type) {
    const config = PRODUCT_CONFIG[type];
    if (!config) return;

    const title = document.getElementById('product-title');
    const productName = document.getElementById('product-name');
    const workinkLink = document.getElementById('workink-link');

    if (title) title.textContent = config.name;
    if (productName) productName.textContent = config.name;
    if (workinkLink) {
        workinkLink.href = config.url;
        workinkLink.referrerPolicy = 'no-referrer';
        workinkLink.rel = 'noopener noreferrer';
    }

    showState('ready');
}

function showState(state) {
    document.querySelectorAll('.key-flow > .state-card').forEach(card => {
        card.hidden = true;
    });

    const target = document.getElementById(`${state}-state`);
    if (target) target.hidden = false;
}

function showError(msg) {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) errorMessage.textContent = msg;
    showState('error');
}

function copyKey(btn) {
    const key = document.getElementById('generated-key')?.textContent || '';
    if (!key || key.includes('----')) return;
    copyToClipboard(key, btn);
}
