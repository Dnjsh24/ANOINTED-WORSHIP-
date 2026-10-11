\set ON_ERROR_STOP on
-- Isolated local CI database only; all fixture changes roll back.
begin;

do $$
begin
  if (select provolatile from pg_proc where oid = 'private.is_approved_member(uuid)'::regprocedure) <> 's'
    or (select provolatile from pg_proc where oid = 'private.has_team_role(uuid,public.team_role[])'::regprocedure) <> 's' then
    raise exception 'Read-only membership helpers must be STABLE';
  end if;
  if has_function_privilege('anon', 'public.save_event_workspace(uuid,uuid,jsonb,jsonb,uuid,bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.save_setlist_workspace(uuid,uuid,uuid,jsonb,uuid[],uuid,bigint)', 'EXECUTE') then
    raise exception 'Workspace RPCs must remain inaccessible to anonymous users';
  end if;
  if not has_function_privilege('authenticated', 'public.save_event_workspace(uuid,uuid,jsonb,jsonb,uuid,bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.save_setlist_workspace(uuid,uuid,uuid,jsonb,uuid[],uuid,bigint)', 'EXECUTE') then
    raise exception 'Workspace RPC grants must remain intact';
  end if;
end;
$$;

insert into public.teams (id, name, code, owner_id)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Membership snapshot test', 'ML-20002', '33333333-3333-3333-3333-333333333333');
insert into public.team_members (team_id, profile_id, role, status)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-3333-3333-3333-333333333333', 'owner', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not private.is_approved_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    or not private.has_team_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['band_member']::public.team_role[])
    or private.has_team_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['admin']::public.team_role[]) then
    raise exception 'Active membership and exact role checks changed';
  end if;
  if private.is_approved_member('ffffffff-ffff-ffff-ffff-ffffffffffff')
    or private.has_team_role('ffffffff-ffff-ffff-ffff-ffffffffffff', array['owner']::public.team_role[]) then
    raise exception 'Membership predicates leaked another team';
  end if;
end;
$$;

-- Distinct statements in the same transaction must see changed roles/status.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.team_members set role = 'admin' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not private.has_team_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['admin']::public.team_role[])
    or private.has_team_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['band_member']::public.team_role[]) then
    raise exception 'Role update remained stale across statements';
  end if;
  perform public.get_team_analytics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
end;
$$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.team_members set status = 'inactive' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if private.is_approved_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    or private.has_team_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['admin']::public.team_role[]) then
    raise exception 'Inactive membership retained access across statements';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.team_members set status = 'active' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not private.is_approved_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
    raise exception 'Reactivated membership remained stale';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if private.is_approved_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    or private.has_team_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['admin']::public.team_role[]) then
    raise exception 'Missing identity must not match membership';
  end if;
end;
$$;

rollback;
select 'Website membership snapshot and RPC grant checks passed.' as result;
