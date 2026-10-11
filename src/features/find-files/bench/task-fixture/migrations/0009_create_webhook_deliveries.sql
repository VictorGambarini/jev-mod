CREATE TABLE webhook_deliveries (
  id text PRIMARY KEY,
  endpoint_url text NOT NULL,
  event text NOT NULL,
  body text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  last_status integer,
  retry_at timestamptz,
  state text NOT NULL DEFAULT 'pending'
);
