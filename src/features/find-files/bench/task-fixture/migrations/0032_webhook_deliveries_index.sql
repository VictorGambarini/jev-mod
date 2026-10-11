CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (retry_at) WHERE state = 'pending';
