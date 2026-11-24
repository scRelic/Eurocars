CREATE TABLE IF NOT EXISTS listing_submission_keys (
    seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key UUID NOT NULL,
    car_id BIGINT REFERENCES cars(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (seller_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_listing_submission_keys_created
    ON listing_submission_keys(created_at);
