-- DRAFT. Forward-only, local source; deployment requires reviewed authorization.
-- Existing public website signatures and v1 callers remain intact. Receipt/state
-- deletion is not rollback: disable new RPC, retain history, then fix forward.
begin;
create table private.mobile_event_deletions (
 team_id uuid not null references public.teams(id) on delete cascade, event_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 approval_status text not null check(approval_status in ('approved','pending','rejected')), created_by uuid not null,
 primary key(team_id,event_id)
);
alter table private.mobile_event_deletions enable row level security;
revoke all on private.mobile_event_deletions from public,anon,authenticated;
create function private.mobile_event_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.teams where id=old.team_id) then
  insert into private.mobile_event_deletions(team_id,event_id,revision,approval_status,created_by)
   values(old.team_id,old.id,old.sync_revision+1,old.approval_status,old.created_by)
   on conflict(team_id,event_id) do update set revision=greatest(private.mobile_event_deletions.revision,excluded.revision),
    approval_status=excluded.approval_status,created_by=excluded.created_by;
 end if;
 return old;
end;
$$;
revoke all on function private.mobile_event_deletion() from public,anon,authenticated;
create trigger mobile_event_deletion_boundary before delete on public.events for each row execute function private.mobile_event_deletion();

-- Separate shared authorization repair: /events/new requires effective manage
-- OR request authority. The older action/RPC omitted this guard; active
-- membership alone is not request authority. events.request has no editable
-- override: use rbac.ts defaults plus additive same-team custom permissions.
create function private.can_create_event_workspace(p_team uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_approved_member(p_team) and (
  private.has_workspace_permission(p_team,'events.manage')
  or private.has_team_role(p_team,array['owner','admin','pastor','worship_leader','band_leader']::public.team_role[])
  or exists(select 1 from public.team_members tm join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
   where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and 'events.request'=any(cr.permissions))
 );
$$;
revoke all on function private.can_create_event_workspace(uuid) from public,anon,authenticated;

-- Extracted verbatim from 20261012010000 except the private name/create-ID argument
-- and collision/create-authority guards. Website create still supplies no ID; update semantics,
-- member/setlist/event lock order, approval, assignment IDs and recurrence stay shared.
create function private.save_event_workspace_core(
  p_team_id uuid, p_event_id uuid, p_details jsonb, p_assignments jsonb, p_linked_setlist_id uuid, p_expected_revision bigint, p_create_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_id uuid := coalesce(p_event_id, p_create_id, gen_random_uuid());
  v_approved boolean;
  v_status text;
  v_base_date date := (p_details->>'event_date')::date;
  v_date date;
  v_rehearsal_date date := nullif(p_details->>'rehearsal_date', '')::date;
  v_rule text := coalesce(p_details->>'recurrence_rule', 'none');
  v_occurrences integer := 0;
  v_child_id uuid;
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  perform private.lock_workspace_members(p_team_id);
  if p_event_id is null and not private.can_create_event_workspace(p_team_id) then
    raise exception 'Event manage or request permission required' using errcode='42501';
  end if;
  if p_create_id is not null and (p_event_id is not null or exists(select 1 from public.events where id=p_create_id)
    or exists(select 1 from private.mobile_event_deletions where event_id=p_create_id)) then
    raise exception 'Create ID is unavailable' using errcode='22023';
  end if;
  v_approved := private.has_workspace_permission(p_team_id, 'events.manage');
  -- Member deletion cascades into assignments and then their parent event.
  perform private.validate_event_assignment_payload(p_team_id, p_assignments);
  -- Use the same setlist-before-event lock order as save_setlist_workspace.
  if p_linked_setlist_id is not null then
    perform 1 from public.setlists where id = p_linked_setlist_id and team_id = p_team_id and deleted_at is null for update;
    if not found then raise exception 'Linked setlist is unavailable' using errcode = '42501'; end if;
  end if;
  if p_event_id is not null then
    select * into v_event from public.events where id = p_event_id and team_id = p_team_id and deleted_at is null for update;
    if v_event.id is null or not v_approved or (v_event.approval_status <> 'approved'
      and not private.has_team_role(p_team_id, array['owner','admin']::public.team_role[])) then
      raise exception 'Event cannot be edited' using errcode = '42501';
    end if;
    v_status := v_event.approval_status;
    if p_expected_revision is null or p_expected_revision<>v_event.sync_revision then
      raise exception 'Event changed. Reload before saving; keep your draft.' using errcode='40001';
    end if;
    v_rule := coalesce(v_event.recurrence_rule, 'none');
  else
    v_status := case when v_approved then 'approved' else 'pending' end;
    if v_rule not in ('none','weekly','biweekly','monthly') then
      raise exception 'Invalid recurrence' using errcode = '22023';
    end if;
    v_occurrences := case v_rule when 'weekly' then 12 when 'biweekly' then 6 when 'monthly' then 3 else 0 end;
  end if;
  if jsonb_typeof(p_details) <> 'object' or length(trim(coalesce(p_details->>'name', ''))) not between 1 and 160
    or v_base_date is null or p_details->>'starts_at' is null then
    raise exception 'Invalid event details' using errcode = '22023';
  end if;
  if p_linked_setlist_id is not null then
    if v_status <> 'approved' or not private.has_workspace_permission(p_team_id, 'setlists.manage')
       or not exists (select 1 from public.setlists where id = p_linked_setlist_id and team_id = p_team_id and deleted_at is null) then
      raise exception 'Linked setlist is unavailable' using errcode = '42501';
    end if;
  end if;
  for v_index in 0..v_occurrences loop
    v_child_id := case when v_index = 0 then v_id else gen_random_uuid() end;
    v_date := case v_rule when 'monthly' then (v_base_date + make_interval(months => v_index))::date
      when 'weekly' then v_base_date + 7 * v_index when 'biweekly' then v_base_date + 14 * v_index else v_base_date end;
    if p_event_id is null then
      insert into public.events (id, team_id, name, type, event_date, starts_at, ends_at, location, description,
        rehearsal_date, rehearsal_time, rehearsal_end_time, approval_status, created_by,
        recurrence_rule, recurrence_parent_id, requested_assignments)
      values (v_child_id, p_team_id, p_details->>'name', (p_details->>'type')::public.event_type, v_date,
        (p_details->>'starts_at')::time, nullif(p_details->>'ends_at','')::time, p_details->>'location', p_details->>'description',
        v_rehearsal_date + (v_date - v_base_date), nullif(p_details->>'rehearsal_time','')::time,
        nullif(p_details->>'rehearsal_end_time','')::time, v_status, auth.uid(),
        nullif(v_rule, 'none'), case when v_index > 0 then v_id else null end,
        case when v_status = 'pending' then p_assignments else '[]'::jsonb end);
    else
      update public.events set name = p_details->>'name', type = (p_details->>'type')::public.event_type,
        event_date = v_base_date, starts_at = (p_details->>'starts_at')::time,
        ends_at = nullif(p_details->>'ends_at','')::time, location = p_details->>'location', description = p_details->>'description',
        rehearsal_date = v_rehearsal_date, rehearsal_time = nullif(p_details->>'rehearsal_time','')::time,
        rehearsal_end_time = nullif(p_details->>'rehearsal_end_time','')::time,
        requested_assignments = case when v_status = 'pending' then p_assignments else '[]'::jsonb end
      where id = v_id and team_id = p_team_id;
    end if;
    if v_status = 'approved' then
      -- Retain unchanged assignment IDs, remove stale roles, and add new roles.
      delete from public.event_assignments ea where ea.event_id = v_child_id and not exists
        (select 1 from jsonb_array_elements(p_assignments) item
         where ea.team_member_id = (item->>'team_member_id')::uuid and ea.assignment = item->>'assignment');
      insert into public.event_assignments (event_id, team_member_id, assignment)
      select v_child_id, (item->>'team_member_id')::uuid, item->>'assignment' from jsonb_array_elements(p_assignments) item
      on conflict (event_id, team_member_id, assignment) do nothing;
    end if;
  end loop;
  if p_linked_setlist_id is not null then
    update public.setlists set event_id = v_id where id = p_linked_setlist_id and team_id = p_team_id and deleted_at is null;
  end if;
  return v_id;
end;
$$;


revoke all on function private.save_event_workspace_core(uuid,uuid,jsonb,jsonb,uuid,bigint,uuid) from public,anon,authenticated;
create or replace function public.save_event_workspace(
 p_team_id uuid,p_event_id uuid,p_details jsonb,p_assignments jsonb,p_linked_setlist_id uuid,p_expected_revision bigint default null
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 return private.save_event_workspace_core(p_team_id,p_event_id,p_details,p_assignments,p_linked_setlist_id,p_expected_revision,null);
end;
$$;
-- CREATE OR REPLACE preserves public function OID, owner, grants and all call sites.

create function private.mobile_event_snapshot(p_team uuid,p_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('record',jsonb_build_object('id',e.id,'team_id',e.team_id,'name',e.name,'type',e.type,'event_date',e.event_date,'starts_at',e.starts_at,'ends_at',e.ends_at,'call_time',e.call_time,'location',e.location,'description',e.description,'rehearsal_date',e.rehearsal_date,'rehearsal_time',e.rehearsal_time,'rehearsal_end_time',e.rehearsal_end_time,'recurrence_rule',e.recurrence_rule,'recurrence_parent_id',e.recurrence_parent_id,'approval_status',e.approval_status,'requested_assignments',e.requested_assignments,'created_by',e.created_by,'created_at',e.created_at,'updated_at',e.updated_at,'deleted_at',e.deleted_at,'sync_revision',e.sync_revision),
  'assignments',case when e.approval_status='pending' then coalesce((select jsonb_agg(x order by x->>'assignment',x->>'team_member_id') from jsonb_array_elements(e.requested_assignments) x),'[]'::jsonb)
   else coalesce((select jsonb_agg(jsonb_build_object('team_member_id',a.team_member_id,'assignment',a.assignment) order by a.assignment,a.team_member_id) from public.event_assignments a where a.event_id=e.id),'[]'::jsonb) end,
  'linkedSetlists',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'revision',s.sync_revision) order by s.id) from public.setlists s where s.event_id=e.id and s.team_id=p_team and s.deleted_at is null),'[]'::jsonb))
 from public.events e where e.id=p_event and e.team_id=p_team;
$$;
revoke all on function private.mobile_event_snapshot(uuid,uuid) from public,anon,authenticated;
-- Canonicalize array order only; never replace the supplied record/base revision.
create function private.canonical_mobile_event_snapshot(p_value jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when p_value='null'::jsonb then p_value else p_value || jsonb_build_object(
 'assignments',coalesce((select jsonb_agg(x order by x->>'assignment',x->>'team_member_id') from jsonb_array_elements(p_value->'assignments') x),'[]'::jsonb),
 'linkedSetlists',coalesce((select jsonb_agg(x order by x->>'id') from jsonb_array_elements(p_value->'linkedSetlists') x),'[]'::jsonb)) end;
$$;
revoke all on function private.canonical_mobile_event_snapshot(jsonb) from public,anon,authenticated;
-- Validate the website EventForm contract at the SQL boundary as well as Zod.
-- templateId remains audit-only: website applyTemplate resolves concrete roles
-- before submit. No server-side template lookup or implicit role grant is added.
create function private.prepare_mobile_event_form(p_value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare v_key text; v_limit integer; v_item jsonb; v_id uuid; v_date date; v_assignments jsonb:='[]'; v_role record;
begin
 if p_value is null or jsonb_typeof(p_value)<>'object'
  or not(p_value ?& array['title','eventType','date','startTime','location','worshipLeader','recurrence'])
  or p_value-array['title','eventType','date','startTime','endTime','rehearsalStartTime','rehearsalEndTime','rehearsalDate','location','assignedTeams','linkedSetlistId','notes','worshipLeader','acousticGuitar','electricGuitar','bass','drums','mainKeys','secondKeys','extraBandMembers','backupSingers','media','dancers','templateId','recurrence']<>'{}' then
  raise exception 'Invalid event form' using errcode='22023';
 end if;
 for v_key in select unnest(array['title','location','worshipLeader']) loop
  if jsonb_typeof(p_value->v_key) is distinct from 'string' or length(trim(p_value->>v_key)) not between 1 and 160 then raise exception 'Invalid required event field' using errcode='22023'; end if;
 end loop;
 for v_key in select unnest(array['endTime','rehearsalStartTime','rehearsalEndTime','rehearsalDate','assignedTeams','linkedSetlistId','notes','acousticGuitar','electricGuitar','bass','drums','mainKeys','secondKeys','media','templateId']) loop
  v_limit:=case v_key when 'notes' then 2000 when 'assignedTeams' then 500 when 'linkedSetlistId' then 65536 when 'templateId' then 65536 else 160 end;
  if p_value ? v_key and (jsonb_typeof(p_value->v_key) is distinct from 'string' or length(trim(p_value->>v_key))>v_limit) then raise exception 'Invalid optional event field' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(p_value->'eventType') is distinct from 'string' or p_value->>'eventType' not in ('service','rehearsal','meeting','special_event','service_rehearsal')
  or jsonb_typeof(p_value->'recurrence') is distinct from 'string' or p_value->>'recurrence' not in ('none','weekly','biweekly','monthly')
  or jsonb_typeof(p_value->'date') is distinct from 'string' or p_value->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
  or jsonb_typeof(p_value->'startTime') is distinct from 'string' then raise exception 'Invalid event schedule' using errcode='22023'; end if;
 v_date:=(p_value->>'date')::date;
 if coalesce(p_value->>'rehearsalDate','')<>'' then
  if p_value->>'rehearsalDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid rehearsal date' using errcode='22023'; end if;
  v_date:=(p_value->>'rehearsalDate')::date;
 end if;
 for v_key in select unnest(array['startTime','endTime','rehearsalStartTime','rehearsalEndTime']) loop
  if (v_key='startTime' or coalesce(p_value->>v_key,'')<>'') and trim(p_value->>v_key) !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
   raise exception 'Invalid event time' using errcode='22023';
  end if;
 end loop;
 for v_role in select * from (values
  ('worshipLeader','Worship Leader',false),('acousticGuitar','Acoustic Guitar',false),('electricGuitar','Electric Guitar',false),
  ('bass','Bass',false),('drums','Drums',false),('mainKeys','Main Keys',false),('secondKeys','Second Keys',false),('media','Media',false),
  ('extraBandMembers','Band Member',true),('backupSingers','Backup Singer',true),('dancers','Dancers',true)
 ) as roles(field,label,multiple) loop
  if v_role.multiple then
   if p_value ? v_role.field and jsonb_typeof(p_value->v_role.field) is distinct from 'array' then raise exception 'Invalid assignment list' using errcode='22023'; end if;
   for v_item in select value from jsonb_array_elements(coalesce(p_value->v_role.field,'[]'::jsonb)) loop
    if jsonb_typeof(v_item)<>'string' then raise exception 'Invalid assignment ID' using errcode='22023'; end if;
    v_id:=trim(v_item#>>'{}')::uuid;
    v_assignments:=v_assignments||jsonb_build_array(jsonb_build_object('team_member_id',v_id,'assignment',v_role.label));
   end loop;
  elsif coalesce(trim(p_value->>v_role.field),'')<>'' then
   v_id:=trim(p_value->>v_role.field)::uuid;
   v_assignments:=v_assignments||jsonb_build_array(jsonb_build_object('team_member_id',v_id,'assignment',v_role.label));
  end if;
 end loop;
 if jsonb_array_length(v_assignments)>100 or (select count(*)<>count(distinct (x->>'team_member_id',x->>'assignment')) from jsonb_array_elements(v_assignments) x) then raise exception 'Invalid duplicate assignments' using errcode='22023'; end if;
 v_id:=nullif(trim(p_value->>'linkedSetlistId'),'')::uuid;
 return jsonb_build_object('details',jsonb_build_object('name',trim(p_value->>'title'),'type',p_value->>'eventType','event_date',p_value->>'date',
  'starts_at',trim(p_value->>'startTime'),'ends_at',nullif(trim(p_value->>'endTime'),''),'location',trim(p_value->>'location'),
  'description',coalesce(nullif(trim(p_value->>'notes'),''),nullif(trim(p_value->>'assignedTeams'),'')),
  'rehearsal_date',nullif(p_value->>'rehearsalDate',''),'rehearsal_time',nullif(trim(p_value->>'rehearsalStartTime'),''),
  'rehearsal_end_time',nullif(trim(p_value->>'rehearsalEndTime'),''),'recurrence_rule',p_value->>'recurrence'),
  'assignments',v_assignments,'linkedSetlistId',v_id);
end;
$$;
revoke all on function private.prepare_mobile_event_form(jsonb) from public,anon,authenticated;

create function private.validate_mobile_event_command(p_command jsonb) returns void language plpgsql set search_path='' as $$
declare v_id uuid; v_item jsonb; v_base jsonb:=p_command->'baseValue';
begin
 if p_command is null or jsonb_typeof(p_command)<>'object' or not(p_command ?& array['commandId','type','eventId','baseRevision','baseValue','dependsOn'])
  or jsonb_typeof(p_command->'commandId') is distinct from 'string' or jsonb_typeof(p_command->'eventId') is distinct from 'string'
  or jsonb_typeof(p_command->'type') is distinct from 'string' or p_command->>'type' not in ('event.save','event.delete')
  or jsonb_typeof(p_command->'baseRevision') is distinct from 'number' or (p_command->>'baseRevision')::numeric not between 0 and 9007199254740991
  or mod((p_command->>'baseRevision')::numeric,1)<>0 or jsonb_typeof(p_command->'dependsOn') is distinct from 'array' or jsonb_array_length(p_command->'dependsOn')>25 then
  raise exception 'Invalid event command' using errcode='22023';
 end if;
 v_id:=(p_command->>'commandId')::uuid; v_id:=(p_command->>'eventId')::uuid;
 for v_item in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if jsonb_typeof(v_item)<>'string' then raise exception 'Invalid event dependency' using errcode='22023'; end if;
  v_id:=(v_item#>>'{}')::uuid;
  if v_id=(p_command->>'commandId')::uuid then raise exception 'Self dependency' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct value) from jsonb_array_elements(p_command->'dependsOn')) then raise exception 'Duplicate event dependency' using errcode='22023'; end if;
 if p_command->>'type'='event.save' then
  if not(p_command ?& array['mode','value','linkedSetlistBase']) or p_command-array['commandId','type','eventId','baseRevision','baseValue','dependsOn','mode','value','linkedSetlistBase']<>'{}'
   or jsonb_typeof(p_command->'mode') is distinct from 'string' or p_command->>'mode' not in ('create','update') then raise exception 'Invalid event save' using errcode='22023'; end if;
  perform private.prepare_mobile_event_form(p_command->'value');
  if p_command->'linkedSetlistBase'<>'null'::jsonb then
   if jsonb_typeof(p_command->'linkedSetlistBase')<>'object' or not(p_command->'linkedSetlistBase' ?& array['id','revision','eventId'])
    or (p_command->'linkedSetlistBase')-array['id','revision','eventId']<>'{}' or jsonb_typeof(p_command->'linkedSetlistBase'->'id') is distinct from 'string'
    or jsonb_typeof(p_command->'linkedSetlistBase'->'revision') is distinct from 'number' or (p_command->'linkedSetlistBase'->>'revision')::numeric not between 0 and 9007199254740991
    or mod((p_command->'linkedSetlistBase'->>'revision')::numeric,1)<>0 or jsonb_typeof(p_command->'linkedSetlistBase'->'eventId') not in ('string','null') then raise exception 'Invalid linked setlist base' using errcode='22023'; end if;
   v_id:=(p_command->'linkedSetlistBase'->>'id')::uuid; v_id:=(p_command->'linkedSetlistBase'->>'eventId')::uuid;
  end if;
  if nullif(trim(p_command->'value'->>'linkedSetlistId'),'') is distinct from p_command->'linkedSetlistBase'->>'id' then raise exception 'Linked setlist base is required' using errcode='22023'; end if;
  if p_command->>'mode'='create' then
   if p_command->'baseValue'<>'null'::jsonb or (p_command->>'baseRevision')::numeric<>0 then raise exception 'New event has no base' using errcode='22023'; end if;
   return;
  end if;
 elsif p_command-array['commandId','type','eventId','baseRevision','baseValue','dependsOn']<>'{}' then raise exception 'Invalid event delete' using errcode='22023';
 end if;
 if jsonb_typeof(v_base) is distinct from 'object' or not(v_base ?& array['record','assignments','linkedSetlists']) or v_base-array['record','assignments','linkedSetlists']<>'{}'
  or jsonb_typeof(v_base->'record') is distinct from 'object' or v_base->'record'->>'id' is distinct from p_command->>'eventId'
  or v_base->'record'->'sync_revision' is distinct from p_command->'baseRevision' or jsonb_typeof(v_base->'assignments') is distinct from 'array'
  or jsonb_typeof(v_base->'linkedSetlists') is distinct from 'array' then raise exception 'Saved event snapshot is required' using errcode='22023'; end if;
end;
$$;
revoke all on function private.validate_mobile_event_command(jsonb) from public,anon,authenticated;

create function private.apply_mobile_event_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid:=(p_command->>'commandId')::uuid; v_event_id uuid:=(p_command->>'eventId')::uuid;
 v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex'); v_common jsonb; v_result jsonb;
 v_event public.events%rowtype; v_deleted private.mobile_event_deletions%rowtype; v_receipt public.mobile_workflow_command_receipts%rowtype;
 v_snapshot jsonb; v_link jsonb:='null'; v_prepared jsonb; v_link_id uuid; v_dependency jsonb; v_occurrences jsonb; v_create boolean;
 v_admin boolean; v_manage boolean; v_permission boolean; v_visible boolean; v_target uuid;
begin
 v_create:=p_command->>'type'='event.save' and p_command->>'mode'='create';
 v_common:=jsonb_build_object('commandId',v_id,'type',p_command->>'type','eventId',v_event_id,'payloadHash',v_hash);
 v_admin:=private.has_team_role(p_team,array['owner','admin']::public.team_role[]);
 v_manage:=private.has_workspace_permission(p_team,'events.manage');
 -- Same workspace lock and setlist-before-event order as shared website saves.
 v_link_id:=case when p_command->>'type'='event.save' then nullif(trim(p_command->'value'->>'linkedSetlistId'),'')::uuid end;
 perform 1 from public.setlists where team_id=p_team and (event_id=v_event_id or id=v_link_id) order by id for update;
 select * into v_event from public.events where id=v_event_id and team_id=p_team for update;
 select * into v_deleted from private.mobile_event_deletions where team_id=p_team and event_id=v_event_id;
 v_visible:=v_event.id is not null and v_event.deleted_at is null and (v_event.approval_status='approved' or v_event.created_by=v_actor or v_admin);
 -- Recheck access before replay. A deleted event is visible for own receipt replay
 -- only through minimal persisted scope/approval/creator metadata, never old rows.
 v_permission:=case when v_create then private.can_create_event_workspace(p_team) when p_command->>'type'='event.delete'
  then v_manage and (v_admin or coalesce(v_event.approval_status,v_deleted.approval_status)='approved')
  else v_manage and (coalesce(v_event.approval_status,v_deleted.approval_status)='approved' or v_admin) end;
 if v_link_id is not null and not private.has_workspace_permission(p_team,'setlists.manage') then v_permission:=false; end if;
 if not v_permission then
  v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current workspace permission is required. Keep your draft.');
 end if;
 select * into v_receipt from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id;
 if found then
  if v_receipt.member_id<>p_member or v_receipt.payload_hash<>v_hash or v_receipt.command<>p_command then
   return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID already belongs to another saved intent.');
  end if;
  if v_result is not null then return v_result; end if;
  if not v_create and not v_visible and not(v_deleted.event_id is not null and (v_deleted.approval_status='approved' or v_deleted.created_by=v_actor or v_admin)) then
   return v_common||jsonb_build_object('status','rejected','code','unavailable','message','This event is unavailable. Keep your draft.');
  end if;
  if v_create and v_event.id is not null and not v_visible then
   return v_common||jsonb_build_object('status','rejected','code','unavailable','message','This event is unavailable. Keep your draft.');
  end if;
  return v_receipt.result;
 end if;
 if v_result is null then
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if not exists(select 1 from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and member_id=p_member
    and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied') then
   v_result:=v_common||jsonb_build_object('status','blocked','code','dependency','message','A required command is not confirmed. Resolve it and use a new command ID.'); exit;
  end if;
 end loop;
 end if;
 if v_result is null then
  if (v_create and (exists(select 1 from public.events where id=v_event_id) or exists(select 1 from private.mobile_event_deletions where event_id=v_event_id)))
    or (not v_create and not v_visible) then
   v_result:=v_common||jsonb_build_object('status','rejected','code','unavailable','message','This event is unavailable. Keep your draft.');
  else
   v_snapshot:=private.mobile_event_snapshot(p_team,v_event_id);
   if v_link_id is not null then
    select jsonb_build_object('id',id,'revision',sync_revision,'eventId',event_id) into v_link from public.setlists where id=v_link_id and team_id=p_team and deleted_at is null;
    if v_link is null then v_result:=v_common||jsonb_build_object('status','rejected','code','unavailable','message','This linked setlist is unavailable. Keep your draft.'); end if;
   end if;
   if v_result is null and ((not v_create and (v_event.sync_revision<>(p_command->>'baseRevision')::bigint
     or v_snapshot is distinct from private.canonical_mobile_event_snapshot(p_command->'baseValue')))
     or (v_link_id is not null and v_link is distinct from p_command->'linkedSetlistBase')) then
    v_result:=v_common||jsonb_build_object('status','conflict','baseValue',p_command->'baseValue','localValue',case when p_command->>'type'='event.save' then p_command->'value' else 'null'::jsonb end,
     'remote',v_snapshot,'linkedSetlist',v_link);
   end if;
   if v_result is null then
    -- Subtransaction turns expected validation/permission failures into durable
    -- rejected receipts while rolling back ALL event/recurrence/link side effects.
    begin
     if p_command->>'type'='event.save' then
      v_prepared:=private.prepare_mobile_event_form(p_command->'value');
      v_target:=private.save_event_workspace_core(p_team,case when v_create then null else v_event_id end,
       v_prepared->'details',v_prepared->'assignments',v_link_id,case when v_create then null else (p_command->>'baseRevision')::bigint end,
       case when v_create then v_event_id else null end);
      select jsonb_agg(jsonb_build_object('index',n-1,'snapshot',private.mobile_event_snapshot(p_team,id)) order by n) into v_occurrences
       from (select id,row_number() over(order by case when id=v_event_id then 0 else 1 end,event_date,id) n from public.events
         where team_id=p_team and (id=v_event_id or (v_create and recurrence_parent_id=v_event_id))) occurrences;
      v_result:=v_common||jsonb_build_object('status','applied','snapshot',private.mobile_event_snapshot(p_team,v_target),'occurrences',v_occurrences,'deletion',null);
     else
      perform public.delete_event_cascade(v_event_id);
      select * into v_deleted from private.mobile_event_deletions where team_id=p_team and event_id=v_event_id;
      if v_deleted.event_id is null then raise exception 'Deletion confirmation missing' using errcode='40001'; end if;
      v_result:=v_common||jsonb_build_object('status','applied','snapshot',null,'occurrences','[]'::jsonb,
       'deletion',jsonb_build_object('id',v_event_id,'revision',v_deleted.revision,'deleted',true));
     end if;
    exception when sqlstate '42501' then
     v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current permissions or related records prevent this change. Keep your draft.');
    when sqlstate '22023' or sqlstate '22P02' or sqlstate '22007' or sqlstate '22008' or sqlstate '23514' or sqlstate '23503' then
     v_result:=v_common||jsonb_build_object('status','rejected','code','invalid','message','Review this event and its related records. Keep your draft.');
    end;
   end if;
  end if;
 end if;
 insert into public.mobile_workflow_command_receipts(actor_id,team_id,member_id,command_id,event_id,command,payload_hash,result)
  values(v_actor,p_team,p_member,v_id,v_event_id,p_command,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.apply_mobile_event_command(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.mobile_apply_event_commands(p_team_id uuid,p_member_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_command jsonb; v_results jsonb:='[]'; v_index bigint; v_dependency jsonb;
begin
 if auth.uid() is null or p_team_id is null or p_member_id is null then raise exception 'Selected authenticated workspace required' using errcode='42501'; end if;
 if p_commands is null or jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands) not between 1 and 25 or octet_length(p_commands::text)>65536 then raise exception 'Invalid event batch' using errcode='22023'; end if;
 for v_command in select value from jsonb_array_elements(p_commands) loop perform private.validate_mobile_event_command(v_command); end loop;
 if (select count(*)<>count(distinct (value->>'commandId')::uuid) from jsonb_array_elements(p_commands)) then raise exception 'Duplicate event command IDs' using errcode='22023'; end if;
 for v_command,v_index in select value,ordinality from jsonb_array_elements(p_commands) with ordinality loop
  for v_dependency in select value from jsonb_array_elements(v_command->'dependsOn') loop
   if exists(select 1 from jsonb_array_elements(p_commands) with ordinality as d(value,n) where n>=v_index and (value->>'commandId')::uuid=(v_dependency#>>'{}')::uuid) then raise exception 'Event dependencies must precede their commands' using errcode='22023'; end if;
  end loop;
 end loop;
 perform private.lock_workspace_members(p_team_id);
 if not exists(select 1 from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=auth.uid() and status='active') then raise exception 'Matching active membership required' using errcode='42501'; end if;
 for v_command in select value from jsonb_array_elements(p_commands) loop
  if v_command->'baseValue'<>'null'::jsonb and v_command->'baseValue'->'record'->>'team_id' is distinct from p_team_id::text then raise exception 'Event base belongs to another workspace' using errcode='22023'; end if;
  v_results:=v_results||jsonb_build_array(private.apply_mobile_event_command(p_team_id,p_member_id,v_command));
 end loop;
 return v_results;
end;
$$;
revoke all on function public.mobile_apply_event_commands(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_event_commands(uuid,uuid,jsonb) to authenticated;
commit;
