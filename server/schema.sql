CREATE TABLE IF NOT EXISTS licenses (
    id BIGSERIAL PRIMARY KEY,
    key_hash CHAR(64) NOT NULL UNIQUE,
    product_id VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    workink_token_hash CHAR(64),
    workink_link_id BIGINT,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_validated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS claim_locks (
    token_hash CHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_at TIMESTAMPTZ,
    license_id BIGINT REFERENCES licenses(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS claim_attempts (
    id BIGSERIAL PRIMARY KEY,
    token_hash CHAR(64) NOT NULL,
    product_id VARCHAR(64),
    outcome VARCHAR(32) NOT NULL,
    ip_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_errors (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,
    message VARCHAR(500) NOT NULL,
    page VARCHAR(160) NOT NULL,
    ip_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(24) NOT NULL,
    username_normalized VARCHAR(24) NOT NULL UNIQUE,
    password_hash VARCHAR(128),
    password_salt VARCHAR(64),
    discord_id VARCHAR(32) UNIQUE,
    discord_username VARCHAR(100),
    avatar_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT users_auth_method_check CHECK (password_hash IS NOT NULL OR discord_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discord_oauth_states (
    state_hash CHAR(64) PRIMARY KEY,
    code_verifier VARCHAR(128),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_salt DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hash VARCHAR(64);
ALTER TABLE discord_oauth_states ADD COLUMN IF NOT EXISTS code_verifier VARCHAR(128);

CREATE INDEX IF NOT EXISTS licenses_status_idx ON licenses(status);
CREATE INDEX IF NOT EXISTS licenses_expires_at_idx ON licenses(expires_at);
CREATE INDEX IF NOT EXISTS claim_attempts_token_idx ON claim_attempts(token_hash);
CREATE INDEX IF NOT EXISTS claim_attempts_created_at_idx ON claim_attempts(created_at);
CREATE INDEX IF NOT EXISTS claim_locks_created_at_idx ON claim_locks(created_at);
CREATE INDEX IF NOT EXISTS client_errors_created_at_idx ON client_errors(created_at);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at);
CREATE INDEX IF NOT EXISTS discord_oauth_states_expires_at_idx ON discord_oauth_states(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS users_discord_id_unique_idx ON users(discord_id) WHERE discord_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS licenses_workink_token_unique_idx
    ON licenses(workink_token_hash)
    WHERE workink_token_hash IS NOT NULL;
