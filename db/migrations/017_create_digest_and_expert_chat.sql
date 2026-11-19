-- Migration 017: Batch email digest and expert chat
-- Creates tables for notification events, email digests, experts,
-- chat conversations and chat messages.

-- ---------------------------------------------------------------------------
-- notification_events
-- Raw events that are aggregated into daily email digests.
-- ---------------------------------------------------------------------------
CREATE TABLE notification_events (
    id              SERIAL PRIMARY KEY,
    sponsor_id      INTEGER NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
    event_type      VARCHAR(64) NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivered_at    TIMESTAMP(3),
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_events_event_type_check
        CHECK (event_type IN (
            'PROJECT_UPDATE',
            'CERTIFICATION_STATUS',
            'MARKET_PRICE',
            'NEW_MESSAGE',
            'PAYMENT',
            'SYSTEM'
        ))
);

CREATE INDEX notification_events_sponsor_id_idx
    ON notification_events (sponsor_id);

CREATE INDEX notification_events_delivered_at_idx
    ON notification_events (delivered_at);

CREATE INDEX notification_events_sponsor_id_delivered_at_idx
    ON notification_events (sponsor_id, delivered_at);

-- ---------------------------------------------------------------------------
-- email_digests
-- One digest per sponsor per day (per timezone-local date).
-- ---------------------------------------------------------------------------
CREATE TABLE email_digests (
    id              SERIAL PRIMARY KEY,
    sponsor_id      INTEGER NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
    digest_date     DATE NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    event_count     INTEGER NOT NULL DEFAULT 0,
    sent_at         TIMESTAMP(3),
    error_message   TEXT,
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_digests_status_check
        CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    CONSTRAINT email_digests_event_count_check
        CHECK (event_count >= 0),
    CONSTRAINT email_digests_sponsor_id_digest_date_key
        UNIQUE (sponsor_id, digest_date)
);

CREATE INDEX email_digests_sponsor_id_idx
    ON email_digests (sponsor_id);

CREATE INDEX email_digests_digest_date_idx
    ON email_digests (digest_date);

CREATE INDEX email_digests_status_idx
    ON email_digests (status);

-- ---------------------------------------------------------------------------
-- experts
-- Agricultural experts available for live chat support.
-- ---------------------------------------------------------------------------
CREATE TABLE experts (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    bio             TEXT,
    specialties     TEXT[] NOT NULL DEFAULT '{}',
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT experts_email_key UNIQUE (email)
);

CREATE INDEX experts_is_available_idx
    ON experts (is_available);

-- ---------------------------------------------------------------------------
-- chat_conversations
-- A conversation between a farmer and an expert.
-- ---------------------------------------------------------------------------
CREATE TABLE chat_conversations (
    id              SERIAL PRIMARY KEY,
    farmer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expert_id       INTEGER REFERENCES experts(id) ON DELETE SET NULL,
    topic           VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
    status          VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at       TIMESTAMP(3),
    CONSTRAINT chat_conversations_topic_check
        CHECK (topic IN (
            'GENERAL',
            'CARBON_FARMING',
            'SOIL_HEALTH',
            'CERTIFICATION',
            'MARKET_PRICES'
        )),
    CONSTRAINT chat_conversations_status_check
        CHECK (status IN ('OPEN', 'ASSIGNED', 'CLOSED'))
);

CREATE INDEX chat_conversations_farmer_id_idx
    ON chat_conversations (farmer_id);

CREATE INDEX chat_conversations_expert_id_idx
    ON chat_conversations (expert_id);

CREATE INDEX chat_conversations_status_idx
    ON chat_conversations (status);

-- ---------------------------------------------------------------------------
-- chat_messages
-- Individual messages within a chat conversation.
-- ---------------------------------------------------------------------------
CREATE TABLE chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_type     VARCHAR(32) NOT NULL,
    sender_id       INTEGER,
    body            TEXT NOT NULL,
    read_at         TIMESTAMP(3),
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_messages_sender_type_check
        CHECK (sender_type IN ('FARMER', 'EXPERT', 'SYSTEM')),
    CONSTRAINT chat_messages_body_check
        CHECK (length(body) > 0)
);

CREATE INDEX chat_messages_conversation_id_idx
    ON chat_messages (conversation_id);

CREATE INDEX chat_messages_created_at_idx
    ON chat_messages (created_at);

CREATE INDEX chat_messages_conversation_id_created_at_idx
    ON chat_messages (conversation_id, created_at);