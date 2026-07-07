-- Make the bpm column optional in the songs table
ALTER TABLE songs ALTER COLUMN bpm DROP NOT NULL;
