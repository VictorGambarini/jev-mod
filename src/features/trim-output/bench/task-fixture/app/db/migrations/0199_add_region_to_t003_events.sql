ALTER TABLE t003_events ADD COLUMN region TEXT;
UPDATE t003_events SET region = 'nz' WHERE region IS NULL;
