import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(crypto.scrypt);
const app = express();
const port = Number(process.env.PORT || 3000);
const nodeEnv = process.env.NODE_ENV || 'development';
const publicOriginInput = process.env.PUBLIC_ORIGIN || '';
const hmacSecret = process.env.LICENSE_HMAC_SECRET;
const adminApiKey = process.env.ADMIN_API_KEY;
const discordClientId = process.env.DISCORD_CLIENT_ID || '';
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET || '';
const discordRedirectUri = process.env.DISCORD_REDIRECT_URI || '';
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
const SESSION_COOKIE = nodeEnv === 'production' ? '__Host-nc_session' : 'nc_session';
const DISCORD_STATE_COOKIE = nodeEnv === 'production' ? '__Host-nc_discord_state' : 'nc_discord_state';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DISCORD_STATE_TTL_SECONDS = 10 * 60;

if (!hmacSecret || hmacSecret.length < 32) {
    throw new Error('LICENSE_HMAC_SECRET must be set to a random value of at least 32 characters.');
}
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured.');
}
if (adminApiKey && adminApiKey.length < 32) {
    throw new Error('ADMIN_API_KEY must be at least 32 characters when configured.');
}
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5.');
}
if (discordClientId && (!discordClientSecret || !discordRedirectUri)) {
    throw new Error('DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI are required when DISCORD_CLIENT_ID is configured.');
}

let publicOrigin = '';
if (nodeEnv === 'production' && !publicOriginInput) {
    throw new Error('PUBLIC_ORIGIN must be configured in production.');
}
if (publicOriginInput) {
    try {
        const parsedOrigin = new URL(publicOriginInput);
        if (!['http:', 'https:'].includes(parsedOrigin.protocol)) throw new Error('unsupported protocol');
        if (!['', '/'].includes(parsedOrigin.pathname) || parsedOrigin.search || parsedOrigin.hash) {
            throw new Error('origin must not include a path, query, or hash');
        }
        publicOrigin = parsedOrigin.origin;
    } catch {
        throw new Error('PUBLIC_ORIGIN must be a valid origin like https://example.com.');
    }
}

if (discordRedirectUri) {
    try {
        const parsedRedirect = new URL(discordRedirectUri);
        if (!['http:', 'https:'].includes(parsedRedirect.protocol)) throw new Error('unsupported protocol');
        if (parsedRedirect.username || parsedRedirect.password || parsedRedirect.hash) throw new Error('invalid redirect');
    } catch {
        throw new Error('DISCORD_REDIRECT_URI must be a valid callback URL.');
    }
}

let allowedWorkinkLinks;
try {
    allowedWorkinkLinks = JSON.parse(process.env.WORKINK_LINK_IDS || '{}');
} catch {
    throw new Error('WORKINK_LINK_IDS must be valid JSON, for example {"external":12345}.');
}

if (!allowedWorkinkLinks || typeof allowedWorkinkLinks !== 'object' || Array.isArray(allowedWorkinkLinks)) {
    throw new Error('WORKINK_LINK_IDS must be a JSON object mapping products to Work.ink link IDs.');
}

const databaseSslEnabled = nodeEnv === 'production';
const databaseSslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
const databaseSsl = databaseSslEnabled
    ? {
        rejectUnauthorized: databaseSslRejectUnauthorized,
        ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {})
    }
    : false;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

app.disable('x-powered-by');
app.set('trust proxy', trustProxyHops);
app.use(helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));
app.use(express.json({ limit: '16kb', strict: true }));

function noStore(_req, res, next) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    next();
}

app.use('/api', noStore);
app.use('/health', noStore);

if (publicOrigin) {
    app.use((req, res, next) => {
        const origin = req.get('origin');
        if (origin && origin !== publicOrigin) {
            return res.status(403).json({ success: false, error: 'Origin not allowed.' });
        }
        if (origin) res.setHeader('Access-Control-Allow-Origin', publicOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });
}

const claimLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: 'Too many claim attempts. Try again later.' } });
const validateLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: 'Too many validation attempts. Try again later.' } });
const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: 'Too many checkout attempts. Try again later.' } });
const healthLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { ok: false, error: 'Too many health checks. Try again later.' } });
const adminLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: 'Too many admin requests. Try again later.' } });
const telemetryLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: 'Too many telemetry events.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: 'Too many authentication attempts. Try again later.' } });

function digest(value) {
    return crypto.createHmac('sha256', hmacSecret).update(value).digest('hex');
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(req, res, next) {
    if (!adminApiKey) return res.status(503).json({ success: false, error: 'Admin API is not configured.' });
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match || !safeEqual(match[1], adminApiKey)) return res.status(401).json({ success: false, error: 'Unauthorized.' });
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
}

function parseCookies(header) {
    const cookies = {};
    if (typeof header !== 'string') return cookies;
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (name) cookies[name] = value;
    }
    return cookies;
}

function setCookie(res, name, value, maxAgeSeconds) {
    const secure = nodeEnv === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

function clearCookie(res, name) {
    const secure = nodeEnv === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function setSessionCookie(res, token) {
    setCookie(res, SESSION_COOKIE, token, SESSION_TTL_SECONDS);
}

function clearSessionCookie(res) {
    clearCookie(res, SESSION_COOKIE);
}

async function createSession(userId, res) {
    await pool.query('DELETE FROM sessions WHERE user_id = $1 OR expires_at <= NOW()', [userId]);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = digest(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    await pool.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, tokenHash, expiresAt]);
    setSessionCookie(res, token);
    return expiresAt;
}

async function currentUser(req) {
    const cookies = parseCookies(req.get('cookie'));
    const encodedToken = cookies[SESSION_COOKIE];
    if (!encodedToken) return null;
    let token;
    try { token = decodeURIComponent(encodedToken); } catch { return null; }
    if (token.length < 32 || token.length > 128) return null;
    const result = await pool.query(
        `SELECT u.id, u.username, u.discord_id, u.discord_username, u.avatar_hash
         FROM sessions s INNER JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`,
        [digest(token)]
    );
    return result.rowCount ? result.rows[0] : null;
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
    return { salt: salt.toString('base64'), hash: Buffer.from(derivedKey).toString('base64') };
}

async function verifyPassword(password, saltBase64, storedHashBase64) {
    if (!saltBase64 || !storedHashBase64) return false;
    const salt = Buffer.from(saltBase64, 'base64');
    const expected = Buffer.from(storedHashBase64, 'base64');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const derivedKey = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
    return safeEqual(Buffer.from(derivedKey).toString('base64'), expected.toString('base64'));
}

function cleanUsername(value) {
    if (typeof value !== 'string') return null;
    const username = value.trim();
    return /^[A-Za-z0-9_]{3,24}$/.test(username) ? username : null;
}

function cleanPassword(value) {
    return typeof value === 'string' && value.length >= 10 && value.length <= 128 ? value : null;
}

function discordUsername(value) {
    if (typeof value !== 'string') return 'Discord User';
    const trimmed = value.trim().slice(0, 100);
    return trimmed || 'Discord User';
}

function cleanDiscordId(value) {
    return typeof value === 'string' && /^\d{1,32}$/.test(value) ? value : null;
}

async function discordUserInfo(accessToken) {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store'
    });
    if (!response.ok) return null;
    const data = await response.json();
    const id = cleanDiscordId(data?.id);
    if (!id) return null;
    return { id, username: discordUsername(data?.global_name || data?.username), avatar: typeof data?.avatar === 'string' ? data.avatar.slice(0, 64) : null };
}

function randomUsernameFromDiscord(profile) {
    const base = profile.username.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 20) || 'DiscordUser';
    return base;
}

async function findAvailableUsername(base) {
    const safeBase = base.slice(0, 24) || 'User';
    let candidate = safeBase;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const exists = await pool.query('SELECT 1 FROM users WHERE username_normalized = $1 LIMIT 1', [candidate.toLowerCase()]);
        if (!exists.rowCount) return candidate;
        const suffix = crypto.randomInt(1000, 10000).toString();
        candidate = `${safeBase.slice(0, 24 - suffix.length - 1)}_${suffix}`;
    }
    throw new Error('Unable to create a unique username.');
}

function discordAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: discordClientId,
        response_type: 'code',
        redirect_uri: discordRedirectUri,
        scope: 'identify',
        state
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function createDiscordState(res) {
    const state = crypto.randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM discord_oauth_states WHERE expires_at <= NOW()');
    await pool.query('INSERT INTO discord_oauth_states (state_hash, expires_at) VALUES ($1, NOW() + INTERVAL \'10 minutes\')', [digest(state)]);
    setCookie(res, DISCORD_STATE_COOKIE, state, DISCORD_STATE_TTL_SECONDS);
    return state;
}

async function consumeDiscordState(req, res) {
    const cookies = parseCookies(req.get('cookie'));
    const encodedState = cookies[DISCORD_STATE_COOKIE];
    clearCookie(res, DISCORD_STATE_COOKIE);
    if (!encodedState) return false;
    let state;
    try { state = decodeURIComponent(encodedState); } catch { return false; }
    if (state.length < 32 || state.length > 128) return false;
    const result = await pool.query(
        'DELETE FROM discord_oauth_states WHERE state_hash = $1 AND expires_at > NOW() RETURNING state_hash',
        [digest(state)]
    );
    return result.rowCount === 1;
}

async function exchangeDiscordCode(code) {
    const body = new URLSearchParams({
        client_id: discordClientId,
        client_secret: discordClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: discordRedirectUri
    });
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(8000),
        cache: 'no-store'
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.access_token === 'string' ? data.access_token : null;
}

function authRedirectPath(req) {
    const requested = typeof req.query.redirect === 'string' ? req.query.redirect : '../account/';
    if (requested.startsWith('/') && !requested.startsWith('//')) return requested;
    return '../account/';
}

function redirectToAuthResult(res, status) {
    const target = publicOrigin ? new URL('/login/', publicOrigin) : new URL('/login/', 'http://127.0.0.1');
    target.searchParams.set('discord', status);
    res.redirect(303, target.toString());
}

function generateLicenseKey() {
    return `NC-${crypto.randomBytes(8).toString('base64url').toUpperCase().slice(0, 8)}-${crypto.randomBytes(8).toString('base64url').toString().toUpperCase().slice(0, 8)}-${crypto.randomBytes(8).toString('base64url').toUpperCase().slice(0, 8)}`;
}

function cleanProductId(value) {
    return typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
}

function expectedLinkId(productId) {
    const value = allowedWorkinkLinks[productId];
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function verifyWorkinkToken(token, productId) {
    if (typeof token !== 'string' || token.length < 1 || token.length > 512) return { valid: false, reason: 'invalid_token' };
    const expectedLink = expectedLinkId(productId);
    if (!expectedLink) return { valid: false, reason: 'product_not_configured' };
    const response = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) return { valid: false, reason: 'verification_unavailable' };
    let data;
    try { data = await response.json(); } catch { return { valid: false, reason: 'verification_unavailable' }; }
    if (data?.valid !== true) return { valid: false, reason: 'invalid_or_expired' };
    if (Number(data.info?.linkId) !== expectedLink) return { valid: false, reason: 'wrong_link' };
    const expiresAfter = Number(data.info?.expiresAfter);
    if (!Number.isFinite(expiresAfter) || expiresAfter <= Date.now()) return { valid: false, reason: 'invalid_or_expired' };
    return { valid: true, info: data.info || {} };
}

app.get('/health', healthLimiter, async (_req, res) => {
    try { await pool.query('SELECT 1'); return res.json({ ok: true }); } catch { return res.status(503).json({ ok: false }); }
});

app.get('/api/auth/discord', authLimiter, async (req, res) => {
    if (!discordClientId || !discordClientSecret || !discordRedirectUri) {
        return res.status(503).json({ success: false, error: 'Discord login is not configured.' });
    }
    try {
        const state = await createDiscordState(res);
        return res.redirect(302, discordAuthorizeUrl(state));
    } catch {
        return res.status(500).json({ success: false, error: 'Unable to start Discord login.' });
    }
});

app.get('/api/auth/discord/callback', authLimiter, async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const error = typeof req.query.error === 'string' ? req.query.error : '';
    if (!await consumeDiscordState(req, res)) return redirectToAuthResult(res, 'state_error');
    if (error || !code || code.length > 2048) return redirectToAuthResult(res, 'cancelled');

    try {
        const accessToken = await exchangeDiscordCode(code);
        if (!accessToken) return redirectToAuthResult(res, 'exchange_error');
        const profile = await discordUserInfo(accessToken);
        if (!profile) return redirectToAuthResult(res, 'profile_error');

        let userResult = await pool.query(
            `SELECT id, username FROM users WHERE discord_id = $1 LIMIT 1`,
            [profile.id]
        );

        let user;
        if (userResult.rowCount) {
            user = userResult.rows[0];
            await pool.query(
                'UPDATE users SET discord_username = $2, avatar_hash = $3, last_login_at = NOW() WHERE id = $1',
                [user.id, profile.username, profile.avatar]
            );
        } else {
            const username = await findAvailableUsername(randomUsernameFromDiscord(profile));
            const insert = await pool.query(
                `INSERT INTO users (username, username_normalized, discord_id, discord_username, avatar_hash, last_login_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 RETURNING id, username`,
                [username, username.toLowerCase(), profile.id, profile.username, profile.avatar]
            );
            user = insert.rows[0];
        }

        await createSession(user.id, res);
        return res.redirect(303, publicOrigin ? new URL('/account/', publicOrigin).toString() : '/account/');
    } catch {
        return redirectToAuthResult(res, 'error');
    }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
    const username = cleanUsername(req.body?.username);
    const password = cleanPassword(req.body?.password);
    if (!username || !password) return res.status(400).json({ success: false, error: 'Use a 3-24 character username and a 10-128 character password.' });
    try {
        const passwordData = await hashPassword(password);
        const result = await pool.query(
            'INSERT INTO users (username, username_normalized, password_hash, password_salt) VALUES ($1, $2, $3, $4) RETURNING id, username',
            [username, username.toLowerCase(), passwordData.hash, passwordData.salt]
        );
        const user = result.rows[0];
        await createSession(user.id, res);
        return res.status(201).json({ success: true, user: { username: user.username } });
    } catch (error) {
        if (error?.code === '23505') return res.status(409).json({ success: false, error: 'That username is already in use.' });
        return res.status(500).json({ success: false, error: 'Unable to create the account.' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    const username = cleanUsername(req.body?.username);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || password.length > 128) return res.status(400).json({ success: false, error: 'Invalid username or password.' });
    try {
        const result = await pool.query('SELECT id, username, password_hash, password_salt FROM users WHERE username_normalized = $1 LIMIT 1', [username.toLowerCase()]);
        const user = result.rows[0];
        const passwordMatches = user ? await verifyPassword(password, user.password_salt, user.password_hash) : false;
        if (!user || !passwordMatches) return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
        await createSession(user.id, res);
        return res.json({ success: true, user: { username: user.username } });
    } catch { return res.status(500).json({ success: false, error: 'Unable to sign in right now.' }); }
});

app.post('/api/auth/logout', authLimiter, async (req, res) => {
    const cookies = parseCookies(req.get('cookie'));
    const encodedToken = cookies[SESSION_COOKIE];
    try {
        if (encodedToken) {
            const token = decodeURIComponent(encodedToken);
            if (token.length >= 32 && token.length <= 128) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
        }
    } catch { /* Always clear browser cookie. */ }
    clearSessionCookie(res);
    return res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const user = await currentUser(req);
        if (!user) return res.json({ success: true, authenticated: false });
        return res.json({ success: true, authenticated: true, user: { username: user.username, discord: Boolean(user.discord_id) } });
    } catch { return res.status(500).json({ success: false, error: 'Unable to check the current session.' }); }
});

app.post('/api/keys/claim', claimLimiter, async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const productId = cleanProductId(req.body?.productId);
    if (!productId) return res.status(400).json({ success: false, error: 'Invalid product.' });
    const tokenHash = digest(token);
    const ipHash = digest(req.ip || 'unknown');
    try {
        const verification = await verifyWorkinkToken(token, productId);
        const outcome = verification.valid ? 'verified' : verification.reason;
        await pool.query('INSERT INTO claim_attempts (token_hash, product_id, outcome, ip_hash) VALUES ($1, $2, $3, $4)', [tokenHash, productId, outcome, ipHash]);
        if (!verification.valid) return res.status(verification.reason === 'verification_unavailable' ? 503 : 400).json({ success: false, error: 'Verification failed.' });
        const reservation = await pool.query(`INSERT INTO claim_locks (token_hash, product_id, status) VALUES ($1, $2, 'pending') ON CONFLICT (token_hash) DO NOTHING RETURNING token_hash`, [tokenHash, productId]);
        if (!reservation.rowCount) return res.status(409).json({ success: false, error: 'This verification has already been used.' });
        const licenseKey = generateLicenseKey();
        const keyHash = digest(licenseKey);
        const expiresAt = new Date(Math.min(Date.now() + 24 * 60 * 60 * 1000, Number(verification.info.expiresAfter)));
        const linkId = expectedLinkId(productId);
        try {
            const result = await pool.query(`INSERT INTO licenses (key_hash, product_id, status, expires_at, workink_token_hash, workink_link_id, claimed_at) VALUES ($1, $2, 'active', $3, $4, $5, NOW()) RETURNING id`, [keyHash, productId, expiresAt, tokenHash, linkId]);
            const lockUpdate = await pool.query(`UPDATE claim_locks SET status = 'issued', issued_at = NOW(), license_id = $2 WHERE token_hash = $1 AND status = 'pending'`, [tokenHash, result.rows[0].id]);
            if (lockUpdate.rowCount !== 1) throw new Error('Unable to finalize claim reservation.');
        } catch (error) {
            await pool.query('DELETE FROM claim_locks WHERE token_hash = $1 AND status = \'pending\'', [tokenHash]);
            throw error;
        }
        try {
            const consumeResponse = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}?deleteToken=1`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
            if (!consumeResponse.ok) console.warn(`Work.ink token consumption failed with HTTP ${consumeResponse.status}.`);
        } catch { console.warn('Work.ink token consumption request failed. Local claim reservation remains authoritative.'); }
        return res.json({ success: true, key: licenseKey, expiresAt: expiresAt.toISOString() });
    } catch { return res.status(500).json({ success: false, error: 'Unable to process verification.' }); }
});

app.post('/api/license/validate', validateLimiter, async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!/^NC-[A-Z0-9_-]{8}-[A-Z0-9_-]{8}-[A-Z0-9_-]{8}$/.test(key)) return res.json({ success: false, status: 'Invalid' });
    try {
        const keyHash = digest(key);
        const result = await pool.query('SELECT status, expires_at, product_id FROM licenses WHERE key_hash = $1 LIMIT 1', [keyHash]);
        if (!result.rowCount) return res.json({ success: false, status: 'Invalid' });
        const license = result.rows[0];
        const expiry = new Date(license.expires_at).getTime();
        if (license.status === 'revoked') return res.json({ success: true, status: 'Revoked', expiry: license.expires_at });
        if (!Number.isFinite(expiry) || expiry <= Date.now() || license.status === 'expired') {
            await pool.query('UPDATE licenses SET status = \'expired\' WHERE key_hash = $1', [keyHash]);
            return res.json({ success: true, status: 'Expired', expiry: license.expires_at });
        }
        await pool.query('UPDATE licenses SET last_validated_at = NOW() WHERE key_hash = $1', [keyHash]);
        return res.json({ success: true, status: 'Active', expiry: license.expires_at, product: license.product_id });
    } catch { return res.status(500).json({ success: false, error: 'Unable to validate license.' }); }
});

app.post('/api/store/checkout', checkoutLimiter, async (req, res) => {
    const productId = cleanProductId(req.body?.productId);
    if (!productId || !expectedLinkId(productId)) return res.status(400).json({ success: false, error: 'Invalid product.' });
    return res.status(503).json({ success: false, error: 'Checkout is not configured on the backend.' });
});

app.post('/api/telemetry/client-error', telemetryLimiter, async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 500).replace(/https?:\/\/\S+/gi, '[url]') : '';
    const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, 160) : '';
    const kind = typeof req.body?.kind === 'string' ? req.body.kind.slice(0, 32) : 'error';
    const ipHash = digest(req.ip || 'unknown');
    if (!message) return res.status(400).json({ success: false, error: 'Invalid telemetry event.' });
    try { console.warn('Client error telemetry:', { kind, message, page, ipHash }); return res.status(202).json({ success: true }); }
    catch { return res.status(500).json({ success: false }); }
});

app.get('/api/admin/overview', adminLimiter, requireAdmin, async (_req, res) => {
    try {
        const [statsResult, recentResult] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active' AND expires_at > NOW())::int AS active, COUNT(*) FILTER (WHERE status = 'expired' OR (status = 'active' AND expires_at <= NOW()))::int AS expired, COUNT(*) FILTER (WHERE status = 'revoked')::int AS revoked FROM licenses`),
            pool.query(`SELECT id, product_id, status, expires_at, claimed_at, created_at, last_validated_at FROM licenses ORDER BY created_at DESC LIMIT 100`)
        ]);
        return res.json({ success: true, stats: statsResult.rows[0], licenses: recentResult.rows });
    } catch { return res.status(500).json({ success: false, error: 'Unable to load admin data.' }); }
});

app.post('/api/admin/licenses/revoke', adminLimiter, requireAdmin, async (req, res) => {
    const licenseId = Number(req.body?.licenseId);
    if (!Number.isSafeInteger(licenseId) || licenseId <= 0) return res.status(400).json({ success: false, error: 'Invalid license ID.' });
    try {
        const result = await pool.query(`UPDATE licenses SET status = 'revoked' WHERE id = $1 AND status <> 'revoked' RETURNING id, status`, [licenseId]);
        if (!result.rowCount) return res.status(404).json({ success: false, error: 'License not found.' });
        return res.json({ success: true, license: result.rows[0] });
    } catch { return res.status(500).json({ success: false, error: 'Unable to revoke license.' }); }
});

app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found.' }));

app.listen(port, () => console.log(`NoContext backend listening on port ${port}`));
