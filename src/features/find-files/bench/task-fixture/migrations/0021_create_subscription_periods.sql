CREATE TABLE subscription_periods (
  subscription_id text NOT NULL,
  price_cents integer NOT NULL,
  days_used integer NOT NULL DEFAULT 0,
  days_in_period integer NOT NULL
);
