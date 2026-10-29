\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic loopback verification only. Never hosted data.
create schema team_settings_edit_test;
create function team_settings_edit_test.id(n integer) returns uuid language sql immutable as $$select ('99400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table team_settings_edit_test.ids(key text primary key,id uuid not null);
create table team_settings_edit_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema team_settings_edit_test to authenticated;
grant select,insert on team_settings_edit_test.ids,team_settings_edit_test.cases to authenticated;
insert into auth.users(id,email) select team_settings_edit_test.id(n),'defaults-'||n||'@example.test' from generate_series(1,4) n;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
insert into team_settings_edit_test.ids select 'team',team_id from public.create_team_workspace('Defaults A','DA-71022');
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(2)::text,false);
insert into team_settings_edit_test.ids select 'other',team_id from public.create_team_workspace('Defaults B','DB-71022');
create function team_settings_edit_test.team() returns uuid language sql stable as $$select id from team_settings_edit_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values
 (team_settings_edit_test.id(10),team_settings_edit_test.team(),team_settings_edit_test.id(3),'member','active'),
 (team_settings_edit_test.id(11),team_settings_edit_test.team(),team_settings_edit_test.id(4),'admin','active');
update public.team_settings set default_service_location='Existing chapel',default_call_time='07:30:15.123456',default_rehearsal_time='24:00:00',
 notification_preferences=array['futureOption','upcomingEvents','anotherFuture'],dashboard_widgets=array['customWidget','songs'] where team_id=team_settings_edit_test.team();
create function team_settings_edit_test.request(n integer) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',team_settings_edit_test.team(),'memberId',(select id from public.team_members where team_id=team_settings_edit_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',team_settings_edit_test.id(n),'base',private.mobile_team_settings_snapshot(team_settings_edit_test.team())-'teamId','value',jsonb_build_object('teamName',(select name from public.teams where id=team_settings_edit_test.team()),
 'defaultServiceLocation',s.default_service_location,'defaultCallTime',s.default_call_time::text,'defaultRehearsalTime',s.default_rehearsal_time::text,'notificationPreferences',s.notification_preferences)) from public.team_settings s where s.team_id=team_settings_edit_test.team()
$$;
create function team_settings_edit_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_team_settings_edit((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function team_settings_edit_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=team_settings_edit_test.rpc(request);insert into team_settings_edit_test.cases values(label,request,result);return result;end$$;
create function team_settings_edit_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform team_settings_edit_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected defaults denial '||expected;end$$;
create table team_settings_edit_test.saved(request jsonb);
grant select,insert on team_settings_edit_test.saved to authenticated;
set role authenticated;
do $$declare req jsonb;result jsonb;prior_team jsonb;prior_settings jsonb;begin
 req:=team_settings_edit_test.request(200);select to_jsonb(t) into prior_team from public.teams t where id=team_settings_edit_test.team();select to_jsonb(s) into prior_settings from public.team_settings s where team_id=team_settings_edit_test.team();
 result:=team_settings_edit_test.capture('exact-noop',req);assert result->>'status'='applied','No-op not confirmed';
 assert prior_team=(select to_jsonb(t) from public.teams t where id=team_settings_edit_test.team()) and prior_settings=(select to_jsonb(s) from public.team_settings s where team_id=team_settings_edit_test.team()),'No-op rewrote timestamps or values';
 req:=jsonb_set(jsonb_set(jsonb_set(team_settings_edit_test.request(201),'{value,teamName}','"Renamed ministry"'),'{value,defaultServiceLocation}','"South chapel"'),'{value,notificationPreferences}','["futureOption","attendanceReminders","anotherFuture"]');
 result:=team_settings_edit_test.capture('atomic-defaults-applied',req);assert result->>'status'='applied' and result#>>'{current,teamName}'='Renamed ministry' and result#>>'{current,settings,defaultCallTime}'='07:30:15.123456' and result#>>'{current,settings,defaultRehearsalTime}'='24:00:00','Exact defaults/precision not persisted';
 assert (select code='DA-71022' and owner_id=team_settings_edit_test.id(1) from public.teams where id=team_settings_edit_test.team()) and result#>'{current,settings,dashboardWidgets}'='["customWidget","songs"]','Unrelated team/dashboard state changed';
 select to_jsonb(t) into prior_team from public.teams t where id=team_settings_edit_test.team();select to_jsonb(s) into prior_settings from public.team_settings s where team_id=team_settings_edit_test.team();
 assert team_settings_edit_test.rpc(req)=result and prior_team=(select to_jsonb(t) from public.teams t where id=team_settings_edit_test.team()) and prior_settings=(select to_jsonb(s) from public.team_settings s where team_id=team_settings_edit_test.team()),'Lostreply retry repeated writes';
 perform team_settings_edit_test.denied(jsonb_set(req,'{value,teamName}','"Changed intent"'),'22023');
 perform team_settings_edit_test.denied(jsonb_set(req,'{userId}',to_jsonb(team_settings_edit_test.id(2))),'42501');
 perform team_settings_edit_test.denied(jsonb_set(req,'{memberId}',to_jsonb(team_settings_edit_test.id(11))),'42501');
 perform team_settings_edit_test.denied(req||'{"teamCode":"FORBIDDEN"}','22023');
 perform team_settings_edit_test.denied(jsonb_set(req,'{version}','null'),'22023');
 perform team_settings_edit_test.denied(jsonb_set(team_settings_edit_test.request(202),'{value,defaultCallTime}','"25:00"'),'22023');
 perform team_settings_edit_test.denied(jsonb_set(team_settings_edit_test.request(202),'{value,teamName}','" x "'),'22023');
 perform team_settings_edit_test.denied(jsonb_set(team_settings_edit_test.request(202),'{value,notificationPreferences}','["attendanceReminders"]'),'22023');
 perform team_settings_edit_test.denied(jsonb_set(team_settings_edit_test.request(202),'{value,notificationPreferences}','["futureOption","newUnknown","anotherFuture"]'),'22023');
 result:=team_settings_edit_test.capture('stale-full-base-conflict',jsonb_set(req,'{requestNonce}',to_jsonb(team_settings_edit_test.id(203))));assert result->>'status'='conflict','Stale base overwrote defaults';
 result:=team_settings_edit_test.capture('null-base-conflict',jsonb_set(jsonb_set(team_settings_edit_test.request(204),'{base,settings}','null'),'{value,notificationPreferences}','[]'));assert result->>'status'='conflict','Null base overwrote existing settings';
 insert into team_settings_edit_test.saved values(jsonb_set(team_settings_edit_test.request(205),'{value,teamName}','"Must not overwrite website"'));
end$$;
reset role;
-- Existing website changes serialize on the same rows; downloaded timestamps matter.
update public.team_settings set dashboard_widgets=array['websiteChanged'] where team_id=team_settings_edit_test.team();
set role authenticated;
select team_settings_edit_test.capture('website-dashboard-conflict',(select request from team_settings_edit_test.saved where request->>'requestNonce'=team_settings_edit_test.id(205)::text));
reset role;
-- A late second write failure must roll back an earlier team-name update.
create function team_settings_edit_test.fail_settings() returns trigger language plpgsql as $$begin if new.default_service_location='ROLLBACK' then raise exception 'Synthetic second-write failure' using errcode='23514';end if;return new;end$$;
create trigger team_settings_edit_test_failure before update on public.team_settings for each row execute function team_settings_edit_test.fail_settings();
insert into team_settings_edit_test.saved values(jsonb_set(jsonb_set(team_settings_edit_test.request(210),'{value,teamName}','"Rollback ministry"'),'{value,defaultServiceLocation}','"ROLLBACK"'));
set role authenticated;
select team_settings_edit_test.denied((select request from team_settings_edit_test.saved where request->>'requestNonce'=team_settings_edit_test.id(210)::text),'23514');
reset role;
do $$begin assert (select name='Renamed ministry' from public.teams where id=team_settings_edit_test.team()) and (select default_service_location='South chapel' from public.team_settings where team_id=team_settings_edit_test.team()) and not exists(select 1 from private.mobile_team_settings_edit_receipts where request_nonce=team_settings_edit_test.id(210)),'Late settings failure left partial name/defaults/receipt';end$$;
drop trigger team_settings_edit_test_failure on public.team_settings;
set role authenticated;
select team_settings_edit_test.capture('latefailure-exact-retry',(select request from team_settings_edit_test.saved where request->>'requestNonce'=team_settings_edit_test.id(210)::text));
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(4)::text,false);
select team_settings_edit_test.denied(team_settings_edit_test.request(220),'42501');
reset role;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
select public.set_team_permission_override(team_settings_edit_test.team(),null,team_settings_edit_test.id(10),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(3)::text,false);
select team_settings_edit_test.capture('delegated-defaults-applied',jsonb_set(team_settings_edit_test.request(221),'{value,defaultCallTime}','"08:30"'));
reset role;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
select public.set_team_permission_override(team_settings_edit_test.team(),null,team_settings_edit_test.id(10),'team.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(3)::text,false);
select team_settings_edit_test.denied((select request from team_settings_edit_test.cases where name='delegated-defaults-applied'),'42501');
reset role;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
insert into team_settings_edit_test.saved values(jsonb_set(team_settings_edit_test.request(230),'{value,teamName}','"Must not rename missing"'));
delete from public.team_settings where team_id=team_settings_edit_test.team();
set role authenticated;
select team_settings_edit_test.capture('missing-settings',(select request from team_settings_edit_test.saved where request->>'requestNonce'=team_settings_edit_test.id(230)::text));
do $$declare denied boolean:=false;begin
 assert (select name='Rollback ministry' from public.teams where id=team_settings_edit_test.team()),'Missing settings renamed team';
 assert team_settings_edit_test.rpc((select request from team_settings_edit_test.cases where name='atomic-defaults-applied'))=(select receipt from team_settings_edit_test.cases where name='atomic-defaults-applied'),'Historical receipt changed';
 assert not exists(select 1 from public.team_settings where team_id=team_settings_edit_test.team()),'Historical retry revived settings';
 begin perform 1 from private.mobile_team_settings_edit_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private defaults ledger readable';
end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_team_settings_edit_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable defaults receipt edited';end$$;
-- Restore one real row for the separate concurrent website/native CAS assertion.
insert into public.team_settings(team_id,default_service_location,default_call_time,default_rehearsal_time,notification_preferences,dashboard_widgets) values(team_settings_edit_test.team(),'Concurrent chapel','09:00','09:15',array['futureOption'],array['retainedWidget']);
insert into team_settings_edit_test.saved values(jsonb_set(team_settings_edit_test.request(240),'{value,teamName}','"Concurrent native must conflict"'));
select 'PASS atomic ministry defaults, full-base CAS, preserved unknown preferences/seconds/widgets, rollback, current authority and historical non-revival' as result;
