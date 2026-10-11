CREATE TABLE payments (
  id text PRIMARY KEY,
  captured_cents integer NOT NULL,
  refunded_cents integer NOT NULL DEFAULT 0
);
