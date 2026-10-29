-- DRAFT: authenticated ephemeral Stage cursor. No public broadcast or offline command ledger.
-- Apply only with explicit deployment authorization. One lease/fence row per setlist; expires after25seconds.
begin;
create table private.stage_live_leases (
 setlist_id uuid primary key references public.setlists(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade,
 session_id uuid not null,previous_session_id uuid,publisher_user_id uuid not null,publisher_member_id uuid not null,
 sequence bigint not null check(sequence between 0 and 9007199254740991),ordered_slot_ids jsonb not null,
 slot_id uuid not null,section_index integer not null check(section_index between 0 and 2047),
 claim_json jsonb not null,last_request_json jsonb not null,expires_at timestamptz not null,retired boolean not null default false
);
alter table private.stage_live_leases enable row level security;
revoke all on private.stage_live_leases from public,anon,authenticated;

-- Same owner/person/role/custom-role precedence as has_team_permission, evaluated for the current lease publisher.
create function private.stage_live_can_publish(p_team uuid,p_member uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select tm.role='owner' or coalesce(
  (select o.allowed from public.team_permission_overrides o where o.team_id=tm.team_id and o.member_id=tm.id and o.permission='setlists.manage'),
  (select o.allowed from public.team_permission_overrides o where o.team_id=tm.team_id and o.role=tm.role and o.permission='setlists.manage'),
  tm.role in ('admin','worship_leader','band_leader') or coalesce('setlists.manage'=any(cr.permissions),false))
 from public.team_members tm left join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
 where tm.id=p_member and tm.team_id=p_team and tm.profile_id=p_user and tm.status='active'),false);
$$;
revoke all on function private.stage_live_can_publish(uuid,uuid,uuid) from public,anon,authenticated;

-- A grant lost and restored between polls must still require an explicit new session.
create function private.retire_stage_live_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='team_members' then
  if (old.status,old.role,old.custom_role_id,old.profile_id) is distinct from (new.status,new.role,new.custom_role_id,new.profile_id) then
   update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where publisher_member_id=old.id and not retired;
  end if;
 elsif tg_table_name='team_permission_overrides' then
  if tg_op<>'DELETE' and new.permission='setlists.manage' then update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where team_id=new.team_id and not retired; end if;
  if tg_op<>'INSERT' and old.permission='setlists.manage' then update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where team_id=old.team_id and not retired; end if;
 elsif tg_table_name='custom_roles' then
  -- ponytail: retire the team's short leases on custom-role changes; narrow to affected publishers if needed.
  update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where team_id=old.team_id and not retired;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.retire_stage_live_access() from public,anon,authenticated;
create trigger stage_live_member_access after update of status,role,custom_role_id,profile_id on public.team_members for each row execute function private.retire_stage_live_access();
create trigger stage_live_permission_access after insert or update or delete on public.team_permission_overrides for each row execute function private.retire_stage_live_access();
create trigger stage_live_custom_role_access after update of permissions or delete on public.custom_roles for each row execute function private.retire_stage_live_access();

create function private.retire_stage_live_parent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='setlists' then
  if (old.deleted_at,old.event_id) is distinct from (new.deleted_at,new.event_id) then update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where setlist_id=old.id and not retired; end if;
 elsif tg_table_name='events' then
  if (old.deleted_at,old.approval_status) is distinct from (new.deleted_at,new.approval_status) then
   update private.stage_live_leases l set retired=true,expires_at=clock_timestamp() where exists(select 1 from public.setlists s where s.id=l.setlist_id and s.event_id=old.id) and not retired;
  end if;
 else
  if tg_op='UPDATE' and (old.id,old.setlist_id,old.song_id,old.song_order,old.deleted_at) is not distinct from (new.id,new.setlist_id,new.song_id,new.song_order,new.deleted_at) then return new; end if;
  if tg_op<>'INSERT' then update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where setlist_id=old.setlist_id and not retired; end if;
  if tg_op<>'DELETE' then update private.stage_live_leases set retired=true,expires_at=clock_timestamp() where setlist_id=new.setlist_id and not retired; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.retire_stage_live_parent() from public,anon,authenticated;
create trigger stage_live_setlist_parent after update of deleted_at,event_id on public.setlists for each row execute function private.retire_stage_live_parent();
create trigger stage_live_event_parent after update of deleted_at,approval_status on public.events for each row execute function private.retire_stage_live_parent();
create trigger stage_live_slot_layout after insert or update of id,setlist_id,song_id,song_order,deleted_at or delete on public.setlist_songs for each row execute function private.retire_stage_live_parent();

create function public.stage_live_cursor(p_team_id uuid,p_member_id uuid,p_setlist_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_action text:=p_request->>'action'; v_parent public.setlists%rowtype; v_event public.events%rowtype;
 v_row private.stage_live_leases%rowtype; v_layout jsonb; v_item jsonb; v_id uuid; v_session uuid; v_sequence bigint; v_now timestamptz; v_state jsonb:='null';
begin
 perform private.require_mobile_template_identity(p_team_id,p_member_id);
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 then raise exception 'Invalid live Stage request' using errcode='22023'; end if;
 if v_action='read' then perform private.validate_mobile_service_object(p_request,array['action','orderedSlotIds']);
 elsif v_action='claim' then perform private.validate_mobile_service_object(p_request,array['action','orderedSlotIds','sessionId','previousSessionId','cursor']);
 elsif v_action='publish' then perform private.validate_mobile_service_object(p_request,array['action','orderedSlotIds','sessionId','sequence','cursor']);
 elsif v_action in ('heartbeat','release') then perform private.validate_mobile_service_object(p_request,array['action','orderedSlotIds','sessionId','sequence']);
 else raise exception 'Invalid live Stage action' using errcode='22023'; end if;
 if jsonb_typeof(p_request->'orderedSlotIds') is distinct from 'array' or jsonb_array_length(p_request->'orderedSlotIds') not between 1 and 200 then raise exception 'Invalid Stage layout' using errcode='22023'; end if;
 for v_item in select value from jsonb_array_elements(p_request->'orderedSlotIds') loop
  if jsonb_typeof(v_item) is distinct from 'string' then raise exception 'Invalid Stage occurrence' using errcode='22023'; end if;
  v_id:=(v_item#>>'{}')::uuid;
 end loop;
 if (select count(*)<>count(distinct value) from jsonb_array_elements(p_request->'orderedSlotIds')) then raise exception 'Duplicate Stage occurrence' using errcode='22023'; end if;
 if v_action<>'read' then
  if jsonb_typeof(p_request->'sessionId') is distinct from 'string' then raise exception 'Invalid live session' using errcode='22023'; end if;
  v_session:=(p_request->>'sessionId')::uuid;
 end if;
 if v_action='claim' then
  if jsonb_typeof(p_request->'previousSessionId') not in ('string','null') then raise exception 'Invalid Stage fence' using errcode='22023'; end if;
  if p_request->'previousSessionId'<>'null'::jsonb then v_id:=(p_request->>'previousSessionId')::uuid; end if;
  if v_session=(p_request->>'previousSessionId')::uuid then raise exception 'Restart requires a new session' using errcode='22023'; end if;
 elsif v_action<>'read' then
  if jsonb_typeof(p_request->'sequence') is distinct from 'number' or (p_request->>'sequence')::numeric not between 1 and 9007199254740991
    or mod((p_request->>'sequence')::numeric,1)<>0 then raise exception 'Invalid live sequence' using errcode='22023'; end if;
  v_sequence:=(p_request->>'sequence')::bigint;
 end if;
 if v_action in ('claim','publish') then
  perform private.validate_mobile_service_object(p_request->'cursor',array['slotId','sectionIndex']);
  if jsonb_typeof(p_request#>'{cursor,slotId}') is distinct from 'string' or jsonb_typeof(p_request#>'{cursor,sectionIndex}') is distinct from 'number'
    or (p_request#>>'{cursor,sectionIndex}')::numeric not between 0 and 2047 or mod((p_request#>>'{cursor,sectionIndex}')::numeric,1)<>0
    or not exists(select 1 from jsonb_array_elements(p_request->'orderedSlotIds') slot where slot=p_request#>'{cursor,slotId}') then raise exception 'Invalid bounded Stage cursor' using errcode='22023'; end if;
 end if;
 select * into v_parent from public.setlists where id=p_setlist_id and team_id=p_team_id and deleted_at is null;
 if not found then raise exception 'Stage setlist unavailable' using errcode='42501'; end if;
 if v_parent.event_id is not null then
  select * into v_event from public.events where id=v_parent.event_id and team_id=p_team_id and deleted_at is null and approval_status='approved' for share;
  if not found then raise exception 'Confirmed Stage event required' using errcode='42501'; end if;
 end if;
 perform 1 from public.setlists where id=p_setlist_id and team_id=p_team_id and deleted_at is null and event_id is not distinct from v_parent.event_id for share;
 if not found then raise exception 'Stage parent changed' using errcode='40001'; end if;
 select coalesce(jsonb_agg(id order by song_order,id),'[]'::jsonb) into v_layout from public.setlist_songs where setlist_id=p_setlist_id and deleted_at is null;
 if v_layout is distinct from p_request->'orderedSlotIds' then raise exception 'Refresh the Stage song order' using errcode='40001'; end if;
 select * into v_row from private.stage_live_leases where setlist_id=p_setlist_id for update;
 v_now:=clock_timestamp();
 if v_row.setlist_id is not null and (v_row.ordered_slot_ids is distinct from v_layout or not private.stage_live_can_publish(p_team_id,v_row.publisher_member_id,v_row.publisher_user_id)) then
  update private.stage_live_leases set retired=true,expires_at=v_now where setlist_id=p_setlist_id returning * into v_row;
 end if;
 if v_action<>'read' then
  if not private.has_workspace_permission(p_team_id,'setlists.manage') then raise exception 'Current setlist manager required for live broadcasting' using errcode='42501'; end if;
  if v_action='claim' then
   if v_row.session_id=v_session then
    if v_row.publisher_user_id<>auth.uid() or v_row.publisher_member_id<>p_member_id or v_row.retired or v_row.expires_at<=v_now or v_row.claim_json is distinct from p_request then raise exception 'Live claim is no longer current' using errcode='40001'; end if;
   else
    if v_row.setlist_id is not null and not v_row.retired and v_row.expires_at>v_now then raise exception 'Another live publisher owns this lease' using errcode='40001'; end if;
    if coalesce(to_jsonb(v_row.session_id),'null'::jsonb) is distinct from p_request->'previousSessionId' then raise exception 'Read the current Stage fence before starting' using errcode='40001'; end if;
    insert into private.stage_live_leases(setlist_id,team_id,session_id,previous_session_id,publisher_user_id,publisher_member_id,sequence,ordered_slot_ids,slot_id,section_index,claim_json,last_request_json,expires_at,retired)
     values(p_setlist_id,p_team_id,v_session,(p_request->>'previousSessionId')::uuid,auth.uid(),p_member_id,0,v_layout,(p_request#>>'{cursor,slotId}')::uuid,(p_request#>>'{cursor,sectionIndex}')::integer,p_request,p_request,v_now+interval '25seconds',false)
     on conflict(setlist_id) do update set session_id=excluded.session_id,previous_session_id=excluded.previous_session_id,publisher_user_id=excluded.publisher_user_id,publisher_member_id=excluded.publisher_member_id,
      sequence=0,ordered_slot_ids=excluded.ordered_slot_ids,slot_id=excluded.slot_id,section_index=excluded.section_index,claim_json=excluded.claim_json,last_request_json=excluded.last_request_json,expires_at=excluded.expires_at,retired=false returning * into v_row;
   end if;
  else
   if v_row.setlist_id is null or v_row.session_id<>v_session or v_row.publisher_user_id<>auth.uid() or v_row.publisher_member_id<>p_member_id then raise exception 'Live session owner changed' using errcode='40001'; end if;
   if v_action='release' and v_row.retired and v_sequence=v_row.sequence and p_request=v_row.last_request_json then null;
   else
    if v_row.retired or v_row.expires_at<=v_now then raise exception 'Live session expired; explicitly restart' using errcode='40001'; end if;
    if v_sequence=v_row.sequence then
     if p_request is distinct from v_row.last_request_json then raise exception 'Live sequence payload changed' using errcode='40001'; end if;
    else
     if v_sequence<>v_row.sequence+1 then raise exception 'Stale or skipped live sequence' using errcode='40001'; end if;
     update private.stage_live_leases set sequence=v_sequence,last_request_json=p_request,
      slot_id=case when v_action='publish' then (p_request#>>'{cursor,slotId}')::uuid else slot_id end,
      section_index=case when v_action='publish' then (p_request#>>'{cursor,sectionIndex}')::integer else section_index end,
      retired=v_action='release',expires_at=case when v_action='release' then v_now else v_now+interval '25seconds' end
      where setlist_id=p_setlist_id returning * into v_row;
    end if;
   end if;
  end if;
 end if;
 v_now:=clock_timestamp();
 if v_row.setlist_id is not null and not v_row.retired and v_row.expires_at>v_now then
  v_state:=jsonb_build_object('sessionId',v_row.session_id,'publisherMemberId',v_row.publisher_member_id,'sequence',v_row.sequence,
   'orderedSlotIds',v_row.ordered_slot_ids,'cursor',jsonb_build_object('slotId',v_row.slot_id,'sectionIndex',v_row.section_index),'expiresAt',v_row.expires_at);
 end if;
 return jsonb_build_object('version',1,'teamId',p_team_id,'setlistId',p_setlist_id,'serverNow',v_now,'fenceSessionId',v_row.session_id,'state',v_state);
end;
$$;
revoke all on function public.stage_live_cursor(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.stage_live_cursor(uuid,uuid,uuid,jsonb) to authenticated;
commit;
