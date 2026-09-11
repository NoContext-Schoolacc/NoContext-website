const state = {
    mode: 'login',
    busy: false
};

document.addEventListener('DOMContentLoaded', () => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const form = document.getElementById('auth-form');
    const username = document.getElementById('auth-username');
    const password = document.getElementById('auth-password');
    const confirmPassword = document.getElementById('auth-confirm-password');
    const confirmWrap = document.getElementById('confirm-password-wrap');
    const title = document.getElementById('auth-title');
    const submit = document.getElementById('auth-submit');
    const message = document.getElementById('auth-message');
    const switchLink = document.getElementById('auth-switch-link');
    const switchText = document.getElementById('auth-switch-text');
    const discordButton = document.getElementById('discord-login');

    const showMessage = (text, kind = 'error') => {
        message.textContent = text;
        message.className = `auth-message ${kind}`;
    };

    const setMode = mode => {
        state.mode = mode === 'register' ? 'register' : 'login';
        const registering = state.mode === 'register';
        loginTab.classList.toggle('active', !registering);
        registerTab.classList.toggle('active', registering);
        loginTab.setAttribute('aria-selected', String(!registering));
        registerTab.setAttribute('aria-selected', String(registering));
        confirmWrap.hidden = !registering;
        confirmPassword.required = registering;
        password.autocomplete = registering ? 'new-password' : 'current-password';
        title.textContent = registering ? 'Create your account' : 'Welcome back';
        submit.innerHTML = registering ? 'Create account <i class="fas fa-arrow-right"></i>' : 'Sign in <i class="fas fa-arrow-right"></i>';
        switchText.textContent = registering ? 'Already have an account?' : 'Need an account?';
        switchLink.textContent = registering ? 'Sign in' : 'Create one';
        switchLink.dataset.mode = registering ? 'login' : 'register';
        form.reset();
        if (!state.discordMessage) {
            message.textContent = '';
            message.className = 'auth-message';
        }
        username.focus();
    };

    const setBusy = busy => {
        state.busy = busy;
        form.classList.toggle('auth-loading', busy);
        submit.disabled = busy;
        loginTab.disabled = busy;
        registerTab.disabled = busy;
        discordButton.disabled = busy;
        submit.innerHTML = busy
            ? 'Please wait <i class="fas fa-spinner fa-spin"></i>'
            : (state.mode === 'register' ? 'Create account <i class="fas fa-arrow-right"></i>' : 'Sign in <i class="fas fa-arrow-right"></i>');
    };

    loginTab.addEventListener('click', () => setMode('login'));
    registerTab.addEventListener('click', () => setMode('register'));
    switchLink.addEventListener('click', event => {
        event.preventDefault();
        if (!state.busy) setMode(switchLink.dataset.mode);
    });

    discordButton.addEventListener('click', async () => {
        if (state.busy) return;
        discordButton.disabled = true;
        discordButton.classList.add('auth-discord-loading');
        showMessage('Opening Discord…', 'success');
        try {
            await ApiService.startDiscordLogin();
        } catch (error) {
            discordButton.disabled = false;
            discordButton.classList.remove('auth-discord-loading');
            showMessage(error instanceof Error ? error.message : 'Unable to start Discord login.');
        }
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (state.busy) return;
        const userValue = username.value.trim();
        const passwordValue = password.value;
        if (!/^[A-Za-z0-9_]{3,24}$/.test(userValue)) {
            showMessage('Username must be 3-24 characters using letters, numbers, or underscores.');
            return;
        }
        if (passwordValue.length < 10 || passwordValue.length > 128) {
            showMessage('Password must be 10-128 characters long.');
            return;
        }
        if (state.mode === 'register' && passwordValue !== confirmPassword.value) {
            showMessage('Passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            const response = state.mode === 'register'
                ? await ApiService.register(userValue, passwordValue)
                : await ApiService.login(userValue, passwordValue);
            if (!response?.success) throw new Error(response?.error || 'Authentication failed.');
            showMessage(state.mode === 'register' ? 'Account created. You are now signed in.' : 'Signed in successfully.', 'success');
            setTimeout(() => window.location.assign('../account/'), 700);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : 'Unable to complete authentication.');
        } finally {
            setBusy(false);
        }
    });

    setMode('login');

    const discordResult = new URLSearchParams(window.location.search).get('discord');
    const discordMessages = {
        state_error: 'Discord login expired or failed its security check. Please try again.',
        cancelled: 'Discord login was cancelled.',
        exchange_error: 'Discord authorization could not be completed.',
        profile_error: 'We could not read your Discord profile.',
        error: 'Discord login could not be completed.'
    };
    if (discordResult && discordMessages[discordResult]) {
        state.discordMessage = true;
        showMessage(discordMessages[discordResult]);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
