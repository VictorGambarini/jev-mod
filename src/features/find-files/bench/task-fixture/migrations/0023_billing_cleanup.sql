-- BIL-204: legacy_ref was only ever filled by the old importer.
ALTER TABLE invoices DROP COLUMN IF EXISTS legacy_ref;
ALTER TABLE invoice_lines DROP COLUMN IF EXISTS legacy_ref;
