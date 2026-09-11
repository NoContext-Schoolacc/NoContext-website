const form = document.getElementById('ticket-form');
const errorBox = document.getElementById('ticket-error');

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;

    const category = document.getElementById('ticket-category')?.value || 'Other';
    const priority = document.getElementById('ticket-priority')?.value || 'Normal';
    const subject = document.getElementById('ticket-subject')?.value.trim() || '';
    const description = document.getElementById('ticket-description')?.value.trim() || '';

    if (subject.length < 3) return showError('Please enter a subject of at least 3 characters.');
    if (description.length < 10) return showError('Please provide at least a little detail about the issue.');

    let username = 'Guest';
    try {
        const response = await fetch('../api/auth/me', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (data?.authenticated && data?.user?.username) username = data.user.username;
    } catch {
        // A ticket can still be prepared for a guest when the auth service is unavailable.
    }

    const title = `[${category}] ${subject}`.slice(0, 180);
    const body = [
        '## Support ticket',
        '',
        `**Category:** ${category}`,
        `**Priority:** ${priority}`,
        `**Account:** ${username}`,
        '',
        '### Description',
        description,
        '',
        '### Safety note',
        'The submitter was instructed not to include passwords, API keys, or other secrets.'
    ].join('\n');

    const url = new URL('https://github.com/NoContext-Schoolacc/NoContext-website/issues/new');
    url.searchParams.set('title', title);
    url.searchParams.set('body', body);
    window.location.assign(url.toString());
});
