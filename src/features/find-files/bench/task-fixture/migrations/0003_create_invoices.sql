CREATE TABLE invoices (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open',
  subtotal_cents integer NOT NULL,
  tax_cents integer,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL
);
