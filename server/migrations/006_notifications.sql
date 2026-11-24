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

CREATE INDEX notifications_user_id_id_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_message_idx ON notifications (conversation_id, message_id) WHERE type = 'NEW_MESSAGE';
