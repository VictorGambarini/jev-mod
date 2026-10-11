CREATE TABLE invoice_events (
  id bigserial PRIMARY KEY,
  invoice_id text NOT NULL,
  kind text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
