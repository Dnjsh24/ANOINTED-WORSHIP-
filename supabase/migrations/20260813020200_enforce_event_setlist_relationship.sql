create unique index if not exists setlists_one_per_event_idx
  on public.setlists (event_id)
  where event_id is not null;

create or replace function private.sync_linked_setlist_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.setlists
  set
    setlist_date = new.event_date,
    location = new.location,
    call_time = coalesce(new.call_time, new.starts_at),
    rehearsal_time = new.rehearsal_time,
    service_times = case
      when new.type in ('service', 'service_rehearsal') and new.service_type is not null
        then array[new.service_type]
      else array[]::text[]
    end,
    updated_at = now()
  where event_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_linked_setlist_from_event on public.events;
create trigger sync_linked_setlist_from_event
after update of event_date, location, starts_at, call_time, rehearsal_time, type, service_type
on public.events
for each row
execute function private.sync_linked_setlist_from_event();

revoke all on function private.sync_linked_setlist_from_event() from public, anon, authenticated;
grant execute on function private.sync_linked_setlist_from_event() to service_role;

create or replace function private.link_event_setlist(p_event_id uuid, p_setlist_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_team uuid;
  setlist_team uuid;
  current_event uuid;
  event_row public.events%rowtype;
begin
  select * into event_row
  from public.events
  where id = p_event_id
  for update;

  event_team := event_row.team_id;
  if event_team is null
     or not private.has_team_role(
       event_team,
       array['owner', 'admin', 'worship_leader']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'event setlist cannot be changed';
  end if;

  if p_setlist_id is not null then
    select team_id, event_id into setlist_team, current_event
    from public.setlists
    where id = p_setlist_id
    for update;

    if setlist_team is null or setlist_team <> event_team then
      raise exception using errcode = '42501', message = 'setlist is unavailable';
    end if;
    if current_event is not null and current_event <> p_event_id then
      raise exception using errcode = '23505', message = 'setlist is already linked to another event';
    end if;
  end if;

  update public.setlists
  set
    event_id = null,
    location = null,
    call_time = null,
    rehearsal_time = null,
    service_times = array[]::text[],
    leader_member_id = null,
    updated_at = now()
  where event_id = p_event_id
    and (p_setlist_id is null or id <> p_setlist_id);

  if p_setlist_id is not null then
    update public.setlists
    set
      event_id = p_event_id,
      setlist_date = event_row.event_date,
      location = event_row.location,
      call_time = coalesce(event_row.call_time, event_row.starts_at),
      rehearsal_time = event_row.rehearsal_time,
      service_times = case
        when event_row.type in ('service', 'service_rehearsal') and event_row.service_type is not null
          then array[event_row.service_type]
        else array[]::text[]
      end,
      leader_member_id = null,
      updated_at = now()
    where id = p_setlist_id
      and team_id = event_team;
  end if;
end;
$$;

revoke all on function private.link_event_setlist(uuid, uuid) from public, anon;
grant execute on function private.link_event_setlist(uuid, uuid) to authenticated, service_role;

create or replace function public.link_event_setlist(p_event_id uuid, p_setlist_id uuid default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.link_event_setlist(p_event_id, p_setlist_id);
$$;

revoke all on function public.link_event_setlist(uuid, uuid) from public, anon;
grant execute on function public.link_event_setlist(uuid, uuid) to authenticated, service_role;

create or replace function private.delete_setlist_cascade(p_setlist_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  setlist_team uuid;
begin
  select team_id into setlist_team
  from public.setlists
  where id = p_setlist_id
  for update;
  if setlist_team is null
     or not private.has_team_role(
       setlist_team,
       array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'setlist cannot be deleted';
  end if;
  delete from public.setlists where id = p_setlist_id and team_id = setlist_team;
end;
$$;

create or replace function private.delete_event_cascade(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_team uuid;
  event_status text;
begin
  select team_id, approval_status
  into event_team, event_status
  from public.events
  where id = p_event_id
  for update;
  if event_team is null
     or not (
       private.has_team_role(event_team, array['owner', 'admin']::public.team_role[])
       or (
         event_status = 'approved'
         and private.has_team_role(
           event_team,
           array['pastor', 'worship_leader']::public.team_role[]
         )
       )
     ) then
    raise exception using errcode = '42501', message = 'event cannot be deleted';
  end if;

  update public.setlists
  set event_id = null,
      location = null,
      call_time = null,
      rehearsal_time = null,
      service_times = array[]::text[],
      leader_member_id = null,
      updated_at = now()
  where event_id = p_event_id and team_id = event_team;

  delete from public.events where id = p_event_id and team_id = event_team;
end;
$$;
