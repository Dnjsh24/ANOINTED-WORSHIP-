-- Extend the shared request boundary after the preparation/service-order tables.
alter table public.shared_edit_requests drop constraint shared_edit_requests_target_type_check;
alter table public.shared_edit_requests add constraint shared_edit_requests_target_type_check check (
 target_type in ('song','setlist','event','song_slot','announcement','reminder','choreography','rehearsal_plan','service_order'));

alter function private.shared_edit_permission(text) rename to shared_edit_permission_core;
create function private.shared_edit_permission(p_type text) returns text language sql immutable set search_path='' as $$
 select case p_type when 'rehearsal_plan' then 'setlists.manage' when 'service_order' then 'events.manage' else private.shared_edit_permission_core(p_type) end;
$$;
revoke all on function private.shared_edit_permission(text) from public,anon,authenticated;

alter function private.can_read_shared_target(text,uuid,uuid) rename to can_read_shared_target_core;
create function private.can_read_shared_target(p_type text,p_id uuid,p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case p_type
 when 'rehearsal_plan' then private.is_approved_member(p_team) and exists(select 1 from public.setlists where id=p_id and team_id=p_team and deleted_at is null)
 when 'service_order' then private.is_approved_member(p_team) and exists(select 1 from public.events where id=p_id and team_id=p_team and deleted_at is null and approval_status='approved')
 else private.can_read_shared_target_core(p_type,p_id,p_team) end;
$$;
revoke all on function private.can_read_shared_target(text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_read_shared_target(text,uuid,uuid) to authenticated;

alter function private.validate_shared_edit_changes(text,jsonb) rename to validate_shared_edit_changes_core;
create function private.validate_shared_edit_changes(p_type text,p_changes jsonb) returns void language plpgsql set search_path='' as $$
declare v_item jsonb; v_key text; v_allowed text[]:=array[
 'Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions',
 'Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs',
 'Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues'];
begin
 if p_type not in ('rehearsal_plan','service_order') then perform private.validate_shared_edit_changes_core(p_type,p_changes); return; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or octet_length(p_changes::text)>262144
 or p_changes-(case p_type when 'rehearsal_plan' then array['allocations','tasks'] else array['entries','required_roles'] end)<>'{}'::jsonb then raise exception 'Invalid workflow proposal' using errcode='22023'; end if;
 for v_key in select jsonb_object_keys(p_changes) loop
  if jsonb_typeof(p_changes->v_key)<>'array' then raise exception 'Invalid workflow list' using errcode='22023'; end if;
  if jsonb_array_length(p_changes->v_key)>(case when v_key='required_roles' then 30 else 200 end) then raise exception 'Workflow list too large' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_changes->v_key) loop
   case v_key
   when 'allocations' then
    if jsonb_typeof(v_item)<>'object' or v_item-array['slot_id','minutes','focus']<>'{}'::jsonb
     or coalesce(jsonb_typeof(v_item->'minutes'),'')<>'number' or (v_item->>'minutes')::numeric not between 0 and 120
     or (v_item->>'minutes')::numeric<>trunc((v_item->>'minutes')::numeric)
     or coalesce(jsonb_typeof(v_item->'focus'),'')<>'string' or length(v_item->>'focus')>500
     or coalesce(jsonb_typeof(v_item->'slot_id'),'')<>'string' then raise exception 'Invalid song allocation' using errcode='22023'; end if;
    perform (v_item->>'slot_id')::uuid;
   when 'tasks' then
    if jsonb_typeof(v_item)<>'object' or v_item-array['key','assignee_member_id']<>'{}'::jsonb
     or coalesce(jsonb_typeof(v_item->'key'),'')<>'string' or coalesce(v_item->>'key','')<>all(v_allowed)
     or coalesce(jsonb_typeof(v_item->'assignee_member_id'),'') not in ('null','string') then raise exception 'Invalid task' using errcode='22023'; end if;
    perform (v_item->>'assignee_member_id')::uuid;
   when 'required_roles' then
    if jsonb_typeof(v_item)<>'string' or length(trim(v_item#>>'{}')) not between 1 and 80 then raise exception 'Invalid required role' using errcode='22023'; end if;
   when 'entries' then
    if jsonb_typeof(v_item)<>'object' or v_item-array['id','kind','title','slot_id','duration_seconds','responsible_member_id','cue']<>'{}'::jsonb
     or coalesce(v_item->>'kind','') not in ('song','prayer','reading','announcement','media','other')
     or coalesce(jsonb_typeof(v_item->'id'),'')<>'string'
     or coalesce(jsonb_typeof(v_item->'title'),'')<>'string' or length(trim(v_item->>'title')) not between 1 and 160
     or coalesce(jsonb_typeof(v_item->'duration_seconds'),'')<>'number' or (v_item->>'duration_seconds')::numeric not between 0 and 7200
     or (v_item->>'duration_seconds')::numeric<>trunc((v_item->>'duration_seconds')::numeric)
     or coalesce(jsonb_typeof(v_item->'cue'),'')<>'string' or length(v_item->>'cue')>2000
     or coalesce(jsonb_typeof(v_item->'slot_id'),'') not in ('string','null')
     or coalesce(jsonb_typeof(v_item->'responsible_member_id'),'') not in ('string','null')
     or ((v_item->>'kind'='song') is distinct from (v_item->>'slot_id' is not null)) then raise exception 'Invalid order entry' using errcode='22023'; end if;
    perform (v_item->>'id')::uuid;
    perform (v_item->>'slot_id')::uuid;
    perform (v_item->>'responsible_member_id')::uuid;
   end case;
  end loop;
  if v_key='tasks' and (jsonb_array_length(p_changes->v_key)<>10 or (select count(distinct x->>'key') from jsonb_array_elements(p_changes->v_key) x)<>10)
   or v_key='allocations' and (select count(*)<>count(distinct x->>'slot_id') from jsonb_array_elements(p_changes->v_key) x)
   or v_key='entries' and (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_changes->v_key) x)
   or v_key='required_roles' and (select count(*)<>count(distinct x#>>'{}') from jsonb_array_elements(p_changes->v_key) x) then raise exception 'Duplicate or missing workflow entries' using errcode='22023'; end if;
 end loop;
end;
$$;
revoke all on function private.validate_shared_edit_changes(text,jsonb) from public,anon,authenticated;

alter function private.shared_edit_target(text,uuid,boolean) rename to shared_edit_target_core;
create function private.shared_edit_target(p_type text,p_id uuid,p_lock boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_revision bigint; v_values jsonb;
begin
 if p_type='rehearsal_plan' then
  if p_lock then perform 1 from public.setlists where id=p_id for update; end if;
  select team_id into v_team from public.setlists where id=p_id and deleted_at is null;
  if p_lock then perform 1 from public.rehearsal_plans where setlist_id=p_id for update; end if;
  select revision,jsonb_build_object('allocations',allocations,'tasks',tasks) into v_revision,v_values from public.rehearsal_plans where setlist_id=p_id and team_id=v_team;
  if v_values is null then
   select jsonb_build_object('allocations','[]'::jsonb,'tasks',jsonb_agg(jsonb_build_object('key',key,'assignee_member_id',null) order by ordinal)) into v_values
   from unnest(array['Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions','Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs','Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues']) with ordinality t(key,ordinal);
  end if;
 elsif p_type='service_order' then
  if p_lock then
   perform 1 from public.setlists where event_id=p_id order by id for update;
   perform 1 from public.events where id=p_id for update;
  end if;
  select team_id into v_team from public.events where id=p_id and deleted_at is null and approval_status='approved';
  if p_lock then perform 1 from public.service_orders where event_id=p_id for update; end if;
  select revision,jsonb_build_object('entries',entries,'required_roles',required_roles) into v_revision,v_values from public.service_orders where event_id=p_id and team_id=v_team;
  v_values:=coalesce(v_values,jsonb_build_object('entries','[]'::jsonb,'required_roles','[]'::jsonb));
 else return private.shared_edit_target_core(p_type,p_id,p_lock); end if;
 if v_team is null or auth.uid() is null or not private.can_read_shared_target(p_type,p_id,v_team) then raise exception 'Target is unavailable' using errcode='42501'; end if;
 return jsonb_build_object('team_id',v_team,'revision',coalesce(v_revision,0),'values',v_values);
end;
$$;
revoke all on function private.shared_edit_target(text,uuid,boolean) from public,anon,authenticated;

alter function private.apply_shared_edit(text,uuid,jsonb) rename to apply_shared_edit_core;
create function private.apply_shared_edit(p_type text,p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
 if p_type='rehearsal_plan' then
  select revision into v_revision from public.rehearsal_plans where setlist_id=p_id;
  perform private.apply_rehearsal_plan(p_id,coalesce(v_revision,0),p_values->'allocations',p_values->'tasks');
 elsif p_type='service_order' then
  select revision into v_revision from public.service_orders where event_id=p_id;
  perform private.apply_service_order(p_id,coalesce(v_revision,0),p_values->'entries',array(select jsonb_array_elements_text(p_values->'required_roles')));
 else perform private.apply_shared_edit_core(p_type,p_id,p_values); end if;
end;
$$;
revoke all on function private.apply_shared_edit(text,uuid,jsonb) from public,anon,authenticated;

-- Policies retain function OIDs across renames; bind them to the extended helper.
drop policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests;
create policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests for select to authenticated using (
 private.can_read_shared_target(target_type,target_id,team_id) and (requested_by=auth.uid() or private.can_review_shared_edit(team_id,target_type))
);
revoke all on function private.can_read_shared_target_core(text,uuid,uuid) from public,anon,authenticated;

create function public.get_shared_edit_target(p_target_type text,p_target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 return private.shared_edit_target(p_target_type,p_target_id,false);
end;
$$;
revoke all on function public.get_shared_edit_target(text,uuid) from public,anon;
grant execute on function public.get_shared_edit_target(text,uuid) to authenticated;
