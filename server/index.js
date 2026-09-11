import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const publicOrigin = process.env.PUBLIC_ORIGIN || '';
const hmacSecret = process.env.LICENSE_HMAC_SECRET;
const workinkLinkId = Number(process.env.WORKINK_LINK_ID || 0);

if (!hmacSecret || hmacSecret.length < 32) {
    throw new Error('LICENSE_HMAC_SECRET must be set to a random value of at least 32 characters.');
}
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured.');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

if (publicOrigin) {
    app.use((req, res, next) => {
        const origin = req.get('origin');
        if (origin && origin !== publicOrigin) {
            return res.status(403).json({ success: false, error: 'Origin not allowed.' });
        }
        if (origin) res.setHeader('Access-Control-Allow-Origin', publicOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });
}

const claimLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: 'Too many claim attempts. Try again later.' }
});

const validateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: 'Too many validation attempts. Try again later.' }
});

function digest(value) {
    return crypto.createHmac('sha256', hmacSecret).update(value).digest('hex');
}

function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
        return false;
    }
}

function generateLicenseKey() {
    const bytes = crypto.randomBytes(24).toString('base64url').toUpperCase();
    return `NC-${bytes.slice(0, 8)}-${bytes.slice(8, 16)}-${bytes.slice(16, 24)}`;
}

function cleanProductId(value) {
    return typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
}

async function verifyWorkinkToken(token) {
    if (typeof token !== 'string' || token.length < 1 || token.length > 512) {
        return { valid: false, reason: 'invalid_token' };
    }

    const encodedToken = encodeURIComponent(token);
    const response = await fetch(`https://work.ink/_api/v2/token/isValid/${encodedToken}` , {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store'
    });

    if (!response.ok) return { valid: false, reason: 'verification_unavailable' };

    const data = await response.json();
    if (data.valid !== true) return { valid: false, reason: 'invalid_or_expired' };

    if (workinkLinkId && Number(data.info?.linkId) !== workinkLinkId) {
        return { valid: false, reason: 'wrong_link' };
    }

    return { valid: true, info: data.info || {} };
}

app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true });
    } catch {
        res.status(503).json({ ok: false });
    }
});

app.post('/api/keys/claim', claimLimiter, async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const productId = cleanProductId(req.body?.productId) || 'external';
    const tokenHash = digest(token);
    const ipHash = digest(req.ip || 'unknown');

    try {
        const verification = await verifyWorkinkToken(token);
        const outcome = verification.valid ? 'verified' : verification.reason;

        await pool.query(
            'INSERT INTO claim_attempts (token_hash, product_id, outcome, ip_hash) VALUES ($1, $2, $3, $4)',
            [tokenHash, productId, outcome, ipHash]
        );

        if (!verification.valid) {
            const status = verification.reason === 'verification_unavailable' ? 503 : 400;
            return res.status(status).json({ success: false, error: 'Verification failed.' });
        }

        const tokenWasUsed = await pool.query(
            'SELECT id FROM licenses WHERE workink_token_hash = $1 LIMIT 1',
            [tokenHash]
        );
        if (tokenWasUsed.rowCount) {
            return res.status(409).json({ success: false, error: 'This verification has already been used.' });
        }

        const licenseKey = generateLicenseKey();
        const keyHash = digest(licenseKey);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await pool.query(
            `INSERT INTO licenses
                (key_hash, product_id, status, expires_at, workink_token_hash, workink_link_id, claimed_at)
             VALUES ($1, $2, 'active', $3, $4, $5, NOW())`,
            [keyHash, productId, expiresAt, tokenHash, Number(verification.info.linkId) || null]
        );

        // Consume the Work.ink token only after our database transaction succeeds.
        const consumeResponse = await fetch(
            `https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}?deleteToken=1`,
            { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store' }
        );

        if (!consumeResponse.ok) {
            await pool.query('DELETE FROM licenses WHERE key_hash = $1', [keyHash]);
            return res.status(503).json({ success: false, error: 'Verification could not be finalized.' });
        }

        return res.json({ success: true, key: licenseKey, expiresAt: expiresAt.toISOString() });
    } catch {
        return res.status(500).json({ success: false, error: 'Unable to process verification.' });
    }
});

app.post('/api/license/validate', validateLimiter, async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!/^NC-[A-Z0-9_-]{8}-[A-Z0-9_-]{8}-[A-Z0-9_-]{8}$/.test(key)) {
        return res.json({ success: false, status: 'Invalid' });
    }

    try {
        const keyHash = digest(key);
        const result = await pool.query(
            `SELECT status, expires_at, product_id
             FROM licenses
             WHERE key_hash = $1
             LIMIT 1`,
            [keyHash]
        );

        if (!result.rowCount) return res.json({ success: false, status: 'Invalid' });

        const license = result.rows[0];
        const now = Date.now();
        const expiry = new Date(license.expires_at).getTime();

        if (license.status === 'revoked') {
            return res.json({ success: true, status: 'Revoked', expiry: license.expires_at });
        }
        if (expiry <= now || license.status === 'expired') {
            await pool.query('UPDATE licenses SET status = \'expired\' WHERE key_hash = $1', [keyHash]);
            return res.json({ success: true, status: 'Expired', expiry: license.expires_at });
        }

        await pool.query('UPDATE licenses SET last_validated_at = NOW() WHERE key_hash = $1', [keyHash]);
        return res.json({ success: true, status: 'Active', expiry: license.expires_at, product: license.product_id });
    } catch {
        return res.status(500).json({ success: false, error: 'Unable to validate license.' });
    }
});

app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found.' }));

app.listen(port, () => {
    console.log(`NoContext backend listening on port ${port}`);
});
