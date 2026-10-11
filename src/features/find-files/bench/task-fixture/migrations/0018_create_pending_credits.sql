CREATE TABLE pending_credits (
  subscription_id text NOT NULL,
  cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
