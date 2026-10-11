CREATE TABLE provider_events (
  id text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
