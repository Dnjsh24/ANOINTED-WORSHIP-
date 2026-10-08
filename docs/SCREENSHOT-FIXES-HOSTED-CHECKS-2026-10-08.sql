-- Hosted verification uses existing identities only within a rolled-back transaction.
-- No permission, audit, content or team-code change persists.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $checks$
declare
  v_team uuid; v_owner uuid; v_member uuid; v_profile uuid; v_role text; v_other uuid;
  v_permission text; v_result jsonb; v_denied boolean;
  v_caps text[]:=array['setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage'];
begin
  select tm.team_id,t.owner_id,tm.id,tm.profile_id,tm.role::text
    into v_team,v_owner,v_member,v_profile,v_role
  from public.team_members tm join public.teams t on t.id=tm.team_id
  where tm.status='active' and tm.role<>'owner'
    and exists(select 1 from public.team_members own where own.team_id=t.id and own.profile_id=t.owner_id and own.role='owner' and own.status='active')
    and not exists(select 1 from public.team_members other where other.profile_id=tm.profile_id and other.team_id<>tm.team_id and other.status='active')
  order by case when tm.role='band_member' then 0 else 1 end,tm.id limit 1;
  select id into v_other from public.teams where id<>v_team order by id limit 1;
  if v_team is null or v_other is null then raise exception 'Representative live identities unavailable'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_permission in array v_caps loop
    if not private.has_team_permission(v_team,v_permission) then raise exception 'Owner protection failed: %',v_permission; end if;
    perform public.set_team_permission_override(v_team,v_role,null,v_permission,true);
  end loop;
  v_result:=public.get_team_analytics(v_team);
  if jsonb_typeof(v_result)<>'object' or not(v_result ? 'mostPlayedSongs') then raise exception 'Owner analytics contract failed'; end if;
  perform public.get_personal_preparation(v_team);
  v_denied:=false;
  begin perform public.set_team_permission_override(v_team,'owner',null,'songs.edit',false);
    exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Owner role was editable'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',v_profile::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_profile,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_permission in array v_caps loop
    if not private.has_team_permission(v_team,v_permission) then raise exception 'Role grant failed: %',v_permission; end if;
    if private.has_team_permission(v_other,v_permission) then raise exception 'Cross-team permission escaped: %',v_permission; end if;
  end loop;
  v_denied:=false;
  begin perform public.set_team_permission_override(v_team,v_role,null,'songs.edit',false);
    exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Nonowner edited permissions'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_permission in array v_caps loop
    perform public.set_team_permission_override(v_team,null,v_member,v_permission,false);
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_profile::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_profile,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_permission in array v_caps loop
    if private.has_team_permission(v_team,v_permission) then raise exception 'Person denial did not win: %',v_permission; end if;
  end loop;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_permission in array v_caps loop
    perform public.set_team_permission_override(v_team,null,v_member,v_permission,null);
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_profile::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_profile,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_permission in array v_caps loop
    if not private.has_team_permission(v_team,v_permission) then raise exception 'Inherit did not restore role grant: %',v_permission; end if;
  end loop;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  if private.has_team_permission(v_team,'members.manage') then raise exception 'Unrelated actor gained permission'; end if;
  v_denied:=false;
  begin perform public.get_team_analytics(v_team);
    exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Unrelated actor accessed analytics'; end if;
  execute 'reset role';
end
$checks$;
rollback;
select 'passed owner protection, seven role grants, seven person denials, inheritance, owner-only editing, cross-team denial, owner analytics/preparation and unrelated actor denial; all writes rolled back' as result;
