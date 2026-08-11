-- Stores per-occurrence chord and lyric edits for a setlist arrangement.
-- Existing rows remain unchanged and continue using the legacy arrangement text.
alter table public.setlist_songs add column if not exists arrangement_sections jsonb;

-- Rollback plan: ship application code that no longer reads/writes this column,
-- then use a new forward migration to drop arrangement_sections.
