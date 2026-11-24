BEGIN;

CREATE TABLE image_uploads (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('LISTING', 'AVATAR')),
    temporary_blob_pathname TEXT NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED', 'EXPIRED')),
    expected_file_size BIGINT NOT NULL CHECK (expected_file_size > 0 AND expected_file_size <= 10485760),
    actual_file_size BIGINT CHECK (actual_file_size IS NULL OR (actual_file_size > 0 AND actual_file_size <= 10485760)),
    expected_mime_type VARCHAR(30) NOT NULL CHECK (expected_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    error_code VARCHAR(100),
    processing_attempt UUID,
    processing_started_at TIMESTAMPTZ,
    processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    consumed_avatar_url TEXT,
    CHECK (expires_at > created_at),
    CHECK (purpose <> 'AVATAR' OR expected_file_size <= 5242880),
    CHECK (consumed_at IS NULL OR (status = 'READY' AND completed_at IS NOT NULL))
);

CREATE INDEX image_uploads_user_created_idx ON image_uploads (user_id, created_at DESC);
CREATE INDEX image_uploads_expiry_idx ON image_uploads (expires_at)
    WHERE consumed_at IS NULL;

CREATE TABLE image_delete_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    store VARCHAR(10) NOT NULL CHECK (store IN ('PUBLIC', 'PRIVATE')),
    pathname TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error_at TIMESTAMPTZ,
    UNIQUE (store, pathname)
);

CREATE INDEX image_delete_jobs_due_idx ON image_delete_jobs (next_attempt_at, id);

CREATE TABLE image_upload_variants (
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
