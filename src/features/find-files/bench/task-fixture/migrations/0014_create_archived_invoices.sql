CREATE TABLE archived_invoices (
  LIKE invoices_template INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
