create table if not exists public.channel_reads (
  profile_id uuid references public.profiles(id) on delete cascade,
  channel_id uuid references public.message_channels(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (profile_id, channel_id)
);

create table if not exists public.message_reads (
  message_id uuid references public.messages(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (message_id, profile_id)
);

-- RLS policies
alter table public.channel_reads enable row level security;
alter table public.message_reads enable row level security;

-- Users can view channel reads for channels they are part of
create policy "Users can view channel reads for their channels"
  on public.channel_reads for select
  using (
    exists (
      select 1 from public.message_channel_members cm
      join public.team_members tm on cm.team_member_id = tm.id
      where cm.channel_id = channel_reads.channel_id
      and tm.profile_id = auth.uid()
    )
  );

-- Users can insert/update their own channel reads
create policy "Users can manage their own channel reads"
  on public.channel_reads for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Users can view message reads for messages in their channels
create policy "Users can view message reads for their channels"
  on public.message_reads for select
  using (
    exists (
      select 1 from public.messages m
      join public.message_channel_members cm on m.channel_id = cm.channel_id
      join public.team_members tm on cm.team_member_id = tm.id
      where m.id = message_reads.message_id
      and tm.profile_id = auth.uid()
    )
  );

-- Users can insert their own message reads
create policy "Users can manage their own message reads"
  on public.message_reads for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Function to get unread message count
create or replace function public.get_unread_message_count(p_profile_id uuid)
returns integer as $$
declare
  unread_count integer;
begin
  select count(m.id) into unread_count
  from public.messages m
  join public.message_channel_members cm on m.channel_id = cm.channel_id
  join public.team_members tm on cm.team_member_id = tm.id
  left join public.channel_reads cr on cr.channel_id = m.channel_id and cr.profile_id = p_profile_id
  where tm.profile_id = p_profile_id
  and (cr.last_read_at is null or m.created_at > cr.last_read_at);
  
  return unread_count;
end;
$$ language plpgsql security definer;
