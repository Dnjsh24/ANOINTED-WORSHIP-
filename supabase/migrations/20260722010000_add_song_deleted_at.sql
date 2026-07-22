alter table "public"."songs" add column if not exists "deleted_at" timestamptz;
create index if not exists songs_deleted_at_idx on public.songs (deleted_at);
