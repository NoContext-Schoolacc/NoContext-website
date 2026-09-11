import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const publicOrigin = process.env.PUBLIC_ORIGIN || '';
const hmacSecret = process.env.LICENSE_HMAC_SECRET;
const trustProxy = process.env.TRUST_PROXY === 'true';

if (!hmacSecret || hmacSecret.length < 32) {
    throw new Error('LICENSE_HMAC_SECRET must be set to a random value of at least 32 characters.');
}
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured.');
}

let allowedWorkinkLinks;
try {
    allowedWorkinkLinks = JSON.parse(process.env.WORKINK_LINK_IDS || '{}');
} catch {
    throw new Error('WORKINK_LINK_IDS must be valid JSON, for example {"external":12345}.');
}

if (!allowedWorkinkLinks || typeof allowedWorkinkLinks !== 'object') {
    throw new Error('WORKINK_LINK_IDS must be a JSON object mapping products to Work.ink link IDs.');
}

const databaseSslEnabled = process.env.NODE_ENV === 'production';
const databaseSslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
const databaseSsl = databaseSslEnabled
    ? {
        rejectUnauthorized: databaseSslRejectUnauthorized,
        ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {})
    }
    : false;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl
});

app.disable('x-powered-by');
app.set('trust proxy', trustProxy);
app.use(helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));
app.use(express.json({ limit: '16kb' }));

if (publicOrigin) {
    app.use((req, res, next) => {
        const origin = req.get('origin');
        if (origin && origin !== publicOrigin) {
            return res.status(403).json({ success: false, error: 'Origin not allowed.' });
        }
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', publicOrigin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
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

function generateLicenseKey() {
    return `NC-${crypto.randomBytes(24).toString('base64url').toUpperCase().slice(0, 8)}-${crypto.randomBytes(8).toString('base64url').toUpperCase().slice(0, 8)}-${crypto.randomBytes(8).toString('base64url').toUpperCase().slice(0, 8)}`;
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
    if (typeof token !== 'string' || token.length < 1 || token.length > 512) {
        return { valid: false, reason: 'invalid_token' };
    }

    const expectedLink = expectedLinkId(productId);
    if (!expectedLink) return { valid: false, reason: 'product_not_configured' };

    const response = await fetch(
        `https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}`,
        {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
            cache: 'no-store'
        }
    );

    if (!response.ok) return { valid: false, reason: 'verification_unavailable' };

    const data = await response.json();
    if (data?.valid !== true) return { valid: false, reason: 'invalid_or_expired' };
    if (Number(data.info?.linkId) !== expectedLink) return { valid: false, reason: 'wrong_link' };

    const expiresAfter = Number(data.info?.expiresAfter);
    if (!Number.isFinite(expiresAfter) || expiresAfter <= Date.now()) {
        return { valid: false, reason: 'invalid_or_expired' };
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
    const productId = cleanProductId(req.body?.productId);

    if (!productId) return res.status(400).json({ success: false, error: 'Invalid product.' });

    const tokenHash = digest(token);
    const ipHash = digest(req.ip || 'unknown');

    try {
        const verification = await verifyWorkinkToken(token, productId);
        const outcome = verification.valid ? 'verified' : verification.reason;

        await pool.query(
            'INSERT INTO claim_attempts (token_hash, product_id, outcome, ip_hash) VALUES ($1, $2, $3, $4)',
            [tokenHash, productId, outcome, ipHash]
        );

        if (!verification.valid) {
            const status = verification.reason === 'verification_unavailable' ? 503 : 400;
            return res.status(status).json({ success: false, error: 'Verification failed.' });
        }

        // Reserve the verified token before issuing anything. The primary key makes
        // concurrent requests for the same Work.ink token mutually exclusive.
        const reservation = await pool.query(
            `INSERT INTO claim_locks (token_hash, product_id, status)
             VALUES ($1, $2, 'pending')
             ON CONFLICT (token_hash) DO NOTHING
             RETURNING token_hash`,
            [tokenHash, productId]
        );

        if (!reservation.rowCount) {
            return res.status(409).json({ success: false, error: 'This verification has already been used.' });
        }

        const licenseKey = generateLicenseKey();
        const keyHash = digest(licenseKey);
        const expiresAt = new Date(Math.min(Date.now() + 24 * 60 * 60 * 1000, Number(verification.info.expiresAfter)));
        const linkId = expectedLinkId(productId);

        try {
            const result = await pool.query(
                `INSERT INTO licenses
                    (key_hash, product_id, status, expires_at, workink_token_hash, workink_link_id, claimed_at)
                 VALUES ($1, $2, 'active', $3, $4, $5, NOW())
                 RETURNING id`,
                [keyHash, productId, expiresAt, tokenHash, linkId]
            );

            await pool.query(
                `UPDATE claim_locks
                 SET status = 'issued', issued_at = NOW(), license_id = $2
                 WHERE token_hash = $1`,
                [tokenHash, result.rows[0].id]
            );
        } catch (error) {
            await pool.query('DELETE FROM claim_locks WHERE token_hash = $1 AND status = \'pending\'', [tokenHash]);
            throw error;
        }

        // Work.ink documents ?deleteToken=1 as the single-use option. Even if this
        // follow-up call fails, our local reservation prevents a second license issue.
        try {
            await fetch(
                `https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}?deleteToken=1`,
                { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store' }
            );
        } catch {
            // The token remains unusable by this backend because it is already reserved.
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
        const expiry = new Date(license.expires_at).getTime();

        if (license.status === 'revoked') {
            return res.json({ success: true, status: 'Revoked', expiry: license.expires_at });
        }
        if (!Number.isFinite(expiry) || expiry <= Date.now() || license.status === 'expired') {
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
