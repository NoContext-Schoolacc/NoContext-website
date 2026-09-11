document.addEventListener('DOMContentLoaded', () => {
    const keyInput = document.getElementById('license-key');
    const form = document.getElementById('license-form');
    form?.addEventListener('submit', event => {
        event.preventDefault();
        void checkStatus();
    });

    keyInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            form?.requestSubmit();
        }
    });
});

async function checkStatus() {
    const keyInput = document.getElementById('license-key');
    const resultDiv = document.getElementById('status-result');
    const loading = document.getElementById('loading-status');
    const statusLabel = document.getElementById('status-label');
    const expiryLabel = document.getElementById('expiry-label');
    const submitButton = document.getElementById('status-submit');

    if (!keyInput || !resultDiv || !loading || !statusLabel || !expiryLabel) return;

    const key = keyInput.value.trim();
    if (!key) {
        keyInput.focus();
        keyInput.setCustomValidity('Enter a license key.');
        keyInput.reportValidity();
        return;
    }
    keyInput.setCustomValidity('');

    resultDiv.hidden = true;
    loading.hidden = false;
    if (submitButton) submitButton.disabled = true;

    try {
        const response = await ApiService.checkLicenseStatus(key);
        statusLabel.textContent = response.status || 'Unknown';
        expiryLabel.textContent = response.expiry || 'N/A';
        statusLabel.className = `status-value status-${String(response.status || 'unknown').toLowerCase()}`;
        resultDiv.hidden = false;
    } catch {
        statusLabel.textContent = 'Unavailable';
        expiryLabel.textContent = 'Try again later';
        statusLabel.className = 'status-value status-unknown';
        resultDiv.hidden = false;
    } finally {
        loading.hidden = true;
        if (submitButton) submitButton.disabled = false;
    }
}
