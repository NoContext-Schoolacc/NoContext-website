const form = document.getElementById('contact-ticket-form');
const errorBox = document.getElementById('ticket-error');
const successBox = document.getElementById('ticket-success');

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    successBox.hidden = true;

    const category = document.getElementById('ticket-category').value;
    const priority = document.getElementById('ticket-priority').value;
    const subject = document.getElementById('ticket-subject').value.trim();
    const description = document.getElementById('ticket-description').value.trim();

    if (subject.length < 3) {
        errorBox.textContent = 'Please enter a subject of at least 3 characters.';
        errorBox.hidden = false;
        return;
    }
    if (description.length < 10) {
        errorBox.textContent = 'Please provide at least 10 characters describing the issue.';
        errorBox.hidden = false;
        return;
    }

    let username = 'Guest';
    try {
        const response = await fetch('../api/auth/me', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (data?.authenticated && data?.user?.username) username = data.user.username;
    } catch {}

    const body = [
        '## Support ticket', '',
        `**Category:** ${category}`,
        `**Priority:** ${priority}`,
        `**Account:** ${username}`, '',
        '### Description', description, '',
        'Please do not include passwords, API keys, session tokens, or other secrets.'
    ].join('\n');

    const url = new URL('https://github.com/NoContext-Schoolacc/NoContext-website/issues/new');
    url.searchParams.set('title', `[${category}] ${subject}`.slice(0, 180));
    url.searchParams.set('body', body);

    successBox.innerHTML = 'Your ticket is ready. <a href="' + url.toString() + '">Continue to submit it</a> in the support tracker.';
    successBox.hidden = false;
});
