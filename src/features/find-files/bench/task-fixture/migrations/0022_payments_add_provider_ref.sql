ALTER TABLE payments ADD COLUMN provider_ref text;
CREATE UNIQUE INDEX payments_provider_ref_idx ON payments (provider_ref);
