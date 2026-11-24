
-- ==========================================
-- EUROCARS DATABASE SCHEMA
-- PostgreSQL
-- Fresh databases only; includes migrations 001-008.
-- ==========================================

BEGIN;

-- COUNTRIES

CREATE TABLE countries (
    code VARCHAR(2) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR'
);

-- USERS

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(30),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'USER'
        CHECK (role IN ('USER', 'ADMIN')),
    country_code VARCHAR(2) REFERENCES countries(code),
    city VARCHAR(150),
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT users_account_status_check CHECK (account_status IN ('ACTIVE', 'SUSPENDED'))
);

CREATE UNIQUE INDEX users_email_unique
    ON users (LOWER(email));

-- IMAGE UPLOAD SESSIONS AND DELETION QUEUE

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

-- Migration 009 is a compatibility no-op on this already-complete schema.
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

-- DEALERS

CREATE TABLE dealers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    website_url TEXT,
    phone VARCHAR(30),
    logo_url TEXT,
    country_code VARCHAR(2) REFERENCES countries(code),
    city VARCHAR(150),
    address TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BRANDS

CREATE TABLE car_brands (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    logo_url TEXT
);

-- MODELS

CREATE TABLE car_models (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id BIGINT NOT NULL REFERENCES car_brands(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    UNIQUE (brand_id, slug),
    UNIQUE (id, brand_id)
);

-- CARS / LISTINGS

CREATE TABLE cars (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    seller_id BIGINT NOT NULL REFERENCES users(id),
    dealer_id BIGINT REFERENCES dealers(id),

    brand_id BIGINT NOT NULL REFERENCES car_brands(id),
    model_id BIGINT NOT NULL,

    title VARCHAR(255) NOT NULL,
    description TEXT,

    price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

    year SMALLINT NOT NULL
        CHECK (year BETWEEN 1886 AND 2100),

    mileage INTEGER NOT NULL CHECK (mileage >= 0),

    fuel_type VARCHAR(30) NOT NULL
        CHECK (fuel_type IN (
            'PETROL', 'DIESEL', 'ELECTRIC',
            'HYBRID', 'PLUGIN_HYBRID',
            'LPG', 'CNG', 'HYDROGEN', 'OTHER'
        )),

    transmission VARCHAR(20) NOT NULL
        CHECK (transmission IN ('MANUAL', 'AUTOMATIC')),

    body_type VARCHAR(30)
        CHECK (body_type IN (
            'SEDAN', 'SUV', 'HATCHBACK', 'WAGON',
            'COUPE', 'CONVERTIBLE', 'VAN',
            'PICKUP', 'OTHER'
        )),

    condition VARCHAR(20) NOT NULL DEFAULT 'USED'
        CHECK (condition IN ('NEW', 'USED', 'DAMAGED')),

    engine_capacity_cc INTEGER CHECK (engine_capacity_cc > 0),
    power_hp INTEGER CHECK (power_hp > 0),
    doors SMALLINT CHECK (doors BETWEEN 1 AND 8),
    seats SMALLINT CHECK (seats BETWEEN 1 AND 20),

    exterior_color VARCHAR(50),
    interior_color VARCHAR(50),

    vin VARCHAR(17),
    first_registration DATE,

    country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
    city VARCHAR(150) NOT NULL,
    postal_code VARCHAR(20),

    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN (
            'DRAFT', 'PENDING', 'ACTIVE',
            'SOLD', 'REJECTED', 'ARCHIVED'
        )),

    views INTEGER NOT NULL DEFAULT 0
        CHECK (views >= 0),

    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    trim VARCHAR(255),
    moderation_reason TEXT,
    reviewed_by BIGINT REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    sale_confirmation_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUESTED',
    sale_confirmation_reason TEXT,
    sale_reviewed_by BIGINT REFERENCES users(id),
    sale_reviewed_at TIMESTAMPTZ,
    CONSTRAINT cars_sale_confirmation_status_check
        CHECK (sale_confirmation_status IN ('NOT_REQUESTED', 'PENDING', 'CONFIRMED', 'REJECTED')),
    FOREIGN KEY (model_id, brand_id)
        REFERENCES car_models(id, brand_id)
);

-- CAR IMAGES

CREATE TABLE car_images (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    car_id BIGINT NOT NULL
        REFERENCES cars(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    storage_provider VARCHAR(10) NOT NULL DEFAULT 'LOCAL'
        CHECK (storage_provider IN ('LOCAL', 'BLOB')),
    upload_id UUID UNIQUE REFERENCES image_uploads(id),
    private_key UUID,
    public_key UUID,
    thumbnail_url TEXT,
    catalog_url TEXT,
    gallery_url TEXT,
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    file_size BIGINT CHECK (file_size IS NULL OR file_size > 0),
    mime_type VARCHAR(30) CHECK (mime_type IS NULL OR mime_type = 'image/webp'),
    CONSTRAINT car_images_storage_upload_check
        CHECK ((storage_provider = 'LOCAL' AND upload_id IS NULL) OR (storage_provider = 'BLOB' AND upload_id IS NOT NULL))
);

CREATE UNIQUE INDEX car_one_primary_image
    ON car_images(car_id)
    WHERE is_primary = TRUE;

CREATE TABLE image_sync_jobs (
    image_id BIGINT PRIMARY KEY REFERENCES car_images(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error_at TIMESTAMPTZ
);

CREATE INDEX image_sync_jobs_due_idx ON image_sync_jobs (next_attempt_at, image_id);

-- FEATURES

CREATE TABLE car_features (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL
);

-- CAR FEATURES RELATION

CREATE TABLE car_feature_links (
    car_id BIGINT NOT NULL
        REFERENCES cars(id) ON DELETE CASCADE,
    feature_id BIGINT NOT NULL
        REFERENCES car_features(id),
    PRIMARY KEY (car_id, feature_id)
);

-- FAVORITES

CREATE TABLE favorites (
    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    car_id BIGINT NOT NULL
        REFERENCES cars(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, car_id)
);

-- CONVERSATIONS

CREATE TABLE conversations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    car_id BIGINT NOT NULL REFERENCES cars(id),
    buyer_id BIGINT NOT NULL REFERENCES users(id),
    seller_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (buyer_id <> seller_id),
    UNIQUE (car_id, buyer_id)
);

-- MESSAGES

CREATE TABLE messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id BIGINT NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL
        CHECK (LENGTH(TRIM(content)) > 0),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REFRESH TOKENS

CREATE TABLE refresh_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AUTHENTICATION RATE LIMITS

CREATE TABLE auth_rate_limits (
    key_hash CHAR(64) PRIMARY KEY,
    attempts INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL
);

-- LISTING SUBMISSION IDEMPOTENCY

CREATE TABLE listing_submission_keys (
    seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key UUID NOT NULL,
    car_id BIGINT REFERENCES cars(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (seller_id, idempotency_key)
);

-- ADMINISTRATOR AUDIT LOG

CREATE TABLE admin_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES users(id),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTIFICATIONS

CREATE TABLE notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    type VARCHAR(30) NOT NULL CHECK (type IN ('LISTING_APPROVED', 'LISTING_REJECTED', 'SALE_CONFIRMED', 'SALE_REJECTED', 'NEW_MESSAGE')),
    car_id BIGINT NOT NULL REFERENCES cars(id),
    conversation_id BIGINT REFERENCES conversations(id),
    message_id BIGINT REFERENCES messages(id),
    reason TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((type = 'NEW_MESSAGE' AND conversation_id IS NOT NULL AND message_id IS NOT NULL)
        OR (type <> 'NEW_MESSAGE' AND conversation_id IS NULL AND message_id IS NULL))
);

-- INDEXES

CREATE INDEX idx_cars_brand ON cars(brand_id);
CREATE INDEX idx_cars_model ON cars(model_id);
CREATE INDEX idx_cars_seller ON cars(seller_id);
CREATE INDEX idx_cars_dealer ON cars(dealer_id);
CREATE INDEX idx_cars_location ON cars(country_code, city);
CREATE INDEX idx_cars_price ON cars(price);
CREATE INDEX idx_cars_year ON cars(year);
CREATE INDEX idx_cars_mileage ON cars(mileage);
CREATE INDEX idx_cars_active_created
    ON cars(created_at DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_cars_pending_sale_confirmation
    ON cars(updated_at ASC, id ASC)
    WHERE status = 'SOLD' AND sale_confirmation_status = 'PENDING';

CREATE INDEX idx_car_images_car
    ON car_images(car_id, position);

CREATE INDEX idx_favorites_car ON favorites(car_id);

CREATE INDEX idx_conversations_buyer
    ON conversations(buyer_id);

CREATE INDEX idx_conversations_seller
    ON conversations(seller_id);

CREATE INDEX idx_messages_conversation
    ON messages(conversation_id, created_at DESC);

CREATE INDEX idx_refresh_tokens_user
    ON refresh_tokens(user_id);

CREATE INDEX idx_listing_submission_keys_created
    ON listing_submission_keys(created_at);

CREATE INDEX idx_admin_audit_logs_created
    ON admin_audit_logs(created_at DESC, id DESC);

CREATE INDEX idx_admin_audit_logs_entity
    ON admin_audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX notifications_user_id_id_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_message_idx ON notifications (conversation_id, message_id) WHERE type = 'NEW_MESSAGE';

COMMIT;
