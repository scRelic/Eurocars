BEGIN;

ALTER TABLE image_uploads
    ADD COLUMN IF NOT EXISTS processing_attempt UUID,
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    ADD COLUMN IF NOT EXISTS consumed_avatar_url TEXT;

CREATE TABLE IF NOT EXISTS image_upload_variants (
    upload_id UUID NOT NULL REFERENCES image_uploads(id) ON DELETE CASCADE,
    variant VARCHAR(20) NOT NULL CHECK (variant IN ('thumbnail', 'catalog', 'gallery', 'avatar')),
    pathname TEXT NOT NULL UNIQUE,
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    mime_type VARCHAR(30) NOT NULL CHECK (mime_type = 'image/webp'),
    PRIMARY KEY (upload_id, variant)
);

COMMIT;
