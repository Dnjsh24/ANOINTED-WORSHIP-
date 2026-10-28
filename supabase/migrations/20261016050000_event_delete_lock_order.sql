-- DRAFT. Align the existing website delete service with workspace save/mobile
-- member -> sorted linked setlists -> event locks. Signature/OID/grants preserved.
-- No hosted application. Forward recovery: fix this ordering in place, never
-- weaken permission checks or drop durable command/deletion evidence.
begin;
create or replace function public.delete_event_cascade(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare event_team uuid; event_status text;
begin
 -- Preliminary lookup does not lock a parent ahead of the shared member/workspace
 -- boundary. Revalidate this exact team and row after acquiring ordered locks.
 select team_id into event_team from public.events where id=p_event_id;
 if auth.uid() is null or event_team is null then
  raise exception using errcode='42501',message='event cannot be deleted';
 end if;
 perform private.lock_workspace_members(event_team);
 perform 1 from public.setlists where team_id=event_team and event_id=p_event_id order by id for update;
 select approval_status into event_status from public.events where id=p_event_id and team_id=event_team for update;
 if not found or not (
  private.has_team_role(event_team,array['owner','admin']::public.team_role[])
  or (event_status='approved' and private.has_workspace_permission(event_team,'events.manage'))
 ) then
  raise exception using errcode='42501',message='event cannot be deleted';
 end if;
 delete from public.setlists where event_id=p_event_id and team_id=event_team;
 delete from public.events where id=p_event_id and team_id=event_team;
end;
$$;
commit;
