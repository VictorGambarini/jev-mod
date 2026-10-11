UPDATE invoices SET number = 'INV-' || lpad(id::text, 8, '0') WHERE number IS NULL;
ALTER TABLE invoices ALTER COLUMN number SET NOT NULL;
