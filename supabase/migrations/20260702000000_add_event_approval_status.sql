alter table public.events
add column if not exists approval_status text not null default 'approved'
check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists events_team_approval_date_idx
on public.events (team_id, approval_status, event_date);

drop policy if exists "Members can read events" on public.events;
drop policy if exists "Leaders can create events" on public.events;
drop policy if exists "Leaders can update events" on public.events;
drop policy if exists "Leaders can delete events" on public.events;
drop policy if exists "Approved members can read visible events" on public.events;
drop policy if exists "Approved members can request events" on public.events;
drop policy if exists "Owners and admins can review events" on public.events;
drop policy if exists "Event managers can update approved events" on public.events;
drop policy if exists "Owners and admins can delete events" on public.events;
drop policy if exists "Event managers can delete approved events" on public.events;
drop policy if exists "Members can read event assignments" on public.event_assignments;
drop policy if exists "Members can read attendance" on public.attendance;
drop policy if exists "Members can confirm own attendance" on public.attendance;
drop policy if exists "Members can create own attendance" on public.attendance;

create policy "Approved members can read visible events"
on public.events for select to authenticated
using (
  private.is_approved_member(team_id)
  and (
    approval_status = 'approved'
    or created_by = (select auth.uid())
    or private.has_team_role(team_id, array['owner','admin']::public.team_role[])
  )
);

create policy "Approved members can request events"
on public.events for insert to authenticated
with check (
  private.is_approved_member(team_id)
  and created_by = (select auth.uid())
  and (
    approval_status = 'pending'
    or private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[])
  )
);

create policy "Owners and admins can review events"
on public.events for update to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Event managers can update approved events"
on public.events for update to authenticated
using (
  approval_status = 'approved'
  and private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[])
)
with check (
  approval_status = 'approved'
  and private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[])
);

create policy "Owners and admins can delete events"
on public.events for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Event managers can delete approved events"
on public.events for delete to authenticated
using (
  approval_status = 'approved'
  and private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[])
);

create policy "Members can read event assignments"
on public.event_assignments for select to authenticated
using (exists (
  select 1
  from public.events e
  where e.id = event_id
    and private.is_approved_member(e.team_id)
    and (
      e.approval_status = 'approved'
      or e.created_by = (select auth.uid())
      or private.has_team_role(e.team_id, array['owner','admin']::public.team_role[])
    )
));

create policy "Members can read attendance"
on public.attendance for select to authenticated
using (exists (
  select 1
  from public.events e
  where e.id = event_id
    and private.is_approved_member(e.team_id)
    and (
      e.approval_status = 'approved'
      or e.created_by = (select auth.uid())
      or private.has_team_role(e.team_id, array['owner','admin']::public.team_role[])
    )
));

create policy "Members can confirm own attendance"
on public.attendance for update to authenticated
using (exists (
  select 1
  from public.team_members tm
  join public.events e on e.id = event_id
  where tm.id = team_member_id
    and tm.profile_id = (select auth.uid())
    and private.is_approved_member(e.team_id)
    and e.approval_status = 'approved'
))
with check (exists (
  select 1
  from public.team_members tm
  join public.events e on e.id = event_id
  where tm.id = team_member_id
    and tm.profile_id = (select auth.uid())
    and private.is_approved_member(e.team_id)
    and e.approval_status = 'approved'
));

create policy "Members can create own attendance"
on public.attendance for insert to authenticated
with check (exists (
  select 1
  from public.team_members tm
  join public.events e on e.id = event_id
  where tm.id = team_member_id
    and tm.profile_id = (select auth.uid())
    and private.is_approved_member(e.team_id)
    and e.approval_status = 'approved'
));
