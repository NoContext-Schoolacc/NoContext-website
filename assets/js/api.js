/**
 * Frontend API service.
 *
 * Security note: secrets, license databases, key generation, payment
 * creation, and verification must live on a trusted backend.
 * This frontend intentionally contains no secret credentials or demo keys.
 */

const API_CONFIG = Object.freeze({
    BASE_URL: '',
    ENDPOINTS: Object.freeze({
        CLAIM_KEY: '/api/keys/claim',
        VALIDATE_LICENSE: '/api/license/validate',
        CREATE_STRIPE_SESSION: '/api/store/checkout'
    })
});

function apiUrl(endpoint) {
    if (!endpoint.startsWith('/')) throw new Error('Invalid API endpoint.');
    return `${API_CONFIG.BASE_URL}${endpoint}`;
}

async function request(endpoint, options = {}) {
    const response = await fetch(apiUrl(endpoint), {
        ...options,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        },
        cache: 'no-store',
        redirect: 'error'
    });

    if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
    return response.json();
}

const ApiService = {
    async claimFreeKey(token, productId) {
        if (typeof token !== 'string' || token.length < 1 || token.length > 512) {
            throw new Error('Invalid or expired verification token.');
        }
        if (typeof productId !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(productId)) {
            throw new Error('Invalid product.');
        }

        return request(API_CONFIG.ENDPOINTS.CLAIM_KEY, {
            method: 'POST',
            body: JSON.stringify({ token, productId })
        });
    },

    async checkLicenseStatus(key) {
        if (typeof key !== 'string' || key.length < 1 || key.length > 256) {
            return { success: false, status: 'Invalid' };
        }

        return request(API_CONFIG.ENDPOINTS.VALIDATE_LICENSE, {
            method: 'POST',
            body: JSON.stringify({ key })
        });
    },

    async createCheckoutSession(productId) {
        if (typeof productId !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(productId)) {
            throw new Error('Invalid product.');
        }

        return request(API_CONFIG.ENDPOINTS.CREATE_STRIPE_SESSION, {
            method: 'POST',
            body: JSON.stringify({ productId })
        });
    }
};
