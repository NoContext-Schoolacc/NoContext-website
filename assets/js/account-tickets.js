(() => {
    const list = document.getElementById('account-ticket-list');
    const conversation = document.getElementById('ticket-conversation');
    const messagesBox = document.getElementById('ticket-messages');
    const title = document.getElementById('ticket-conversation-title');
    const meta = document.getElementById('ticket-conversation-meta');
    const replyForm = document.getElementById('ticket-reply-form');
    const replyInput = document.getElementById('ticket-reply');
    const replyButton = document.getElementById('ticket-reply-button');
    const empty = document.getElementById('ticket-empty');
    let activeTicket = null;

    const escapeDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
    const api = async (url, options = {}) => {
        const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
        const data = await response.json().catch(() => null);
        if (!response.ok) { const error = new Error(data?.error || 'Request failed.'); error.status = response.status; throw error; }
        return data;
    };
    const messageNode = message => {
        const article = document.createElement('article'); article.className = `ticket-message ${message.author_type === 'user' ? 'user' : 'staff'}`;
        const author = document.createElement('div'); author.className = 'ticket-message-author'; author.textContent = message.author_type === 'staff' ? 'NoContext Staff' : (message.username || 'You');
        const body = document.createElement('div'); body.className = 'ticket-message-body'; body.textContent = message.body;
        const time = document.createElement('div'); time.className = 'ticket-message-time'; time.textContent = escapeDate(message.created_at);
        article.append(author, body, time); return article;
    };
    async function loadTickets(openId) {
        try {
            const data = await api('../api/tickets');
            list.replaceChildren();
            if (!data.tickets?.length) { empty.hidden = false; conversation.hidden = true; return; }
            empty.hidden = true;
            data.tickets.forEach(ticket => {
                const button = document.createElement('button'); button.type = 'button'; button.className = 'account-ticket-item'; button.dataset.ticketId = ticket.id;
                const icon = document.createElement('span'); icon.className = 'account-ticket-icon'; icon.innerHTML = '<i class="fas fa-ticket"></i>';
                const main = document.createElement('span'); main.className = 'account-ticket-main';
                const subject = document.createElement('span'); subject.className = 'account-ticket-subject'; subject.textContent = ticket.subject;
                const ticketMeta = document.createElement('span'); ticketMeta.className = 'account-ticket-meta'; ticketMeta.textContent = `#${ticket.id} · ${ticket.category} · ${ticket.priority}`;
                main.append(subject, ticketMeta);
                const status = document.createElement('span'); status.className = `account-ticket-status ${ticket.status === 'closed' ? 'closed' : ''}`; status.textContent = ticket.status;
                const arrow = document.createElement('span'); arrow.className = 'account-ticket-arrow'; arrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
                button.append(icon, main, status, arrow); button.addEventListener('click', () => openTicket(ticket.id)); list.append(button);
            });
            const requested = Number(openId);
            const selected = data.tickets.find(ticket => Number(ticket.id) === requested);
            await openTicket(selected ? selected.id : data.tickets[0].id);
        } catch (error) {
            empty.hidden = false; empty.textContent = error.status === 401 ? 'Please sign in to view your tickets.' : 'Unable to load your tickets right now.';
        }
    }
    async function openTicket(id) {
        try {
            const data = await api(`../api/tickets/${encodeURIComponent(id)}`); activeTicket = data.ticket;
            title.textContent = `#${data.ticket.id} · ${data.ticket.subject}`;
            meta.textContent = `${data.ticket.category} · ${data.ticket.priority} · ${data.ticket.status}`;
            messagesBox.replaceChildren(...(data.messages || []).map(messageNode)); conversation.hidden = false;
            const closed = data.ticket.status === 'closed'; replyForm.hidden = closed; document.getElementById('ticket-closed-note').hidden = !closed;
            messagesBox.scrollTop = messagesBox.scrollHeight;
        } catch { conversation.hidden = true; }
    }
    replyForm?.addEventListener('submit', async event => {
        event.preventDefault(); if (!activeTicket) return;
        const body = replyInput.value.trim(); if (!body) return;
        replyButton.disabled = true; replyButton.textContent = 'Sending…';
        try { await api(`../api/tickets/${activeTicket.id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); replyInput.value = ''; await openTicket(activeTicket.id); }
        catch (error) { alert(error.message || 'Unable to send your message.'); }
        finally { replyButton.disabled = false; replyButton.textContent = 'Send'; }
    });
    const params = new URLSearchParams(window.location.search); void loadTickets(params.get('ticket'));
})();
