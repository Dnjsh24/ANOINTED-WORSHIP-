\set ON_ERROR_STOP on
set timezone='UTC';
create schema team_creation_test;
create function team_creation_test.id(n integer) returns uuid language sql immutable as $$select ('99930000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table team_creation_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
create table team_creation_test.pending(key text primary key,request jsonb not null);
grant usage on schema team_creation_test to authenticated;
grant select,insert on all tables in schema team_creation_test to authenticated;
insert into auth.users(id,email) select team_creation_test.id(n),'team-creation-'||n||'@example.test' from generate_series(1,3) n;
create function team_creation_test.request(n integer,code text default 'ST-12345') returns jsonb language sql stable as $$select jsonb_build_object('version',2,'userId',auth.uid(),'requestNonce',team_creation_test.id(n),'value',jsonb_build_object('name','Sunday Team','code',code,'location','Main Sanctuary','callTime','09:00:00','rehearsalTime','08:15:00'))$$;
create function team_creation_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_create_team_workspace(request);insert into team_creation_test.cases values(label,request,result);return result;end$$;
create function team_creation_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare blocked boolean:=false;begin begin perform public.mobile_create_team_workspace(request);exception when others then if sqlstate=expected then blocked:=true;else raise;end if;end;assert blocked,'Expected creation denial';end$$;
create function team_creation_test.counts() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_array((select count(*) from public.teams),(select count(*) from public.team_members),(select count(*) from public.team_settings),(select count(*) from public.message_channels),(select count(*) from public.message_channel_members),(select count(*) from public.service_templates))$$;
select set_config('request.jwt.claim.sub',team_creation_test.id(1)::text,false);
set role authenticated;
insert into team_creation_test.pending values('applied',team_creation_test.request(100));
select team_creation_test.denied(team_creation_test.request(100)||'{"invites":[]}','22023');
select team_creation_test.capture('applied',team_creation_test.request(100));
do $$declare saved record;v_team uuid;v_member uuid;v_channel uuid;begin
 select * into saved from team_creation_test.cases where name='applied';v_team:=(saved.receipt#>>'{workspace,teamId}')::uuid;v_member:=(saved.receipt#>>'{workspace,memberId}')::uuid;v_channel:=(saved.receipt#>>'{workspace,channelId}')::uuid;
 assert exists(select 1 from public.teams where id=v_team and owner_id=auth.uid() and name='Sunday Team' and code='ST-12345'),'Team bootstrap mismatch';
 assert exists(select 1 from public.team_members where id=v_member and team_id=v_team and profile_id=auth.uid() and role='owner' and status='active'),'Owner membership missing';
 assert exists(select 1 from public.team_settings where team_id=v_team and default_service_location='Main Sanctuary' and default_call_time='09:00'::time and default_rehearsal_time='08:15'::time),'Settings bootstrap mismatch';
 assert exists(select 1 from public.message_channels where id=v_channel and team_id=v_team and channel_type='team') and exists(select 1 from public.message_channel_members where channel_id=v_channel and team_member_id=v_member),'Channel bootstrap missing';
 assert exists(select 1 from public.service_templates where team_id=v_team and name='Sunday Morning Service' and location='Main Sanctuary' and call_time='09:00'::time and rehearsal_time='08:15'::time),'Service template missing';
 assert public.mobile_create_team_workspace(saved.request)=saved.receipt,'Exact creation replay changed';
 perform team_creation_test.denied(jsonb_set(saved.request,'{value,name}','"Changed"'),'22023');
end$$;
select team_creation_test.capture('same-account-code-blocked',team_creation_test.request(101));
reset role;
select set_config('request.jwt.claim.sub',team_creation_test.id(2)::text,false);
set role authenticated;
select team_creation_test.capture('other-account-code-blocked',team_creation_test.request(102));
select team_creation_test.denied((select request from team_creation_test.pending where key='applied'),'42501');
reset role;
-- Test every bootstrap mutation rolls back if the final receipt insert fails.
create table team_creation_test.before_counts as select team_creation_test.counts() value;
create function team_creation_test.fail_late() returns trigger language plpgsql as $$begin if new.request_nonce=team_creation_test.id(103) then raise exception 'Synthetic late creation receipt failure';end if;return new;end$$;
create trigger team_creation_fail_late before insert on private.mobile_team_creation_receipts for each row execute function team_creation_test.fail_late();
select set_config('request.jwt.claim.sub',team_creation_test.id(1)::text,false);
set role authenticated;
select team_creation_test.denied(team_creation_test.request(103,'LT-12345'),'P0001');
reset role;
do $$begin assert team_creation_test.counts()=(select value from team_creation_test.before_counts),'Late receipt failed to roll back complete bootstrap';end$$;
drop trigger team_creation_fail_late on private.mobile_team_creation_receipts;
-- Likewise a failure inside the existing bootstrap leaves no partial team.
create function team_creation_test.fail_template() returns trigger language plpgsql as $$begin if new.team_id in(select id from public.teams where code='FT-12345') then raise exception 'Synthetic service template failure';end if;return new;end$$;
create trigger team_creation_fail_template before insert on public.service_templates for each row execute function team_creation_test.fail_template();
set role authenticated;
select team_creation_test.denied(team_creation_test.request(104,'FT-12345'),'P0001');
reset role;
do $$begin assert team_creation_test.counts()=(select value from team_creation_test.before_counts),'Bootstrap failure left partial team';end$$;
drop trigger team_creation_fail_template on public.service_templates;
-- Mutable team details and ownership never change the stored creation result.
update public.teams set name='Renamed team',code='RN-54321' where id=(select (receipt#>>'{workspace,teamId}')::uuid from team_creation_test.cases where name='applied');
insert into public.team_members(id,team_id,profile_id,role,status) select team_creation_test.id(20),(receipt#>>'{workspace,teamId}')::uuid,team_creation_test.id(3),'member','active' from team_creation_test.cases where name='applied';
set role authenticated;
select public.transfer_team_ownership((select (receipt#>>'{workspace,teamId}')::uuid from team_creation_test.cases where name='applied'),team_creation_test.id(20));
do $$declare saved record;begin select * into saved from team_creation_test.cases where name='applied';assert public.mobile_create_team_workspace(saved.request)=saved.receipt,'History changed after code/name/owner changes';end$$;
reset role;
-- Privileged fixture deletion exercises history retention even after complete
-- physical parent removal. It is not a new mobile team-deletion workflow.
begin;
select set_config('request.jwt.claim.sub','',true);
select set_config('app.transfer_team_ownership','on',true);
delete from public.teams where id=(select (receipt#>>'{workspace,teamId}')::uuid from team_creation_test.cases where name='applied');
commit;
select set_config('request.jwt.claim.sub',team_creation_test.id(1)::text,false);
set role authenticated;
do $$declare saved record;begin select * into saved from team_creation_test.cases where name='applied';assert public.mobile_create_team_workspace(saved.request)=saved.receipt,'Deleted team bootstrap was replayed';assert not exists(select 1 from public.teams where id=(saved.receipt#>>'{workspace,teamId}')::uuid or code='ST-12345'),'Creation replay resurrected a deleted team';end$$;
-- The collision result is terminal even after its old code becomes available.
do $$declare saved record;begin select * into saved from team_creation_test.cases where name='same-account-code-blocked';assert public.mobile_create_team_workspace(saved.request)=saved.receipt,'Blocked code history changed';end$$;
reset role;
do $$declare blocked boolean:=false;begin begin update private.mobile_team_creation_receipts set recorded_at=clock_timestamp();exception when others then blocked:=true;end;assert blocked,'Creation receipts mutable';end$$;
set role authenticated;
do $$declare blocked boolean:=false;begin begin perform 1 from private.mobile_team_creation_receipts;exception when insufficient_privilege then blocked:=true;end;assert blocked,'Private creation ledger exposed';end$$;
reset role;
set role anon;
do $$declare blocked boolean:=false;begin begin perform public.mobile_create_team_workspace(null);exception when insufficient_privilege then blocked:=true;end;assert blocked,'Anonymous creation allowed';end$$;
reset role;
