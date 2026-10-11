CREATE TABLE orders (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  payment_id text,
  total_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'new',
  shipped_at timestamptz
);
