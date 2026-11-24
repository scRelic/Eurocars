CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key_hash CHAR(64) PRIMARY KEY,
    attempts INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL
);
