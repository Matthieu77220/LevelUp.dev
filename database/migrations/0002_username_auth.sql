ALTER TABLE identity.users
    ADD COLUMN username citext;

UPDATE identity.users AS users
SET username = COALESCE(
    (SELECT profiles.username FROM identity.profiles AS profiles WHERE profiles.user_id = users.id),
    'user_' || left(replace(users.id::text, '-', ''), 12)
);

ALTER TABLE identity.users
    ALTER COLUMN username SET NOT NULL,
    ALTER COLUMN email DROP NOT NULL,
    ALTER COLUMN status SET DEFAULT 'ACTIVE';

ALTER TABLE identity.users
    ADD CONSTRAINT users_username_unique UNIQUE (username),
    ADD CONSTRAINT users_username_format CHECK (username::text ~ '^[A-Za-z0-9_]{3,32}$');

CREATE TABLE identity.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    user_agent_hash bytea CHECK (user_agent_hash IS NULL OR octet_length(user_agent_hash) = 32),
    ip_address inet,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (expires_at > created_at),
    CHECK (last_seen_at >= created_at)
);

CREATE INDEX sessions_user_idx ON identity.sessions(user_id, created_at DESC);
CREATE INDEX sessions_active_expiry_idx ON identity.sessions(expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE identity.authentication_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    username_attempted citext,
    event_type varchar(40) NOT NULL CHECK (event_type IN (
        'REGISTER_SUCCEEDED',
        'REGISTER_FAILED',
        'LOGIN_SUCCEEDED',
        'LOGIN_FAILED',
        'LOGOUT_SUCCEEDED',
        'SESSION_REJECTED'
    )),
    ip_address inet,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX authentication_events_user_idx
    ON identity.authentication_events(user_id, occurred_at DESC);
CREATE INDEX authentication_events_ip_idx
    ON identity.authentication_events(ip_address, occurred_at DESC);

