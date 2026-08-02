-- Website security remediation: template tenancy, presentation media ownership,
-- and an atomic service-role-only scheduled-message worker.

alter table public.setlist_templates enable row level security;

grant select, insert, update, delete on table public.setlist_templates to authenticated;
revoke select, insert, update, delete on table public.setlist_templates from anon;

drop policy if exists "Active members can read setlist templates" on public.setlist_templates;
drop policy if exists "Setlist managers can create setlist templates" on public.setlist_templates;
drop policy if exists "Setlist managers can update setlist templates" on public.setlist_templates;
drop policy if exists "Setlist managers can delete setlist templates" on public.setlist_templates;

create policy "Active members can read setlist templates"
on public.setlist_templates for select to authenticated
using (private.is_approved_member(team_id));

create policy "Setlist managers can create setlist templates"
on public.setlist_templates for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_team_role(
    team_id,
    array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
  )
);

create policy "Setlist managers can update setlist templates"
on public.setlist_templates for update to authenticated
using (
  private.has_team_role(
    team_id,
    array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
  )
)
with check (
  private.has_team_role(
    team_id,
    array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
  )
);

create policy "Setlist managers can delete setlist templates"
on public.setlist_templates for delete to authenticated
using (
  private.has_team_role(
    team_id,
    array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
  )
);

create or replace function private.can_write_presentation_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (storage.foldername(object_name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.team_members tm
      where tm.team_id::text = (storage.foldername(object_name))[1]
        and tm.profile_id = (select auth.uid())
        and tm.status = 'active'
    ),
    false
  );
$$;

revoke all on function private.can_write_presentation_media(text) from public;
grant execute on function private.can_write_presentation_media(text) to authenticated;

drop policy if exists "Authenticated users can upload presentation media" on storage.objects;
drop policy if exists "Authenticated users can update presentation media" on storage.objects;
drop policy if exists "Authenticated users can delete presentation media" on storage.objects;
drop policy if exists "Team members can upload presentation media" on storage.objects;
drop policy if exists "Team members can update presentation media" on storage.objects;
drop policy if exists "Team members can delete presentation media" on storage.objects;

create policy "Team members can upload presentation media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'presentation-media'
  and private.can_write_presentation_media(name)
);

create policy "Team members can update presentation media"
on storage.objects for update to authenticated
using (
  bucket_id = 'presentation-media'
  and private.can_write_presentation_media(name)
)
with check (
  bucket_id = 'presentation-media'
  and private.can_write_presentation_media(name)
);

create policy "Team members can delete presentation media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'presentation-media'
  and private.can_write_presentation_media(name)
);

create or replace function public.deliver_scheduled_messages(batch_size integer default 100)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id
    from public.messages m
    where m.is_delivered = false
      and m.scheduled_for is not null
      and m.scheduled_for <= now()
    order by m.scheduled_for asc
    for update skip locked
    limit least(greatest(batch_size, 1), 500)
  )
  update public.messages m
  set is_delivered = true
  from due
  where m.id = due.id
  returning m.id;
end;
$$;

revoke all on function public.deliver_scheduled_messages(integer) from public;
revoke all on function public.deliver_scheduled_messages(integer) from anon;
revoke all on function public.deliver_scheduled_messages(integer) from authenticated;
grant execute on function public.deliver_scheduled_messages(integer) to service_role;

-- Public buckets serve known object URLs without a broad SELECT policy. Removing
-- these policies prevents anonymous enumeration of every stored avatar.
drop policy if exists "Public can read profile avatars" on storage.objects;
drop policy if exists "Avatars are publicly readable" on storage.objects;

-- The unread-count helper never needs owner privileges. Run it as the caller,
-- pin its search path, and prevent callers from querying another profile.
create or replace function public.get_unread_message_count(p_profile_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(m.id)::integer
  from public.messages m
  join public.message_channel_members cm on m.channel_id = cm.channel_id
  join public.team_members tm on cm.team_member_id = tm.id
  left join public.channel_reads cr
    on cr.channel_id = m.channel_id
   and cr.profile_id = auth.uid()
  where p_profile_id = auth.uid()
    and tm.profile_id = auth.uid()
    and (cr.last_read_at is null or m.created_at > cr.last_read_at);
$$;

revoke all on function public.get_unread_message_count(uuid) from public;
revoke all on function public.get_unread_message_count(uuid) from anon;
grant execute on function public.get_unread_message_count(uuid) to authenticated;;
