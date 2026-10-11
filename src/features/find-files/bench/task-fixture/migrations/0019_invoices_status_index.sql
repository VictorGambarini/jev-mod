CREATE INDEX invoices_status_due_idx ON invoices (status, due_at) WHERE status = 'open';
