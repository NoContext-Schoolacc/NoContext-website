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
