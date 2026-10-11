ALTER TABLE invoices ADD COLUMN paid_at timestamptz;
UPDATE invoices SET paid_at = issued_at WHERE status = 'paid';
