ALTER TABLE setlists
ADD COLUMN presentation_settings JSONB DEFAULT '{}'::jsonb;
