-- DRAFT: apply only through an explicitly authorized backend release.
-- Keep prior mobile versions and the public website aggregate wrapper intact.
begin;

create table public.mobile_setlist_command_receipts (
 actor_id uuid not null, team_id uuid not null references public.teams(id) on delete cascade,
 member_id uuid not null, command_id uuid not null, setlist_id uuid not null,
 command jsonb not null, payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),
 result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,team_id,command_id)
);
create index mobile_setlist_receipts_target on public.mobile_setlist_command_receipts(team_id,setlist_id);
alter table public.mobile_setlist_command_receipts enable row level security;
revoke all on public.mobile_setlist_command_receipts from public,anon,authenticated;
-- No direct read/write policy: current authority is rechecked by the guarded RPC on every replay.
create function private.guard_mobile_setlist_receipt_id() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then raise exception 'Setlist command receipts are immutable' using errcode='22023'; end if;
 -- All supported writers already hold the existing per-team workspace lock.
 -- A late legacy insertion error rolls its enclosing write back, including its mutation.
 if tg_table_name='mobile_setlist_command_receipts' then
  if exists(select 1 from public.mobile_workflow_command_receipts where actor_id=new.actor_id and team_id=new.team_id and command_id=new.command_id)
   or exists(select 1 from public.mobile_command_receipts where actor_id=new.actor_id and team_id=new.team_id and command_id=new.command_id) then
   raise exception 'Command ID belongs to another mobile ledger' using errcode='22023';
  end if;
 elsif exists(select 1 from public.mobile_setlist_command_receipts where actor_id=new.actor_id and team_id=new.team_id and command_id=new.command_id) then
  raise exception 'Command ID belongs to a setlist receipt' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_mobile_setlist_receipt_id() from public,anon,authenticated;
create trigger mobile_setlist_receipt_guard before insert or update on public.mobile_setlist_command_receipts for each row execute function private.guard_mobile_setlist_receipt_id();
create trigger mobile_workflow_reserve_setlist_id before insert on public.mobile_workflow_command_receipts for each row execute function private.guard_mobile_setlist_receipt_id();
create trigger mobile_v1_reserve_setlist_id before insert on public.mobile_command_receipts for each row execute function private.guard_mobile_setlist_receipt_id();

create function private.mobile_setlist_snapshot(p_team uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('record',to_jsonb(s),'slots',coalesce((select jsonb_agg(to_jsonb(ss) order by song_order,id) from public.setlist_songs ss where setlist_id=s.id and deleted_at is null),'[]'::jsonb),
 'linkedEvent',(select private.mobile_event_snapshot(p_team,e.id)->'record' from public.events e where e.id=s.event_id and e.team_id=p_team
   and (e.approval_status='approved' or e.created_by=auth.uid() or private.has_team_role(p_team,array['owner','admin']::public.team_role[]))))
 from public.setlists s where s.id=p_id and s.team_id=p_team;
$$;
revoke all on function private.mobile_setlist_snapshot(uuid,uuid) from public,anon,authenticated;

create function private.mobile_setlist_delete_review(p_team uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb; v_siblings jsonb; v_scope jsonb;
begin
 v_snapshot:=private.mobile_setlist_snapshot(p_team,p_id);
 if v_snapshot is null or v_snapshot->'record'->>'deleted_at' is not null then return null; end if;
 if v_snapshot->'record'->>'event_id' is not null and (v_snapshot->>'linkedEvent' is null or v_snapshot->'linkedEvent'->>'deleted_at' is not null) then return null; end if;
 select coalesce(jsonb_agg(private.mobile_setlist_snapshot(p_team,id) order by id),'[]'::jsonb),
   coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',sync_revision) order by id),'[]'::jsonb) into v_siblings,v_scope
 from public.setlists where team_id=p_team and id<>p_id and event_id=(v_snapshot->'record'->>'event_id')::uuid;
 return jsonb_build_object('snapshot',v_snapshot,'cascade',jsonb_build_object('deleteLinkedEvent',v_snapshot->'record'->>'event_id' is not null,'unlinkSetlists',v_scope),'siblings',v_siblings);
end;
$$;
revoke all on function private.mobile_setlist_delete_review(uuid,uuid) from public,anon,authenticated;

create function private.require_mobile_setlist_member(p_team uuid,p_member uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_team is null or p_member is null then raise exception 'Selected authenticated team required' using errcode='42501'; end if;
 perform private.lock_workspace_members(p_team);
 if not exists(select 1 from public.team_members where id=p_member and team_id=p_team and profile_id=auth.uid() and status='active')
   or not private.has_workspace_permission(p_team,'setlists.manage') then raise exception 'Current setlist permission and matching active membership required' using errcode='42501'; end if;
end;
$$;
revoke all on function private.require_mobile_setlist_member(uuid,uuid) from public,anon,authenticated;

-- Immutable receipts retain commit-time content, but may only disclose events still visible now.
-- Check every full event location in the result contract; deletion ID/revision tombstones contain no event content.
create function private.assert_mobile_setlist_result_visibility(p_team uuid,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_event jsonb;
begin
 for v_event in
  select distinct value from (
   values (p_result#>'{outcome,snapshot,linkedEvent}'),(p_result#>'{baseValue,linkedEvent}'),
    (p_result#>'{localValue,linkedEventBase}'),(p_result#>'{remote,snapshot,linkedEvent}'),
    (p_result#>'{remote,deleteReview,snapshot,linkedEvent}')
   union all select value->'linkedEvent' from jsonb_array_elements(coalesce(p_result#>'{outcome,unlinkedSetlists}','[]'::jsonb))
   union all select value->'linkedEvent' from jsonb_array_elements(coalesce(p_result#>'{remote,deleteReview,siblings}','[]'::jsonb))
  ) events(value) where jsonb_typeof(value)='object'
 loop
  if (v_event->>'team_id')::uuid is distinct from p_team then raise exception 'Linked event scope unavailable' using errcode='42501'; end if;
  perform 1 from public.events e where e.id=(v_event->>'id')::uuid and e.team_id=p_team and e.deleted_at is null
   and (e.approval_status='approved' or e.created_by=auth.uid() or private.has_team_role(p_team,array['owner','admin']::public.team_role[])) for share;
  if not found then raise exception 'Current linked event visibility required' using errcode='42501'; end if;
 end loop;
end;
$$;
revoke all on function private.assert_mobile_setlist_result_visibility(uuid,jsonb) from public,anon,authenticated;

create function public.mobile_read_setlist_delete_scope(p_team_id uuid,p_member_id uuid,p_setlist_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_review jsonb; v_event uuid;
begin
 perform private.require_mobile_setlist_member(p_team_id,p_member_id);
 select event_id into v_event from public.setlists where id=p_setlist_id and team_id=p_team_id and deleted_at is null;
 if not found then raise exception 'Setlist unavailable' using errcode='42501'; end if;
 perform 1 from public.setlists where team_id=p_team_id and (id=p_setlist_id or (v_event is not null and event_id=v_event)) order by id for update;
 if v_event is not null then perform 1 from public.events where id=v_event and team_id=p_team_id for update; end if;
 v_review:=private.mobile_setlist_delete_review(p_team_id,p_setlist_id);
 if v_review is null then raise exception 'Complete linked-event scope unavailable' using errcode='42501'; end if;
 return v_review;
end;
$$;
revoke all on function public.mobile_read_setlist_delete_scope(uuid,uuid,uuid) from public,anon;
grant execute on function public.mobile_read_setlist_delete_scope(uuid,uuid,uuid) to authenticated;

create function private.prepare_mobile_setlist_form(p_value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare v_key text; v_type text:=p_value->>'eventType'; v_details jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or p_value-array['title','serviceDate','eventType','serviceType','location','callTime','rehearsalTime','worshipLeader','notes','eventId']<>'{}'::jsonb
   or not(p_value ?& array['title','serviceDate','eventType','location','callTime','rehearsalTime']) then raise exception 'Invalid setlist form fields' using errcode='22023'; end if;
 foreach v_key in array array['title','location'] loop
  if jsonb_typeof(p_value->v_key) is distinct from 'string' or length(trim(p_value->>v_key)) not between 1 and 160 then raise exception 'Invalid setlist name/location' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(p_value->'serviceDate') is distinct from 'string' or p_value->>'serviceDate'!~'^\d{4}-\d{2}-\d{2}$'
   or jsonb_typeof(p_value->'eventType') is distinct from 'string' or v_type not in ('service','rehearsal','meeting','special_event','service_rehearsal') then raise exception 'Invalid setlist date/type' using errcode='22023'; end if;
 perform (p_value->>'serviceDate')::date;
 foreach v_key in array array['callTime','rehearsalTime'] loop
  if jsonb_typeof(p_value->v_key) is distinct from 'string' or trim(p_value->>v_key)!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then raise exception 'Invalid setlist time' using errcode='22023'; end if;
 end loop;
 foreach v_key in array array['serviceType','notes','worshipLeader','eventId'] loop
  if p_value ? v_key and (jsonb_typeof(p_value->v_key) is distinct from 'string' or length(trim(p_value->>v_key))>case v_key when 'serviceType' then 80 when 'notes' then 2000 else 160 end) then raise exception 'Invalid optional setlist field' using errcode='22023'; end if;
 end loop;
 if v_type in ('service','service_rehearsal') and coalesce(length(trim(p_value->>'serviceType')),0)=0 then raise exception 'Service type is required' using errcode='22023'; end if;
 if nullif(trim(p_value->>'worshipLeader'),'') is not null then perform (p_value->>'worshipLeader')::uuid; end if;
 if nullif(trim(p_value->>'eventId'),'') is not null then perform (p_value->>'eventId')::uuid; end if;
 v_details:=jsonb_build_object('name',trim(p_value->>'title'),'event_type',v_type,'setlist_date',p_value->>'serviceDate','location',trim(p_value->>'location'),
   'call_time',trim(p_value->>'callTime'),'rehearsal_time',trim(p_value->>'rehearsalTime'),'service_times',case when v_type in ('service','service_rehearsal') then jsonb_build_array(trim(p_value->>'serviceType')) else '[]'::jsonb end,
   'notes',nullif(trim(p_value->>'notes'),''),'update_event',false);
 if p_value ? 'worshipLeader' then v_details:=v_details||jsonb_build_object('leader_member_id',nullif(trim(p_value->>'worshipLeader'),'')); end if;
 return v_details;
end;
$$;
revoke all on function private.prepare_mobile_setlist_form(jsonb) from public,anon,authenticated;

create function private.validate_setlist_wire_row(p_kind text,p_value jsonb) returns void language plpgsql set search_path='' as $$
declare v_fields jsonb; v_key text; v_type text; v_value jsonb; v_item jsonb; v_keys text[];
begin
 v_fields:=case p_kind
 when 'setlist' then '{"id":"uuid","team_id":"uuid","name":"text","setlist_date":"date","event_id":"uuid?","location":"text?","call_time":"clock?","rehearsal_time":"clock?","service_times":"strings","notes":"text?","leader_member_id":"uuid?","presentation_settings":"json","created_by":"uuid","created_at":"timestamp","updated_at":"timestamp","deleted_at":"timestamp?","sync_revision":"revision"}'::jsonb
 when 'slot' then '{"id":"uuid","setlist_id":"uuid","song_id":"uuid","song_order":"positive","assigned_key":"text","notes":"text?","band_notes":"text?","arrangement":"text?","lead_member_id":"uuid?","youtube_url":"text?","slide_settings":"json","created_at":"timestamp","updated_at":"timestamp","deleted_at":"timestamp?","sync_revision":"revision"}'::jsonb
 when 'event' then '{"id":"uuid","team_id":"uuid","name":"text","type":"eventType","event_date":"date","starts_at":"clock","ends_at":"clock?","call_time":"clock?","location":"text?","description":"text?","rehearsal_date":"date?","rehearsal_time":"clock?","rehearsal_end_time":"clock?","recurrence_rule":"text?","recurrence_parent_id":"uuid?","approval_status":"approval","requested_assignments":"assignments","created_by":"uuid","created_at":"timestamp","updated_at":"timestamp","deleted_at":"timestamp?","sync_revision":"revision"}'::jsonb
 when 'template' then '{"id":"uuid","team_id":"uuid","name":"text","description":"text?","slots":"json","created_by":"uuid?","created_at":"timestamp?"}'::jsonb end;
 if v_fields is null then raise exception 'Unknown setlist wire record' using errcode='22023'; end if;
 select array_agg(key) into v_keys from jsonb_each(v_fields);
 perform private.validate_mobile_service_object(p_value,v_keys);
 for v_key,v_type in select key,value from jsonb_each_text(v_fields) loop
  v_value:=p_value->v_key;
  if v_type='json' then continue; end if;
  if right(v_type,1)='?' then if v_value='null'::jsonb then continue; end if; v_type:=left(v_type,length(v_type)-1); end if;
  if v_type in ('revision','positive') then
   if jsonb_typeof(v_value)<>'number' or (v_value#>>'{}')::numeric not between 0 and 9007199254740991 or (v_type='positive' and (v_value#>>'{}')::numeric<1)
     or (v_value#>>'{}')::numeric<>trunc((v_value#>>'{}')::numeric) then raise exception 'Invalid saved revision/order' using errcode='22023'; end if;
   if v_type='positive' then perform (v_value#>>'{}')::integer; end if;
  elsif v_type in ('strings','assignments') then
   if jsonb_typeof(v_value)<>'array' then raise exception 'Invalid saved list' using errcode='22023'; end if;
   if v_type='assignments' and jsonb_array_length(v_value)>100 then raise exception 'Too many saved assignments' using errcode='22023'; end if;
   for v_item in select value from jsonb_array_elements(v_value) loop
    if v_type='strings' then
     if jsonb_typeof(v_item)<>'string' then raise exception 'Invalid saved text list' using errcode='22023'; end if;
    else
     perform private.validate_mobile_service_object(v_item,array['team_member_id','assignment']);
     if jsonb_typeof(v_item->'team_member_id')<>'string' or jsonb_typeof(v_item->'assignment')<>'string'
       or v_item->>'assignment' not in ('Worship Leader','Acoustic Guitar','Electric Guitar','Bass','Drums','Main Keys','Second Keys','Band Member','Backup Singer','Media','Dancers') then raise exception 'Invalid saved assignment' using errcode='22023'; end if;
     perform (v_item->>'team_member_id')::uuid;
    end if;
   end loop;
   if v_type='assignments' and (select count(*)<>count(distinct value) from jsonb_array_elements(v_value)) then raise exception 'Repeated saved assignment' using errcode='22023'; end if;
  else
   if jsonb_typeof(v_value)<>'string' then raise exception 'Invalid saved record field type' using errcode='22023'; end if;
   case v_type
   when 'uuid' then perform (v_value#>>'{}')::uuid;
   when 'date' then
    if v_value#>>'{}'!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid saved date' using errcode='22023'; end if; perform (v_value#>>'{}')::date;
   when 'timestamp' then
    if v_value#>>'{}'!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid saved timestamp' using errcode='22023'; end if; perform (v_value#>>'{}')::timestamptz;
   when 'clock' then
    if v_value#>>'{}'!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?$' then raise exception 'Invalid saved time' using errcode='22023'; end if;
   when 'eventType' then if v_value#>>'{}' not in ('service','rehearsal','meeting','special_event','service_rehearsal') then raise exception 'Invalid saved event type' using errcode='22023'; end if;
   when 'approval' then if v_value#>>'{}' not in ('pending','approved','rejected') then raise exception 'Invalid saved event approval' using errcode='22023'; end if;
   else null;
   end case;
  end if;
 end loop;
end;
$$;
revoke all on function private.validate_setlist_wire_row(text,jsonb) from public,anon,authenticated;

create function private.validate_setlist_wire_snapshot(p_value jsonb,p_team uuid) returns void language plpgsql set search_path='' as $$
declare v_slot jsonb; v_parent uuid;
begin
 perform private.validate_mobile_service_object(p_value,array['record','slots','linkedEvent']);
 perform private.validate_setlist_wire_row('setlist',p_value->'record');
 v_parent:=(p_value->'record'->>'id')::uuid;
 if (p_value->'record'->>'team_id')::uuid<>p_team or jsonb_typeof(p_value->'slots')<>'array' then raise exception 'Saved setlist belongs to another team or has invalid slots' using errcode='22023'; end if;
 for v_slot in select value from jsonb_array_elements(p_value->'slots') loop
  perform private.validate_setlist_wire_row('slot',v_slot);
  if (v_slot->>'setlist_id')::uuid<>v_parent or v_slot->>'deleted_at' is not null then raise exception 'Invalid active saved slot' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') or count(*)<>count(distinct value->>'song_order') from jsonb_array_elements(p_value->'slots')) then raise exception 'Repeated saved slot identity/order' using errcode='22023'; end if;
 if p_value->'linkedEvent'<>'null'::jsonb then
  perform private.validate_setlist_wire_row('event',p_value->'linkedEvent');
  if (p_value->'linkedEvent'->>'team_id')::uuid<>p_team or p_value->'linkedEvent'->>'id' is distinct from p_value->'record'->>'event_id' then raise exception 'Invalid saved linked event' using errcode='22023'; end if;
 end if;
end;
$$;
revoke all on function private.validate_setlist_wire_snapshot(jsonb,uuid) from public,anon,authenticated;

create function private.validate_mobile_setlist_command(p_command jsonb,p_team uuid) returns void language plpgsql set search_path='' as $$
declare v_type text:=p_command->>'type'; v_key text; v_value jsonb; v_slot jsonb; v_base jsonb; v_original jsonb; v_sources uuid[]:='{}'; v_locals uuid[]:='{}'; v_targets uuid[]:='{}';
 v_local uuid; v_source uuid; v_target uuid; v_new_ids uuid[]; v_columns jsonb:='{"assignedKey":"assigned_key","notes":"notes","bandNotes":"band_notes","arrangement":"arrangement","leadMemberId":"lead_member_id","youtubeUrl":"youtube_url","slideSettings":"slide_settings"}';
 v_common text[]:=array['commandId','setlistId','baseRevision','dependsOn','type','baseValue']; v_template jsonb; v_count integer;
begin
 if v_type='setlist.save' then perform private.validate_mobile_service_object(p_command,v_common||array['mode','linkedEventBase','template','value']);
 elsif v_type='setlist.delete' then perform private.validate_mobile_service_object(p_command,v_common||array['cascade']);
 else raise exception 'Unsupported setlist command' using errcode='22023'; end if;
 foreach v_key in array array['commandId','setlistId'] loop
  if jsonb_typeof(p_command->v_key)<>'string' then raise exception 'Invalid setlist command identity' using errcode='22023'; end if; perform (p_command->>v_key)::uuid;
 end loop;
 if p_command->>'commandId'=p_command->>'setlistId' or jsonb_typeof(p_command->'baseRevision')<>'number'
   or (p_command->>'baseRevision')::numeric not between 0 and 9007199254740991 or (p_command->>'baseRevision')::numeric<>trunc((p_command->>'baseRevision')::numeric)
   or jsonb_typeof(p_command->'dependsOn')<>'array' or jsonb_array_length(p_command->'dependsOn')>25 then raise exception 'Invalid setlist revision/dependencies' using errcode='22023'; end if;
 for v_value in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if jsonb_typeof(v_value)<>'string' then raise exception 'Invalid dependency identity' using errcode='22023'; end if;
  perform (v_value#>>'{}')::uuid;
  if (v_value#>>'{}')::uuid=(p_command->>'commandId')::uuid then raise exception 'A command cannot depend on itself' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct (value#>>'{}')::uuid) from jsonb_array_elements(p_command->'dependsOn')) then raise exception 'Repeated command dependency' using errcode='22023'; end if;
 if v_type='setlist.save' and p_command->>'mode'='create' then
  if p_command->'baseValue'<>'null'::jsonb or p_command->>'baseRevision'<>'0' then raise exception 'A new setlist requires no base and revision zero' using errcode='22023'; end if;
 else
  perform private.validate_setlist_wire_snapshot(p_command->'baseValue',p_team);
  if p_command->'baseValue'->'record'->>'id' is distinct from p_command->>'setlistId'
    or p_command->'baseValue'->'record'->'sync_revision' is distinct from p_command->'baseRevision'
    or p_command->'baseValue'->'record'->>'deleted_at' is not null then raise exception 'Capture this active setlist exact revision and original' using errcode='22023'; end if;
 end if;
 if v_type='setlist.delete' then
  perform private.validate_mobile_service_object(p_command->'cascade',array['deleteLinkedEvent','unlinkSetlists']);
  if jsonb_typeof(p_command->'cascade'->'deleteLinkedEvent')<>'boolean' or jsonb_typeof(p_command->'cascade'->'unlinkSetlists')<>'array'
    or (p_command->'cascade'->>'deleteLinkedEvent')::boolean is distinct from (p_command->'baseValue'->'record'->>'event_id' is not null)
    or (p_command->'baseValue'->'record'->>'event_id' is not null and (p_command->'baseValue'->>'linkedEvent' is null or p_command->'baseValue'->'linkedEvent'->>'deleted_at' is not null)) then raise exception 'Review the linked event deletion scope' using errcode='22023'; end if;
  for v_value in select value from jsonb_array_elements(p_command->'cascade'->'unlinkSetlists') loop
   perform private.validate_mobile_service_object(v_value,array['id','revision']);
   if jsonb_typeof(v_value->'id')<>'string' or jsonb_typeof(v_value->'revision')<>'number' or (v_value->>'revision')::numeric not between 0 and 9007199254740991
     or (v_value->>'revision')::numeric<>trunc((v_value->>'revision')::numeric) or (v_value->>'id')::uuid=(p_command->>'setlistId')::uuid then raise exception 'Invalid sibling setlist base' using errcode='22023'; end if;
  end loop;
  if (select count(*)<>count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_command->'cascade'->'unlinkSetlists'))
    or (p_command->'baseValue'->'record'->>'event_id' is null and jsonb_array_length(p_command->'cascade'->'unlinkSetlists')<>0) then raise exception 'Invalid sibling scope' using errcode='22023'; end if;
  return;
 end if;
 if jsonb_typeof(p_command->'mode') is distinct from 'string' or p_command->>'mode' not in ('create','update') then raise exception 'Invalid setlist save mode' using errcode='22023'; end if;
 perform private.validate_mobile_service_object(p_command->'value',array['form','slots']);
 perform private.prepare_mobile_setlist_form(p_command->'value'->'form');
 if p_command->'linkedEventBase'<>'null'::jsonb then
  perform private.validate_setlist_wire_row('event',p_command->'linkedEventBase');
  if (p_command->'linkedEventBase'->>'team_id')::uuid<>p_team then raise exception 'Selected event belongs to another team' using errcode='22023'; end if;
 end if;
 if p_command->>'mode'='update' then
  if p_command->'template'<>'null'::jsonb or p_command->'linkedEventBase' is distinct from p_command->'baseValue'->'linkedEvent'
    or (p_command->'value'->'form' ? 'eventId' and nullif(p_command->'value'->'form'->>'eventId','') is distinct from p_command->'baseValue'->'record'->>'event_id') then raise exception 'Update preserves original event and has no new template' using errcode='22023'; end if;
 elsif nullif(p_command->'value'->'form'->>'eventId','') is distinct from p_command->'linkedEventBase'->>'id'
   or (p_command->'linkedEventBase'<>'null'::jsonb and (p_command->'linkedEventBase'->>'approval_status'<>'approved' or p_command->'linkedEventBase'->>'deleted_at' is not null)) then raise exception 'Capture the selected active approved event' using errcode='22023'; end if;
 if jsonb_typeof(p_command->'value'->'slots')<>'array' or jsonb_array_length(p_command->'value'->'slots')>200 then raise exception 'Invalid desired slot list' using errcode='22023'; end if;
 for v_slot in select value from jsonb_array_elements(p_command->'value'->'slots') loop
  perform private.validate_mobile_service_object(v_slot,array['localId','sourceSlotId','songId','assignedKey','notes','bandNotes','arrangement','leadMemberId','youtubeUrl','slideSettings']);
  if jsonb_typeof(v_slot->'localId')<>'string' or jsonb_typeof(v_slot->'songId')<>'string' or jsonb_typeof(v_slot->'sourceSlotId') not in ('null','string') then raise exception 'Invalid desired slot identities' using errcode='22023'; end if;
  v_local:=(v_slot->>'localId')::uuid; v_source:=(v_slot->>'sourceSlotId')::uuid; v_target:=coalesce(v_source,v_local); perform (v_slot->>'songId')::uuid;
  v_original:=null;
  if p_command->'baseValue'<>'null'::jsonb then select value into v_original from jsonb_array_elements(p_command->'baseValue'->'slots') where (value->>'id')::uuid=v_source; end if;
  if v_local=any(v_locals) or v_target=any(v_targets) or v_local in ((p_command->>'setlistId')::uuid,(p_command->>'commandId')::uuid) or v_target in ((p_command->>'setlistId')::uuid,(p_command->>'commandId')::uuid)
    or (v_source is not null and (v_original is null or v_original->>'song_id'<>v_slot->>'songId'))
    or (p_command->'baseValue'<>'null'::jsonb and exists(select 1 from jsonb_array_elements(p_command->'baseValue'->'slots') where (value->>'id')::uuid=v_local and (value->>'id')::uuid is distinct from v_source)) then raise exception 'Desired slot IDs or song occurrence changed identity' using errcode='22023'; end if;
  v_locals:=array_append(v_locals,v_local); v_targets:=array_append(v_targets,v_target);
  for v_key in select jsonb_object_keys(v_columns) loop
   v_value:=v_slot->v_key; v_base:=v_original->(v_columns->>v_key);
   if v_key='assignedKey' then
    if jsonb_typeof(v_value)<>'string' then raise exception 'Invalid song key type' using errcode='22023'; end if;
   elsif v_key<>'slideSettings' and jsonb_typeof(v_value) not in ('string','null') then raise exception 'Invalid song metadata type' using errcode='22023'; end if;
   if v_original is not null and v_value is not distinct from v_base then continue; end if;
   if v_key='slideSettings' then
    if (v_source is not null or v_value<>'null'::jsonb) and jsonb_typeof(v_value)<>'object' then raise exception 'Invalid changed slide layout' using errcode='22023'; end if;
   elsif v_key='assignedKey' then
    if length(trim(v_slot->>v_key)) not between 1 and 3 then raise exception 'Invalid changed song key' using errcode='22023'; end if;
   elsif v_key='leadMemberId' then if v_value<>'null'::jsonb then perform (v_slot->>v_key)::uuid; end if;
   elsif v_value<>'null'::jsonb and length(v_slot->>v_key)>(case v_key when 'notes' then 2000 when 'youtubeUrl' then 500 else 4000 end) then raise exception 'Changed song metadata is too long' using errcode='22023'; end if;
  end loop;
 end loop;
 v_template:=p_command->'template';
 if v_template<>'null'::jsonb then
  perform private.validate_mobile_service_object(v_template,array['base','placeholders']); perform private.validate_setlist_wire_row('template',v_template->'base');
  if (v_template->'base'->>'team_id')::uuid<>p_team or p_command->>'mode'<>'create' or jsonb_typeof(v_template->'base'->'slots')<>'array'
    or jsonb_typeof(v_template->'placeholders')<>'array' or jsonb_array_length(v_template->'base'->'slots')<>jsonb_array_length(v_template->'placeholders')
    or jsonb_array_length(v_template->'placeholders')+jsonb_array_length(p_command->'value'->'slots')>200 then raise exception 'Invalid captured template positions' using errcode='22023'; end if;
  v_new_ids:=v_locals||v_targets||array[(p_command->>'setlistId')::uuid,(p_command->>'commandId')::uuid];
  for v_value in select value from jsonb_array_elements(v_template->'placeholders') loop
   perform private.validate_mobile_service_object(v_value,array['slotId','songId']);
   if jsonb_typeof(v_value->'slotId')<>'string' or jsonb_typeof(v_value->'songId')<>'string' then raise exception 'Invalid template stable ID types' using errcode='22023'; end if;
   v_local:=(v_value->>'slotId')::uuid; v_target:=(v_value->>'songId')::uuid;
   if v_local=v_target or v_local=any(v_new_ids) or v_target=any(v_new_ids)
     or exists(select 1 from jsonb_array_elements(p_command->'value'->'slots') where (value->>'songId')::uuid=v_target) then raise exception 'Template stable IDs overlap saved work' using errcode='22023'; end if;
   v_new_ids:=v_new_ids||array[v_local,v_target];
  end loop;
 end if;
end;
$$;
revoke all on function private.validate_mobile_setlist_command(jsonb,uuid) from public,anon,authenticated;

create function private.apply_mobile_setlist_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid:=(p_command->>'commandId')::uuid; v_target uuid:=(p_command->>'setlistId')::uuid;
 v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex'); v_type text:=p_command->>'type';
 v_receipt public.mobile_setlist_command_receipts%rowtype; v_common jsonb; v_result jsonb; v_dependency jsonb; v_snapshot jsonb;
 v_details jsonb; v_intent jsonb; v_event uuid; v_template uuid; v_songs uuid[]; v_placeholders jsonb; v_scope jsonb; v_siblings jsonb;
 v_remote_template jsonb; v_setlist_deleted jsonb; v_event_deleted jsonb; v_local jsonb;
begin
 perform private.require_mobile_setlist_member(p_team,p_member);
 -- Do not replay an owner's former private pending-event deletion after losing that action's role.
 if v_type='setlist.delete' and p_command->'baseValue'->'linkedEvent'->>'approval_status' is not null
   and p_command->'baseValue'->'linkedEvent'->>'approval_status'<>'approved'
   and not private.has_team_role(p_team,array['owner','admin']::public.team_role[]) then raise exception 'Current linked-event deletion permission required' using errcode='42501'; end if;
 v_common:=jsonb_build_object('commandId',v_id,'setlistId',v_target,'type',v_type,'payloadHash',v_hash);
 select * into v_receipt from public.mobile_setlist_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id;
 if found then
  if v_receipt.member_id<>p_member or v_receipt.payload_hash<>v_hash or v_receipt.command is distinct from p_command then
   return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID belongs to another saved intent. Keep the original and use a new ID.');
  end if;
  perform private.assert_mobile_setlist_result_visibility(p_team,v_receipt.result);
  -- Exact authorized replay includes successful deletes whose own target no longer exists.
  return v_receipt.result;
 end if;
 if exists(select 1 from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id)
   or exists(select 1 from public.mobile_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id) then
  return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID already belongs to another mobile workflow. Keep the draft and use a new ID.');
 end if;
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if not exists(select 1 from public.mobile_setlist_command_receipts where actor_id=v_actor and team_id=p_team and member_id=p_member and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied')
    and not exists(select 1 from public.mobile_workflow_command_receipts r where actor_id=v_actor and team_id=p_team and member_id=p_member and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied'
      and not exists(select 1 from public.mobile_command_receipts where actor_id=v_actor and team_id=p_team and command_id=r.command_id)) then
   v_result:=v_common||jsonb_build_object('status','blocked','code','dependency','message','A required version2 change is not confirmed. Keep the draft; resolve it before using a new command ID.'); exit;
  end if;
 end loop;
 v_snapshot:=private.mobile_setlist_snapshot(p_team,v_target);
 if v_result is null and not(v_type='setlist.save' and p_command->>'mode'='create') and (v_snapshot is null or v_snapshot->'record'->>'deleted_at' is not null) then
  v_result:=v_common||jsonb_build_object('status','rejected','code','unavailable','message','This active setlist is unavailable. Its absence does not confirm this command. Keep the draft.');
 end if;
 if v_result is null then
  begin
   if v_type='setlist.save' then
    v_details:=private.prepare_mobile_setlist_form(p_command->'value'->'form');
    select coalesce(array_agg((value->>'songId')::uuid order by n),'{}'::uuid[]) into v_songs from jsonb_array_elements(p_command->'value'->'slots') with ordinality s(value,n);
    v_event:=case when p_command->>'mode'='create' then (p_command->'linkedEventBase'->>'id')::uuid else null end;
    v_template:=(p_command->'template'->'base'->>'id')::uuid;
    v_intent:=jsonb_build_object('setlistId',v_target,'baseValue',p_command->'baseValue','slots',p_command->'value'->'slots','template',p_command->'template');
    perform private.save_setlist_workspace_core(p_team,case when p_command->>'mode'='create' then null else v_target end,v_event,v_details,v_songs,v_template,(p_command->>'baseRevision')::bigint,v_intent);
    select coalesce(jsonb_agg(jsonb_build_object('index',n-1,'slotId',value->'slotId','songId',value->'songId') order by n),'[]'::jsonb) into v_placeholders
      from jsonb_array_elements(coalesce(nullif(p_command->'template'->'placeholders','null'::jsonb),'[]'::jsonb)) with ordinality s(value,n);
    if p_command->>'mode'='create' then
     insert into public.activity_logs(team_id,profile_id,action,target_type,target_id,details) values(p_team,v_actor,'created','setlist',v_target,jsonb_build_object('name',v_details->'name','date',v_details->'setlist_date'));
    end if;
    v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','saved','snapshot',private.mobile_setlist_snapshot(p_team,v_target),'placeholders',v_placeholders));
   else
    v_event:=(v_snapshot->'record'->>'event_id')::uuid;
    perform private.delete_setlist_aggregate(p_team,v_target,p_command->'baseValue',p_command->'cascade');
    select jsonb_build_object('id',entity_id,'revision',revision,'deleted',true) into v_setlist_deleted from public.mobile_deleted_records where team_id=p_team and entity_type='setlist' and entity_id=v_target;
    if v_event is not null then
     select jsonb_build_object('id',event_id,'revision',revision,'deleted',true) into v_event_deleted from private.mobile_event_deletions where team_id=p_team and event_id=v_event;
    end if;
    select coalesce(jsonb_agg(private.mobile_setlist_snapshot(p_team,(value->>'id')::uuid) order by (value->>'id')::uuid),'[]'::jsonb) into v_siblings from jsonb_array_elements(p_command->'cascade'->'unlinkSetlists');
    if v_setlist_deleted is null or (v_event is not null and v_event_deleted is null) or exists(select 1 from jsonb_array_elements(v_siblings) where value='null'::jsonb) then raise exception 'Deletion confirmation state unavailable' using errcode='40001'; end if;
    v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','deleted','setlist',v_setlist_deleted,'event',v_event_deleted,'unlinkedSetlists',v_siblings));
   end if;
  exception when sqlstate '40001' then
   -- The failed operation's subtransaction has rolled back before current conflict values are read.
   v_snapshot:=private.mobile_setlist_snapshot(p_team,v_target); v_scope:=null; v_remote_template:=null;
   if v_type='setlist.delete' then v_scope:=private.mobile_setlist_delete_review(p_team,v_target); end if;
   if v_type='setlist.save' and p_command->'template'<>'null'::jsonb then
    select to_jsonb(t) into v_remote_template from public.setlist_templates t where id=(p_command->'template'->'base'->>'id')::uuid and team_id=p_team;
   end if;
   v_local:=case when v_type='setlist.save' then jsonb_build_object('mode',p_command->'mode','value',p_command->'value','linkedEventBase',p_command->'linkedEventBase','template',p_command->'template') else jsonb_build_object('cascade',p_command->'cascade') end;
   v_result:=v_common||jsonb_build_object('status','conflict','baseValue',p_command->'baseValue','localValue',v_local,'remote',jsonb_build_object('snapshot',v_snapshot,'template',v_remote_template,'deleteReview',v_scope));
  when sqlstate '42501' then
   v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current permission or related records prevent this setlist change. Keep its original draft.');
  when sqlstate '22023' or sqlstate '22P02' or sqlstate '22007' or sqlstate '22008' or sqlstate '23514' or sqlstate '23503' or sqlstate '23505' or sqlstate '22003' then
   v_result:=v_common||jsonb_build_object('status','rejected','code','invalid','message','Review this setlist change and related records. Keep its original draft.');
  end;
 end if;
 perform private.assert_mobile_setlist_result_visibility(p_team,v_result);
 insert into public.mobile_setlist_command_receipts(actor_id,team_id,member_id,command_id,setlist_id,command,payload_hash,result)
   values(v_actor,p_team,p_member,v_id,v_target,p_command,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.apply_mobile_setlist_command(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.mobile_apply_setlist_commands(p_team_id uuid,p_member_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_command jsonb; v_dependency jsonb; v_index bigint; v_results jsonb:='[]';
begin
 if auth.uid() is null or p_team_id is null or p_member_id is null then raise exception 'Selected authenticated team required' using errcode='42501'; end if;
 if p_commands is null or jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands) not between 1 and 25 or octet_length(p_commands::text)>1048576 then raise exception 'Invalid setlist command batch' using errcode='22023'; end if;
 perform private.require_mobile_setlist_member(p_team_id,p_member_id);
 -- Validate every nested command before the first mutation/receipt, including later batch entries.
 for v_command in select value from jsonb_array_elements(p_commands) loop perform private.validate_mobile_setlist_command(v_command,p_team_id); end loop;
 if (select count(*)<>count(distinct (value->>'commandId')::uuid) or count(*)<>count(distinct (value->>'setlistId')::uuid) from jsonb_array_elements(p_commands)) then raise exception 'Use distinct command IDs and one command per setlist' using errcode='22023'; end if;
 for v_command,v_index in select value,ordinality from jsonb_array_elements(p_commands) with ordinality loop
  for v_dependency in select value from jsonb_array_elements(v_command->'dependsOn') loop
   if exists(select 1 from jsonb_array_elements(p_commands) with ordinality d(value,n) where n>=v_index and (value->>'commandId')::uuid=(v_dependency#>>'{}')::uuid) then raise exception 'Dependencies must precede commands' using errcode='22023'; end if;
  end loop;
 end loop;
 for v_command in select value from jsonb_array_elements(p_commands) loop v_results:=v_results||jsonb_build_array(private.apply_mobile_setlist_command(p_team_id,p_member_id,v_command)); end loop;
 return v_results;
end;
$$;
revoke all on function public.mobile_apply_setlist_commands(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_setlist_commands(uuid,uuid,jsonb) to authenticated;
commit;
