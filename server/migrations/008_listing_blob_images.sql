BEGIN;

ALTER TABLE car_images
    ADD COLUMN storage_provider VARCHAR(10) NOT NULL DEFAULT 'LOCAL'
        CHECK (storage_provider IN ('LOCAL', 'BLOB')),
    ADD COLUMN upload_id UUID UNIQUE REFERENCES image_uploads(id),
    ADD COLUMN private_key UUID,
    ADD COLUMN public_key UUID,
    ADD COLUMN thumbnail_url TEXT,
    ADD COLUMN catalog_url TEXT,
    ADD COLUMN gallery_url TEXT,
    ADD COLUMN width INTEGER CHECK (width IS NULL OR width > 0),
    ADD COLUMN height INTEGER CHECK (height IS NULL OR height > 0),
    ADD COLUMN file_size BIGINT CHECK (file_size IS NULL OR file_size > 0),
    ADD COLUMN mime_type VARCHAR(30) CHECK (mime_type IS NULL OR mime_type = 'image/webp'),
    ADD CONSTRAINT car_images_storage_upload_check
        CHECK ((storage_provider = 'LOCAL' AND upload_id IS NULL) OR (storage_provider = 'BLOB' AND upload_id IS NOT NULL));

CREATE TABLE image_sync_jobs (
    image_id BIGINT PRIMARY KEY REFERENCES car_images(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error_at TIMESTAMPTZ
);

CREATE INDEX image_sync_jobs_due_idx ON image_sync_jobs (next_attempt_at, image_id);

COMMIT;
