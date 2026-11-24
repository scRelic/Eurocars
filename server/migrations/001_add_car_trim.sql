-- Optional trim is not present in the original cars table.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS trim VARCHAR(255);
