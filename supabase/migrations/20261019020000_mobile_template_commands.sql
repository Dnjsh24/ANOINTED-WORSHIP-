-- DRAFT: additive native template commands. No hosted application authorized.
-- Reuse the immutable setlist receipt ledger; setlist_id stores the template target for these distinct command types.
begin;

create function private.require_mobile_template_identity(p_team uuid,p_member uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_team is null or p_member is null then raise exception 'Selected authenticated team required' using errcode='42501'; end if;
 perform private.lock_workspace_members(p_team);
 if not private.is_approved_member(p_team) or not exists(select 1 from public.team_members
   where id=p_member and team_id=p_team and profile_id=auth.uid() and status='active') then
  raise exception 'Matching approved active membership required' using errcode='42501';
 end if;
end;
$$;
revoke all on function private.require_mobile_template_identity(uuid,uuid) from public,anon,authenticated;

create function private.require_mobile_template_member(p_team uuid,p_member uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_mobile_template_identity(p_team,p_member);
 -- canForTeam/has_workspace_permission allows member overrides. The actual template
 -- INSERT/DELETE RLS policies are narrower; preserve both boundaries in this definer.
 if not private.has_workspace_permission(p_team,'setlists.manage')
   or not private.has_team_role(p_team,array['owner','admin','worship_leader','band_leader']::public.team_role[]) then
  raise exception 'Current template table role required' using errcode='42501';
 end if;
end;
$$;
revoke all on function private.require_mobile_template_member(uuid,uuid) from public,anon,authenticated;

create function private.validate_mobile_template_command(p_command jsonb,p_team uuid) returns void
language plpgsql set search_path='' as $$
declare v_type text:=p_command->>'type'; v_song jsonb; v_id uuid; v_target uuid; v_dependency jsonb;
 v_common text[]:=array['commandId','templateId','type','dependsOn'];
begin
 if v_type='template.create' then
  perform private.validate_mobile_service_object(p_command,v_common||array['sourceBase','sourceSongs','value']);
  perform private.validate_setlist_wire_snapshot(p_command->'sourceBase',p_team);
  if p_command#>>'{sourceBase,record,deleted_at}' is not null or jsonb_array_length(p_command#>'{sourceBase,slots}')>200 then
   raise exception 'Full active source required' using errcode='22023';
  end if;
  perform private.validate_mobile_service_object(p_command->'value',array['name','description']);
  if jsonb_typeof(p_command#>'{value,name}') is distinct from 'string' or length(p_command#>>'{value,name}') not between 1 and 160
   or p_command#>>'{value,name}'<>trim(p_command#>>'{value,name}')
   or jsonb_typeof(p_command#>'{value,description}') not in ('string','null') or length(p_command#>>'{value,description}')>2000
   or jsonb_typeof(p_command->'sourceSongs') is distinct from 'array' or jsonb_array_length(p_command->'sourceSongs')>200 then
   raise exception 'Invalid template fields or titles' using errcode='22023';
  end if;
  for v_song in select value from jsonb_array_elements(p_command->'sourceSongs') loop
   perform private.validate_mobile_service_object(v_song,array['id','title']);
   if jsonb_typeof(v_song->'id') is distinct from 'string' or jsonb_typeof(v_song->'title') is distinct from 'string' then
    raise exception 'Invalid captured song title' using errcode='22023';
   end if;
   perform (v_song->>'id')::uuid;
  end loop;
  if (select count(*)<>count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_command->'sourceSongs'))
   or exists(select (value->>'id')::uuid from jsonb_array_elements(p_command->'sourceSongs')
     except select (value->>'song_id')::uuid from jsonb_array_elements(p_command#>'{sourceBase,slots}'))
   or exists(select (value->>'song_id')::uuid from jsonb_array_elements(p_command#>'{sourceBase,slots}')
     except select (value->>'id')::uuid from jsonb_array_elements(p_command->'sourceSongs')) then
   raise exception 'Capture every referenced song title once' using errcode='22023';
  end if;
 elsif v_type='template.delete' then
  perform private.validate_mobile_service_object(p_command,v_common||array['baseValue']);
  perform private.validate_setlist_wire_row('template',p_command->'baseValue');
  if (p_command#>>'{baseValue,team_id}')::uuid<>p_team or (p_command#>>'{baseValue,id}')::uuid<>(p_command->>'templateId')::uuid then
   raise exception 'Template base scope mismatch' using errcode='22023';
  end if;
 else raise exception 'Invalid template command type' using errcode='22023';
 end if;
 if jsonb_typeof(p_command->'commandId') is distinct from 'string' or jsonb_typeof(p_command->'templateId') is distinct from 'string'
   or jsonb_typeof(p_command->'dependsOn') is distinct from 'array' or jsonb_array_length(p_command->'dependsOn')>25 then
  raise exception 'Invalid template identity/dependencies' using errcode='22023';
 end if;
 v_id:=(p_command->>'commandId')::uuid; v_target:=(p_command->>'templateId')::uuid;
 if v_id=v_target or (v_type='template.create' and (p_command#>>'{sourceBase,record,id}')::uuid in(v_id,v_target)) then
  raise exception 'Keep command, source and template identities distinct' using errcode='22023';
 end if;
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if jsonb_typeof(v_dependency) is distinct from 'string' or (v_dependency#>>'{}')::uuid=v_id then
   raise exception 'Invalid dependency' using errcode='22023';
  end if;
 end loop;
 if (select count(*)<>count(distinct (value#>>'{}')::uuid) from jsonb_array_elements(p_command->'dependsOn')) then
  raise exception 'Repeated dependency' using errcode='22023';
 end if;
end;
$$;
revoke all on function private.validate_mobile_template_command(jsonb,uuid) from public,anon,authenticated;

create function private.mobile_template_source_songs(p_team uuid,p_source uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title) order by s.id),'[]'::jsonb)
 from public.songs s where s.team_id=p_team and s.status='approved' and exists(select 1 from public.setlist_songs ss
   where ss.setlist_id=p_source and ss.song_id=s.id and ss.deleted_at is null);
$$;
revoke all on function private.mobile_template_source_songs(uuid,uuid) from public,anon,authenticated;

create function private.assert_mobile_template_result_visibility(p_team uuid,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_song uuid;
begin
 -- Reuse event visibility rules, mapping the template source location into the existing guard.
 if p_result->>'status'='conflict' then
  perform private.assert_mobile_setlist_result_visibility(p_team,jsonb_build_object(
    'baseValue',p_result->'baseValue','remote',jsonb_build_object('snapshot',p_result#>'{remote,source}')));
  -- Song SELECT RLS is approved-only, including retained soft-deleted songs.
  -- A receipt may contain older titles, so current visibility applies to replay too.
  for v_song in
   select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_result#>'{localValue,sourceSongs}','[]'::jsonb))
   union select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_result#>'{remote,songs}','[]'::jsonb))
   union select (value->>'song_id')::uuid from jsonb_array_elements(coalesce(p_result#>'{remote,source,slots}','[]'::jsonb))
   order by 1
  loop
   perform 1 from public.songs where id=v_song and team_id=p_team and status='approved' for share;
   if not found then raise exception 'Current source song visibility required' using errcode='42501'; end if;
  end loop;
 end if;
end;
$$;
revoke all on function private.assert_mobile_template_result_visibility(uuid,jsonb) from public,anon,authenticated;

create function private.apply_mobile_template_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid:=(p_command->>'commandId')::uuid; v_target uuid:=(p_command->>'templateId')::uuid;
 v_type text:=p_command->>'type'; v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex');
 v_receipt public.mobile_setlist_command_receipts%rowtype; v_common jsonb; v_result jsonb; v_dependency jsonb;
 v_template public.setlist_templates%rowtype; v_source uuid; v_remote_source jsonb; v_songs jsonb; v_expected_songs jsonb;
 v_slots jsonb; v_event public.events%rowtype;
begin
 perform private.require_mobile_template_identity(p_team,p_member);
 v_common:=jsonb_build_object('commandId',v_id,'templateId',v_target,'type',v_type,'payloadHash',v_hash);
 select * into v_receipt from public.mobile_setlist_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id;
 if found then
  if v_receipt.member_id<>p_member or v_receipt.payload_hash<>v_hash or v_receipt.command is distinct from p_command then
   return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID belongs to another saved intent. Keep its original draft.');
  end if;
  perform private.assert_mobile_template_result_visibility(p_team,v_receipt.result);
  return v_receipt.result;
 end if;
 if exists(select 1 from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id)
   or exists(select 1 from public.mobile_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id) then
  return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID belongs to another mobile workflow. Keep its original draft.');
 end if;
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if not exists(select 1 from public.mobile_setlist_command_receipts where actor_id=v_actor and team_id=p_team and member_id=p_member
     and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied')
   and not exists(select 1 from public.mobile_workflow_command_receipts r where actor_id=v_actor and team_id=p_team and member_id=p_member
     and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied'
     and not exists(select 1 from public.mobile_command_receipts where actor_id=v_actor and team_id=p_team and command_id=r.command_id)) then
   v_result:=v_common||jsonb_build_object('status','blocked','code','dependency','message','A required change is not confirmed. Keep this template draft.'); exit;
  end if;
 end loop;
 if v_result is null then
  begin
   perform private.require_mobile_template_member(p_team,p_member);
   if v_type='template.create' then
    v_source:=(p_command#>>'{sourceBase,record,id}')::uuid;
    perform private.assert_setlist_aggregate_base(p_team,v_source,p_command->'sourceBase');
    -- Full source includes the linked event, with typed timestamps like the aggregate comparison.
    if p_command#>>'{sourceBase,record,event_id}' is not null then
     select * into v_event from public.events where id=(p_command#>>'{sourceBase,record,event_id}')::uuid and team_id=p_team for share;
     if not found or v_event.deleted_at is not null or not(v_event.approval_status='approved' or v_event.created_by=v_actor
       or private.has_team_role(p_team,array['owner','admin']::public.team_role[])) then raise exception 'Source event unavailable' using errcode='42501'; end if;
     if to_jsonb(v_event) is distinct from to_jsonb(jsonb_populate_record(null::public.events,p_command#>'{sourceBase,linkedEvent}')) then
      raise exception 'Source event changed' using errcode='40001';
     end if;
    end if;
    perform 1 from public.songs s where s.team_id=p_team and exists(select 1 from public.setlist_songs ss
     where ss.setlist_id=v_source and ss.song_id=s.id and ss.deleted_at is null) order by s.id for share;
    if exists(select 1 from jsonb_array_elements(p_command->'sourceSongs') b where not exists(
      select 1 from public.songs s where s.id=(b.value->>'id')::uuid and s.team_id=p_team and s.status='approved')) then
     raise exception 'Source song unavailable under current SELECT policy' using errcode='42501';
    end if;
    v_songs:=private.mobile_template_source_songs(p_team,v_source);
    select coalesce(jsonb_agg(value order by (value->>'id')::uuid),'[]'::jsonb) into v_expected_songs from jsonb_array_elements(p_command->'sourceSongs');
    if v_songs is distinct from v_expected_songs then raise exception 'Source song titles changed' using errcode='40001'; end if;
    -- Reject target collisions without exposing another team's row.
    if exists(select 1 from public.setlist_templates where id=v_target) then raise exception 'Template identity exists' using errcode='40001'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('order',ss.song_order,'label',coalesce(nullif(s.title,''),'Song'),'tag','') order by ss.song_order,ss.id),'[]'::jsonb)
      into v_slots from public.setlist_songs ss join public.songs s on s.id=ss.song_id and s.team_id=p_team where ss.setlist_id=v_source and ss.deleted_at is null;
    insert into public.setlist_templates(id,team_id,name,description,slots,created_by)
      values(v_target,p_team,p_command#>>'{value,name}',p_command#>>'{value,description}',v_slots,v_actor) returning * into v_template;
    v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','created','template',to_jsonb(v_template)));
   else
    select * into v_template from public.setlist_templates where id=v_target and team_id=p_team for update;
    if not found then
     v_result:=v_common||jsonb_build_object('status','rejected','code','unavailable','message','This template is unavailable. Absence does not confirm this command. Keep its saved intent.');
    elsif to_jsonb(v_template) is distinct from to_jsonb(jsonb_populate_record(null::public.setlist_templates,p_command->'baseValue')) then
     raise exception 'Template changed' using errcode='40001';
    else
     delete from public.setlist_templates where id=v_target and team_id=p_team;
     v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','deleted','templateId',v_target));
    end if;
   end if;
  exception when sqlstate '40001' then
   v_remote_source:=null; v_songs:='[]'::jsonb; v_template:=null;
   select * into v_template from public.setlist_templates where id=v_target and team_id=p_team;
   if v_type='template.create' then
    v_remote_source:=private.mobile_setlist_snapshot(p_team,v_source);
    if v_remote_source is not null then v_songs:=private.mobile_template_source_songs(p_team,v_source); end if;
   end if;
   v_result:=v_common||jsonb_build_object('status','conflict','baseValue',case when v_type='template.create' then p_command->'sourceBase' else p_command->'baseValue' end,
    'localValue',case when v_type='template.create' then jsonb_build_object('sourceSongs',p_command->'sourceSongs','value',p_command->'value') else '{}'::jsonb end,
    'remote',jsonb_build_object('source',v_remote_source,'songs',v_songs,'template',case when v_template.id is null then null else to_jsonb(v_template) end));
  when sqlstate '42501' then
   v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current permission or source records prevent this template change. Keep its saved intent.');
  when sqlstate '22023' or sqlstate '22P02' or sqlstate '23514' or sqlstate '23503' or sqlstate '23505' or sqlstate '22003' then
   v_result:=v_common||jsonb_build_object('status','rejected','code','invalid','message','Review this template change. Keep its saved intent.');
  end;
 end if;
 perform private.assert_mobile_template_result_visibility(p_team,v_result);
 insert into public.mobile_setlist_command_receipts(actor_id,team_id,member_id,command_id,setlist_id,command,payload_hash,result)
   values(v_actor,p_team,p_member,v_id,v_target,p_command,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.apply_mobile_template_command(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.mobile_apply_template_commands(p_team_id uuid,p_member_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_command jsonb; v_dependency jsonb; v_index bigint; v_results jsonb:='[]';
begin
 if auth.uid() is null or p_team_id is null or p_member_id is null then raise exception 'Authenticated selected team required' using errcode='42501'; end if;
 if p_commands is null or jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands) not between 1 and 25 or octet_length(p_commands::text)>1048576 then
  raise exception 'Invalid template command batch' using errcode='22023';
 end if;
 perform private.require_mobile_template_identity(p_team_id,p_member_id);
 for v_command in select value from jsonb_array_elements(p_commands) loop perform private.validate_mobile_template_command(v_command,p_team_id); end loop;
 if (select count(*)<>count(distinct (value->>'commandId')::uuid) or count(*)<>count(distinct (value->>'templateId')::uuid) from jsonb_array_elements(p_commands)) then
  raise exception 'Use distinct commands and one unresolved command per template' using errcode='22023';
 end if;
 for v_command,v_index in select value,ordinality from jsonb_array_elements(p_commands) with ordinality loop
  for v_dependency in select value from jsonb_array_elements(v_command->'dependsOn') loop
   if exists(select 1 from jsonb_array_elements(p_commands) with ordinality d(value,n) where n>=v_index and (value->>'commandId')::uuid=(v_dependency#>>'{}')::uuid) then
    raise exception 'Dependencies must precede commands' using errcode='22023';
   end if;
  end loop;
 end loop;
 for v_command in select value from jsonb_array_elements(p_commands) loop
  v_results:=v_results||jsonb_build_array(private.apply_mobile_template_command(p_team_id,p_member_id,v_command));
 end loop;
 return v_results;
end;
$$;
revoke all on function public.mobile_apply_template_commands(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_template_commands(uuid,uuid,jsonb) to authenticated;
commit;
