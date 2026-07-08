create table if not exists public.user_annotations (
  id uuid primary key default gen_random_uuid(),
  setlist_song_id uuid not null references public.setlist_songs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  canvas_data text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(setlist_song_id, profile_id)
);

-- RLS
alter table public.user_annotations enable row level security;

drop policy if exists "Users can view their own annotations" on public.user_annotations;
create policy "Users can view their own annotations"
  on public.user_annotations
  for select
  using ( auth.uid() = profile_id );

drop policy if exists "Users can insert their own annotations" on public.user_annotations;
create policy "Users can insert their own annotations"
  on public.user_annotations
  for insert
  with check ( auth.uid() = profile_id );

drop policy if exists "Users can update their own annotations" on public.user_annotations;
create policy "Users can update their own annotations"
  on public.user_annotations
  for update
  using ( auth.uid() = profile_id )
  with check ( auth.uid() = profile_id );

drop policy if exists "Users can delete their own annotations" on public.user_annotations;
create policy "Users can delete their own annotations"
  on public.user_annotations
  for delete
  using ( auth.uid() = profile_id );
