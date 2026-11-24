ALTER TABLE cars
    ADD COLUMN IF NOT EXISTS sale_confirmation_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUESTED',
    ADD COLUMN IF NOT EXISTS sale_confirmation_reason TEXT,
    ADD COLUMN IF NOT EXISTS sale_reviewed_by BIGINT REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS sale_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cars_sale_confirmation_status_check' AND conrelid = 'cars'::regclass
    ) THEN
        ALTER TABLE cars
            ADD CONSTRAINT cars_sale_confirmation_status_check
            CHECK (sale_confirmation_status IN ('NOT_REQUESTED', 'PENDING', 'CONFIRMED', 'REJECTED'));
    END IF;
END $$;

UPDATE cars
SET sale_confirmation_status = 'CONFIRMED',
    sale_reviewed_at = COALESCE(sale_reviewed_at, updated_at)
WHERE status = 'SOLD' AND sale_confirmation_status = 'NOT_REQUESTED';

CREATE INDEX IF NOT EXISTS idx_cars_pending_sale_confirmation
    ON cars(updated_at ASC, id ASC)
    WHERE status = 'SOLD' AND sale_confirmation_status = 'PENDING';
