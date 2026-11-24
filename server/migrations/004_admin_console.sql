ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_account_status_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_account_status_check
            CHECK (account_status IN ('ACTIVE', 'SUSPENDED'));
    END IF;
END $$;

ALTER TABLE cars
    ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES users(id),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
    ON admin_audit_logs(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
    ON admin_audit_logs(entity_type, entity_id, created_at DESC);
