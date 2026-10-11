CREATE TABLE invoice_lines (
  id text PRIMARY KEY,
  invoice_id text NOT NULL,
  description text NOT NULL,
  unit_cents integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1
);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);
