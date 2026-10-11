CREATE TABLE disputes (
  id text PRIMARY KEY,
  payment_id text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  state text NOT NULL DEFAULT 'open'
);
