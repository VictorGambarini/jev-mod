CREATE TABLE subscriptions (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  plan_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  cancel_at_period_end boolean NOT NULL DEFAULT false
);
