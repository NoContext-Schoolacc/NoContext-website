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
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    const productParam = url.searchParams.get('product');

    // Remove the verification token from the visible URL immediately so it is not
    // left in browser history, copied URLs, or later referrer data.
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

    document.getElementById('product-title').textContent = config.name;
    document.getElementById('product-name').textContent = config.name;
    document.getElementById('workink-link').href = config.url;

    showState('ready');
}

function showState(state) {
    document.getElementById('selection-state').style.display = 'none';
    document.getElementById('ready-state').style.display = 'none';
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('success-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';

    const target = document.getElementById(`${state}-state`);
    if (target) target.style.display = 'block';
}

function showError(msg) {
    document.getElementById('error-message').textContent = msg;
    showState('error');
}

function copyKey(btn) {
    const key = document.getElementById('generated-key').textContent;
    copyToClipboard(key, btn);
}
