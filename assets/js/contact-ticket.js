const form = document.getElementById('contact-ticket-form');
const errorBox = document.getElementById('ticket-error');
const successBox = document.getElementById('ticket-success');

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
    } catch { errorBox.textContent = 'We could not verify your login. Please try again.'; errorBox.hidden = false; return false; }
}
void requireLogin();

form?.addEventListener('submit', async event => {
    event.preventDefault(); errorBox.hidden = true; successBox.hidden = true;
    const category = document.getElementById('ticket-category')?.value || 'Other';
    const priority = document.getElementById('ticket-priority')?.value || 'Normal';
    const subject = document.getElementById('ticket-subject')?.value.trim() || '';
    const description = document.getElementById('ticket-description')?.value.trim() || '';
    if (subject.length < 3) { errorBox.textContent = 'Please enter a subject of at least 3 characters.'; errorBox.hidden = false; return; }
    if (description.length < 10) { errorBox.textContent = 'Please provide at least 10 characters describing the issue.'; errorBox.hidden = false; return; }
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = 'Creating ticket…'; }
    try {
        const data = await ticketRequest('../api/tickets', { method: 'POST', body: JSON.stringify({ category, priority, subject, description }) });
        successBox.replaceChildren();
        const message = document.createElement('span'); message.className = 'ticket-success-message'; message.textContent = `Ticket #${data.ticket.id} created. You can continue the conversation from your dashboard.`;
        const link = document.createElement('a'); link.className = 'ticket-success-action'; link.href = `../account/?ticket=${encodeURIComponent(data.ticket.id)}`; link.textContent = 'Open my ticket →';
        successBox.append(message, link); successBox.hidden = false; form.reset();
    } catch (error) {
        if (error.status === 401) return window.location.replace(`../login/?next=${encodeURIComponent('/contact/')}`);
        errorBox.textContent = error.message || 'Unable to create your ticket.'; errorBox.hidden = false;
    } finally { if (button) { button.disabled = false; button.textContent = button.dataset.originalText || 'Submit ticket'; } }
});
