-- Keep attendance rows within one team even when they are written outside
-- PostgREST/RLS (for example by a future service-role maintenance task).
create or replace function private.validate_attendance_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.team_members tm on tm.team_id = e.team_id
    where e.id = new.event_id
      and tm.id = new.team_member_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'attendance event and team member must belong to the same team';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_attendance_team() from public, anon, authenticated;

drop trigger if exists attendance_validate_team on public.attendance;
create trigger attendance_validate_team
before insert or update of event_id, team_member_id on public.attendance
for each row execute function private.validate_attendance_team();

-- Members can only confirm attendance through their active membership in the
-- same team as an approved event. The earlier policy allowed a member who
-- belonged to two teams to combine an event from one team with their member ID
-- from the other team.
drop policy if exists "Members can confirm own attendance" on public.attendance;
drop policy if exists "Members can create own attendance" on public.attendance;

create policy "Members can confirm own attendance"
on public.attendance for update to authenticated
using (exists (
  select 1
  from public.team_members tm
  join public.events e on e.id = attendance.event_id
  where tm.id = attendance.team_member_id
    and tm.team_id = e.team_id
    and tm.profile_id = (select auth.uid())
    and tm.status = 'active'
    and private.is_approved_member(e.team_id)
    and e.approval_status = 'approved'
))
with check (exists (
  select 1
  from public.team_members tm
  join public.events e on e.id = attendance.event_id
  where tm.id = attendance.team_member_id
    and tm.team_id = e.team_id
    and tm.profile_id = (select auth.uid())
    and tm.status = 'active'
    and private.is_approved_member(e.team_id)
    and e.approval_status = 'approved'
));

create policy "Members can create own attendance"
on public.attendance for insert to authenticated
with check (exists (
  select 1
  from public.team_members tm
  join public.events e on e.id = attendance.event_id
  where tm.id = attendance.team_member_id
    and tm.team_id = e.team_id
    and tm.profile_id = (select auth.uid())
    and tm.status = 'active'
    and private.is_approved_member(e.team_id)
    and e.approval_status = 'approved'
));

-- Notification creation is a database-owned side effect of a valid attendance
-- response. This avoids granting ordinary members permission to create
-- arbitrary notifications for other profiles.
create or replace function private.notify_attendance_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_team_id uuid;
  event_name text;
  responder_profile_id uuid;
  responder_name text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select
    e.team_id,
    e.name,
    responder.profile_id,
    coalesce(nullif(p.full_name, ''), 'A member')
  into
    event_team_id,
    event_name,
    responder_profile_id,
    responder_name
  from public.events e
  join public.team_members responder
    on responder.id = new.team_member_id
   and responder.team_id = e.team_id
   and responder.status = 'active'
  left join public.profiles p on p.id = responder.profile_id
  where e.id = new.event_id;

  if event_team_id is null or responder_profile_id is null then
    raise exception using
      errcode = '23514',
      message = 'attendance response has no active same-team member';
  end if;

  insert into public.notifications (
    team_id,
    profile_id,
    title,
    body,
    target_path,
    priority,
    event_id,
    target_label,
    created_by
  )
  select
    event_team_id,
    recipient.profile_id,
    'Attendance Updated',
    responder_name || ' is now ' || new.status::text || ' for ' || event_name || '.',
    '/events/' || new.event_id::text,
    'normal',
    new.event_id,
    'Team leaders',
    responder_profile_id
  from public.team_members recipient
  where recipient.team_id = event_team_id
    and recipient.status = 'active'
    and recipient.role = any (
      array['owner', 'admin', 'worship_leader']::public.team_role[]
    )
    and recipient.profile_id <> responder_profile_id;

  return new;
end;
$$;

revoke all on function private.notify_attendance_response() from public, anon, authenticated;

drop trigger if exists attendance_notify_leaders on public.attendance;
create trigger attendance_notify_leaders
after insert or update of status on public.attendance
for each row execute function private.notify_attendance_response();
