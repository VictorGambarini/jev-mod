-- destructive: legacy_notes is dropped and its rows are not copied anywhere. Back up first.
ALTER TABLE notes ADD COLUMN archived INTEGER DEFAULT 0;
DROP TABLE legacy_notes;
