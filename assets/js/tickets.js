const form = document.getElementById('ticket-form');
const errorBox = document.getElementById('ticket-error');

async function ticketRequest(url, options = {}) {
    const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(data?.error || 'Request failed.'); error.status = response.status; throw error; }
    return data;
}
async function requireLogin() {
    try {
        const data = await ticketRequest('../api/auth/me');
        if (!data?.authenticated) {
            const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
            window.location.replace(`../login/?next=${next}`);
            return false;
        }
        return true;
    } catch {
        showError('We could not verify your login. Please try again.');
        return false;
    }
}
function showError(message) { if (!errorBox) return; errorBox.textContent = message; errorBox.hidden = false; }

void requireLogin();
form?.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.hidden = true;
    const category = document.getElementById('ticket-category')?.value || 'Other';
    const priority = document.getElementById('ticket-priority')?.value || 'Normal';
    const subject = document.getElementById('ticket-subject')?.value.trim() || '';
    const description = document.getElementById('ticket-description')?.value.trim() || '';
    if (subject.length < 3) return showError('Please enter a subject of at least 3 characters.');
    if (description.length < 10) return showError('Please provide at least a little detail about the issue.');
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = 'Creating ticket…'; }
    try {
        const data = await ticketRequest('../api/tickets', { method: 'POST', body: JSON.stringify({ category, priority, subject, description }) });
        window.location.replace(`../account/?ticket=${encodeURIComponent(data.ticket.id)}`);
    } catch (error) {
        if (error.status === 401) return window.location.replace(`../login/?next=${encodeURIComponent('/tickets/')}`);
        showError(error.message || 'Unable to create your ticket.');
        if (button) { button.disabled = false; button.textContent = button.dataset.originalText || 'Submit ticket'; }
    }
});
