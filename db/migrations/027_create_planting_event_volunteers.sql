CREATE TABLE planting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_wallet text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  location text NOT NULL CHECK (length(location) BETWEEN 1 AND 300),
  briefing text NOT NULL CHECK (length(briefing) BETWEEN 1 AND 5000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at + interval '1 minute' AND ends_at <= starts_at + interval '24 hours')
);
CREATE INDEX planting_events_start_idx ON planting_events (starts_at, id);
CREATE INDEX planting_events_coordinator_idx ON planting_events (coordinator_wallet);

CREATE TABLE planting_event_volunteers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES planting_events(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  role text NOT NULL CHECK (role IN ('digger', 'photographer', 'team-lead')),
  minutes integer CHECK (minutes > 0 AND minutes <= 1440),
  hours_logged_at timestamptz,
  briefing_sent_at timestamptz,
  briefing_attempts integer NOT NULL DEFAULT 0,
  briefing_lease uuid,
  briefing_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, wallet),
  UNIQUE (event_id, email)
);
CREATE INDEX planting_volunteers_wallet_idx ON planting_event_volunteers(wallet);
CREATE INDEX planting_volunteers_briefing_idx
  ON planting_event_volunteers(briefing_retry_at, event_id)
  WHERE briefing_sent_at IS NULL AND briefing_attempts < 5;

-- These tables are accessed only through the server's authenticated API/worker.
REVOKE ALL ON planting_events, planting_event_volunteers FROM PUBLIC;
