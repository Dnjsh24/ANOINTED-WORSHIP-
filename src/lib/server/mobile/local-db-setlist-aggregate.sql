\set ON_ERROR_STOP on
-- Synthetic disposable PostgreSQL verification only. Never deploy these helpers or users.
create schema setlist_test;
create function setlist_test.id(n integer) returns uuid language sql immutable as $$select ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table setlist_test.ids(key text primary key,id uuid not null);
insert into auth.users(id,email) values(setlist_test.id(1),'setlist-owner-a@example.test'),(setlist_test.id(2),'setlist-owner-b@example.test'),(setlist_test.id(3),'setlist-member@example.test');
select set_config('request.jwt.claim.sub',setlist_test.id(1)::text,false);
insert into setlist_test.ids select 'teamA',team_id from public.create_team_workspace('Setlist aggregate A','SA-61018');
select set_config('request.jwt.claim.sub',setlist_test.id(2)::text,false);
insert into setlist_test.ids select 'teamB',team_id from public.create_team_workspace('Setlist aggregate B','SB-61018');
select set_config('request.jwt.claim.sub',setlist_test.id(1)::text,false);
insert into public.team_members(team_id,profile_id,role,status) select id,setlist_test.id(3),'member','active' from setlist_test.ids where key='teamA';
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status)
 select setlist_test.id(10),id,'Approved','Artist','C','[C] Song',setlist_test.id(1),'approved' from setlist_test.ids where key='teamA';
-- Seed a historical pending row as the disposable database owner; current website inserts require approved.
select set_config('request.jwt.claim.sub','',false);
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status)
 select setlist_test.id(11),id,'Pending','Artist','G','[G] Song',setlist_test.id(1),'pending' from setlist_test.ids where key='teamA';
select set_config('request.jwt.claim.sub',setlist_test.id(2)::text,false);
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status)
 select setlist_test.id(12),id,'Foreign','Artist','D','[D] Song',setlist_test.id(2),'approved' from setlist_test.ids where key='teamB';
select set_config('request.jwt.claim.sub',setlist_test.id(1)::text,false);
create function setlist_test.details() returns jsonb language sql immutable as $$select jsonb_build_object('name','Sunday','event_type','service','setlist_date','2026-10-18','location','Hall','call_time','09:00','rehearsal_time','08:00','service_times',jsonb_build_array('Sunday Worship'),'notes','Plan','update_event',false)$$;
create function setlist_test.base(p_id uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('record',to_jsonb(s),'slots',coalesce((select jsonb_agg(to_jsonb(ss) order by song_order,id) from public.setlist_songs ss where setlist_id=s.id and deleted_at is null),'[]'::jsonb),'linkedEvent',(select to_jsonb(e) from public.events e where e.id=s.event_id)) from public.setlists s where s.id=p_id;
$$;
create function setlist_test.slot(p_id uuid,p_song uuid) returns jsonb language sql immutable as $$
 select jsonb_build_object('localId',p_id,'sourceSlotId',null,'songId',p_song,'assignedKey','G','notes','Keep rehearsal notes','bandNotes','Band cue','arrangement','Verse twice','leadMemberId',null,'youtubeUrl','https://example.test/reference','slideSettings',jsonb_build_object('custom',jsonb_build_array('keep')));
$$;
create function setlist_test.slots(p_id uuid) returns jsonb language sql stable as $$
 select coalesce(jsonb_agg(jsonb_build_object('localId',id,'sourceSlotId',id,'songId',song_id,'assignedKey',assigned_key,'notes',notes,'bandNotes',band_notes,'arrangement',arrangement,'leadMemberId',lead_member_id,'youtubeUrl',youtube_url,'slideSettings',slide_settings) order by song_order,id),'[]'::jsonb) from public.setlist_songs where setlist_id=p_id and deleted_at is null;
$$;
create function setlist_test.intent(p_id uuid,p_base jsonb,p_slots jsonb,p_template jsonb default 'null') returns jsonb language sql immutable as $$
 select jsonb_build_object('setlistId',p_id,'baseValue',p_base,'slots',p_slots,'template',p_template);
$$;
create table setlist_test.race(base jsonb,intent jsonb,revision bigint);
create table setlist_test.race_results(outcome text);

do $$declare t uuid; other_team uuid; sid uuid; result uuid; old_base jsonb; slots jsonb; intent jsonb; before_row jsonb; rejected boolean; template jsonb; n bigint; selected_event uuid; siblings jsonb;
begin
 select id into t from setlist_test.ids where key='teamA'; select id into other_team from setlist_test.ids where key='teamB';
 assert not has_function_privilege('authenticated','private.save_setlist_workspace_core(uuid,uuid,uuid,jsonb,uuid[],uuid,bigint,jsonb)','execute'),'private core exposed';
 assert not has_function_privilege('anon','private.save_setlist_workspace_core(uuid,uuid,uuid,jsonb,uuid[],uuid,bigint,jsonb)','execute'),'anonymous core exposed';
 assert not has_function_privilege('authenticated','private.delete_setlist_aggregate(uuid,uuid,jsonb,jsonb)','execute'),'private deletion exposed';
 assert has_function_privilege('authenticated','public.save_setlist_workspace(uuid,uuid,uuid,jsonb,uuid[],uuid,bigint)','execute'),'website grant lost';
 raise notice 'PASS private execution denied and original public grant retained';

 -- Existing wrapper retains random IDs, pending-song eligibility and occurrence-based identities.
 sid:=public.save_setlist_workspace(t,null,null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null);
 old_base:=setlist_test.base(sid); slots:=setlist_test.slots(sid);
 update public.setlist_songs set notes='Second occurrence' where id=(slots->1->>'localId')::uuid;
 old_base:=setlist_test.base(sid);
 perform public.save_setlist_workspace(t,sid,null,setlist_test.details(),array[setlist_test.id(11)],null,(old_base->'record'->>'sync_revision')::bigint);
 assert (select count(*)=1 and min(id::text)=(slots->0->>'localId') from public.setlist_songs where setlist_id=sid),'website occurrence identity changed';
 raise notice 'PASS unchanged website create/update and duplicate occurrence matching';

 -- Stable native create stores every per-occurrence field and does not create an event.
 slots:=jsonb_build_array(setlist_test.slot(setlist_test.id(31),setlist_test.id(11)),jsonb_set(setlist_test.slot(setlist_test.id(32),setlist_test.id(11)),'{notes}','"Second occurrence"'));
 intent:=setlist_test.intent(setlist_test.id(30),'null',slots);
 result:=private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null,null,intent);
 assert result=setlist_test.id(30) and (select event_id is null from public.setlists where id=result),'stable setlist ID/event contract';
 assert (select count(*)=2 from public.setlist_songs where setlist_id=result and id in(setlist_test.id(31),setlist_test.id(32)) and band_notes='Band cue' and arrangement='Verse twice' and slide_settings='{"custom":["keep"]}'),'native metadata missing';
 old_base:=setlist_test.base(result); slots:=setlist_test.slots(result);
 slots:=jsonb_build_array(slots->1,slots->0);
 intent:=setlist_test.intent(result,old_base,slots);
 perform private.save_setlist_workspace_core(t,result,null,jsonb_set(setlist_test.details(),'{name}','"Reordered"'),array[setlist_test.id(11),setlist_test.id(11)],null,(old_base->'record'->>'sync_revision')::bigint,intent);
 assert (select song_order=1 and notes='Second occurrence' from public.setlist_songs where id=setlist_test.id(32)),'duplicate metadata/order lost';
 assert (select song_order=2 and notes='Keep rehearsal notes' from public.setlist_songs where id=setlist_test.id(31)),'original metadata/order lost';
 raise notice 'PASS stable native create and explicit repeated-song reorder preserve metadata';

 -- A matching revision alone cannot authorize a forged or stale full base.
 old_base:=setlist_test.base(result); slots:=setlist_test.slots(result); before_row:=old_base;
 rejected:=false;begin
  perform private.save_setlist_workspace_core(t,result,null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null,(old_base->'record'->>'sync_revision')::bigint,
    setlist_test.intent(result,jsonb_set(old_base,'{slots,0,notes}','"Invented base"'),slots));
 exception when sqlstate '40001' then rejected:=true;end;
 assert rejected and setlist_test.base(result)=before_row,'forged child base applied or partially wrote';
 -- Typed equality accepts equivalent timestamp encodings and unordered base arrays.
 old_base:=jsonb_set(old_base,'{record,created_at}',to_jsonb(replace(old_base->'record'->>'created_at','+00:00','Z')));
 old_base:=jsonb_set(old_base,'{slots}',jsonb_build_array(old_base->'slots'->1,old_base->'slots'->0));
 perform private.save_setlist_workspace_core(t,result,null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null,(old_base->'record'->>'sync_revision')::bigint,setlist_test.intent(result,old_base,slots));
 raise notice 'PASS typed full-base conflict/rollback and equivalent timestamp/base-array normalization';

 -- Legacy invalid metadata survives unchanged; edited invalid values roll back.
 update public.setlist_songs set assigned_key='Legacy key',notes=repeat('x',2100),slide_settings='["legacy"]' where id=setlist_test.id(31);
 old_base:=setlist_test.base(result); slots:=setlist_test.slots(result);
 perform private.save_setlist_workspace_core(t,result,null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null,(old_base->'record'->>'sync_revision')::bigint,setlist_test.intent(result,old_base,slots));
 assert (select assigned_key='Legacy key' and length(notes)=2100 and slide_settings='["legacy"]' from public.setlist_songs where id=setlist_test.id(31)),'legacy metadata rewritten';
 old_base:=setlist_test.base(result); slots:=setlist_test.slots(result); before_row:=old_base;
 rejected:=false;begin
  perform private.save_setlist_workspace_core(t,result,null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null,(old_base->'record'->>'sync_revision')::bigint,setlist_test.intent(result,old_base,jsonb_set(slots,'{1,notes}',to_jsonb(repeat('y',2100)))));
 exception when sqlstate '22023' then rejected:=true;end;
 assert rejected and setlist_test.base(result)=before_row,'invalid changed legacy metadata applied';
 raise notice 'PASS unchanged legacy data retained and changed-invalid metadata atomic rejection';

 -- New/retained ID aliases, foreign songs and slot-count overflow cannot partially write.
 foreach intent in array array[
  setlist_test.intent(setlist_test.id(40),'null',jsonb_build_array(setlist_test.slot(setlist_test.id(41),setlist_test.id(12)))),
  setlist_test.intent(setlist_test.id(42),'null',jsonb_build_array(setlist_test.slot(setlist_test.id(42),setlist_test.id(11)))),
  setlist_test.intent(setlist_test.id(43),'null',jsonb_build_array(setlist_test.slot(setlist_test.id(31),setlist_test.id(11))))
 ] loop
  n:=(select count(*) from public.setlists); rejected:=false;begin
   perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[(intent->'slots'->0->>'songId')::uuid],null,null,intent);
  exception when sqlstate '22023' or sqlstate '40001' then rejected:=true;end;
  assert rejected and (select count(*)=n from public.setlists),'invalid identity/song wrote parent';
 end loop;
 select jsonb_agg(setlist_test.slot(setlist_test.id(1000+i),setlist_test.id(11))) into slots from generate_series(1,201) i;
 rejected:=false;begin
  perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array(select setlist_test.id(11) from generate_series(1,201)),null,null,setlist_test.intent(setlist_test.id(44),'null',slots));
 exception when sqlstate '22023' then rejected:=true;end;
 assert rejected,'201 slots accepted';
 raise notice 'PASS invalid identity, same-team song boundary and 200-slot limit';

 insert into public.setlist_templates(id,team_id,name,slots,created_by) values(setlist_test.id(50),t,'Template','[{"label":"Praise","tag":"Praise"},{"label":"Praise","tag":"Praise","custom":{"retain":true}}]',setlist_test.id(1));
 select jsonb_build_object('base',to_jsonb(s),'placeholders',jsonb_build_array(jsonb_build_object('slotId',setlist_test.id(52),'songId',setlist_test.id(53)),jsonb_build_object('slotId',setlist_test.id(54),'songId',setlist_test.id(55)))) into template from public.setlist_templates s where id=setlist_test.id(50);
 slots:=jsonb_build_array(setlist_test.slot(setlist_test.id(56),setlist_test.id(11)));
 perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(11)],setlist_test.id(50),null,setlist_test.intent(setlist_test.id(51),'null',slots,template));
 assert (select count(*)=3 from public.setlist_songs where setlist_id=setlist_test.id(51)),'template did not append selected song';
 assert (select song_id=setlist_test.id(53) and song_order=1 and notes='Template Tag: Praise' from public.setlist_songs where id=setlist_test.id(52)),'stable template placeholder missing';
 assert (select title='[Slot: Praise]' and artist='Template' and original_key='C' from public.songs where id=setlist_test.id(55)),'template service semantics differ';
 template:=jsonb_set(template,'{placeholders}',jsonb_build_array(jsonb_build_object('slotId',setlist_test.id(62),'songId',setlist_test.id(63)),jsonb_build_object('slotId',setlist_test.id(64),'songId',setlist_test.id(65))));
 slots:=jsonb_build_array(setlist_test.slot(setlist_test.id(66),setlist_test.id(11)));
 update public.setlist_templates set name='Changed template' where id=setlist_test.id(50);
 n:=(select count(*) from public.songs); rejected:=false;begin
  perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(11)],setlist_test.id(50),null,setlist_test.intent(setlist_test.id(61),'null',slots,template));
 exception when sqlstate '40001' then rejected:=true;end;
 assert rejected and (select count(*)=n from public.songs) and not exists(select 1 from public.setlists where id=setlist_test.id(61)),'changed template wrote partial placeholders';
 raise notice 'PASS exact captured template, stable placeholder IDs and atomic changed-template conflict';

 -- Internal core still checks the real current actor, not its private caller's database role.
 perform set_config('request.jwt.claim.sub',setlist_test.id(2)::text,true); rejected:=false;begin
  perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(11)],null,null,setlist_test.intent(setlist_test.id(70),'null',slots));
 exception when sqlstate '42501' then rejected:=true;end; assert rejected,'foreign actor allowed';
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true); rejected:=false;begin
  perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(11)],null,null,setlist_test.intent(setlist_test.id(70),'null',slots));
 exception when sqlstate '42501' then rejected:=true;end; assert rejected,'read-only member allowed';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 raise notice 'PASS foreign and unprivileged actor rejection';

 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values(setlist_test.id(80),t,'Linked event','service','2026-10-18','09:00',setlist_test.id(1));
 selected_event:=setlist_test.id(80);
 sid:=public.save_setlist_workspace(t,null,selected_event,setlist_test.details(),array[setlist_test.id(10)],null);
 insert into setlist_test.ids values('deleteTarget',sid);
 result:=public.save_setlist_workspace(t,null,selected_event,setlist_test.details(),array[setlist_test.id(10)],null);
 old_base:=setlist_test.base(sid); slots:=setlist_test.slots(sid);
 -- The public service preserves update links even if a caller supplies another p_event_id.
 perform private.save_setlist_workspace_core(t,sid,null,setlist_test.details(),array[setlist_test.id(10)],null,(old_base->'record'->>'sync_revision')::bigint,setlist_test.intent(sid,old_base,slots));
 assert (select event_id=setlist_test.id(80) from public.setlists where id=sid),'update lost original event link';
 old_base:=setlist_test.base(sid);
 rejected:=false;begin
  perform private.delete_setlist_aggregate(t,sid,old_base,'{"deleteLinkedEvent":true,"unlinkSetlists":[]}');
 exception when sqlstate '40001' then rejected:=true;end; assert rejected and exists(select 1 from public.setlists where id=sid),'unreviewed sibling deleted';
 select jsonb_agg(jsonb_build_object('id',s.id,'revision',s.sync_revision) order by s.id) into siblings from public.setlists s where event_id=setlist_test.id(80) and id<>sid;
 update public.events set name='New event details' where id=setlist_test.id(80);
 rejected:=false;begin
  perform private.delete_setlist_aggregate(t,sid,old_base,jsonb_build_object('deleteLinkedEvent',true,'unlinkSetlists',siblings));
 exception when sqlstate '40001' then rejected:=true;end; assert rejected and exists(select 1 from public.events where id=setlist_test.id(80)),'changed linked event deleted';
 old_base:=setlist_test.base(sid);
 perform private.delete_setlist_aggregate(t,sid,old_base,jsonb_build_object('deleteLinkedEvent',true,'unlinkSetlists',siblings));
 assert not exists(select 1 from public.events where id=setlist_test.id(80)) and not exists(select 1 from public.setlists where id=sid),'consented cascade not applied';
 assert (select event_id is null from public.setlists where id=result),'sibling lost instead of unlinked';
 raise notice 'PASS preserved update event link and exact consented event/sibling deletion cascade';

 -- Save original typed state for two concurrent native writers. Exactly one may apply this base.
 old_base:=setlist_test.base(setlist_test.id(30)); slots:=setlist_test.slots(setlist_test.id(30));
 insert into setlist_test.race values(old_base,setlist_test.intent(setlist_test.id(30),old_base,slots),(old_base->'record'->>'sync_revision')::bigint);
end;
$$;

-- Real PostgreSQL roles exercise EXECUTE grants and SECURITY DEFINER delegation, in addition to claims.
grant usage on schema setlist_test to authenticated,anon;
do $$declare t uuid; sid uuid; b jsonb; slots jsonb; before_rows jsonb; rejected boolean; statement text; actor uuid;
begin
 select id into t from setlist_test.ids where key='teamA';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 execute 'set local role authenticated';
 sid:=public.save_setlist_workspace(t,null,null,setlist_test.details(),array[setlist_test.id(10)],null);
 b:=setlist_test.base(sid);
 perform public.save_setlist_workspace(t,sid,null,jsonb_set(setlist_test.details(),'{name}','"Authenticated update"'),array[setlist_test.id(10)],null,(b->'record'->>'sync_revision')::bigint);
 assert (select name='Authenticated update' from public.setlists where id=sid),'authenticated website wrapper failed';
 execute 'reset role';
 before_rows:=jsonb_build_object('setlists',(select jsonb_agg(to_jsonb(s) order by id) from public.setlists s),'slots',(select jsonb_agg(to_jsonb(s) order by id) from public.setlist_songs s));
 execute 'set local role authenticated';
 foreach statement in array array[
  format('select private.assert_setlist_aggregate_base(%L::uuid,%L::uuid,%L::jsonb)',t,sid,b),
  format('select private.check_setlist_aggregate_intent(%L::uuid,null,null,''{}''::uuid[],null,''{}''::jsonb)',t),
  format('select private.apply_setlist_slot_intent(%L::uuid,''[]''::jsonb)',sid),
  format('select private.save_setlist_workspace_core(%L::uuid,null,null,%L::jsonb,''{}''::uuid[],null,null,null)',t,setlist_test.details()),
  format('select private.delete_setlist_aggregate(%L::uuid,%L::uuid,%L::jsonb,''{}''::jsonb)',t,sid,b)
 ] loop
  rejected:=false;begin execute statement;exception when sqlstate '42501' then rejected:=true;end;assert rejected,'authenticated direct private EXECUTE accepted';
 end loop;
 execute 'reset role';
 foreach actor in array array[setlist_test.id(2),setlist_test.id(3)] loop
  perform set_config('request.jwt.claim.sub',actor::text,true); execute 'set local role authenticated';
  rejected:=false;begin perform public.save_setlist_workspace(t,null,null,setlist_test.details(),array[setlist_test.id(10)],null);exception when sqlstate '42501' then rejected:=true;end;
  assert rejected,'foreign/read-only authenticated public write accepted'; execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon';
 rejected:=false;begin perform public.save_setlist_workspace(t,null,null,setlist_test.details(),array[setlist_test.id(10)],null);exception when sqlstate '42501' then rejected:=true;end;assert rejected,'anonymous public write accepted';
 execute 'reset role';
 assert before_rows=jsonb_build_object('setlists',(select jsonb_agg(to_jsonb(s) order by id) from public.setlists s),'slots',(select jsonb_agg(to_jsonb(s) order by id) from public.setlist_songs s)),'denied role calls changed data';
 raise notice 'PASS real authenticated website create/update, five private EXECUTE denials and foreign/read-only/anonymous rejection';
end;
$$;

do $$declare t uuid; sid uuid:=setlist_test.id(200); slots jsonb; intent jsonb; invalid jsonb; details jsonb; rejected boolean; n bigint; b jsonb; sibling uuid; target uuid; cascade jsonb; event_id uuid:=setlist_test.id(220);
begin
 select id into t from setlist_test.ids where key='teamA'; perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 slots:=jsonb_build_array(setlist_test.slot(setlist_test.id(201),setlist_test.id(10))||jsonb_build_object('notes',null,'bandNotes',null,'arrangement',null,'leadMemberId',null,'youtubeUrl',null,'slideSettings',null));
 intent:=setlist_test.intent(sid,'null',slots);
 foreach invalid in array array['null'::jsonb,'[]'::jsonb,intent-'setlistId',intent-'baseValue',intent-'slots',intent-'template',jsonb_set(intent,'{slots}','null'),jsonb_set(intent,'{baseValue}','{}'),
   jsonb_set(intent,'{slots,0,assignedKey}','null'),jsonb_set(intent,'{slots,0,sourceSlotId}','false'),jsonb_set(intent,'{slots,0,notes}','false'),jsonb_set(intent,'{slots,0,slideSettings}','[]'),jsonb_set(intent,'{slots,0,localId}','null'),jsonb_set(intent,'{slots,0}',(slots->0)-'bandNotes')
 ] loop
  n:=(select count(*) from public.setlists); rejected:=false;begin
   perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(10)],null,null,invalid);
  exception when sqlstate '22023' or sqlstate '40001' then rejected:=true;end;
  assert rejected and (select count(*)=n from public.setlists),'malformed native intent partially wrote';
 end loop;
 rejected:=false;begin perform private.check_setlist_aggregate_intent(t,null,null,array[setlist_test.id(10)],null,null);exception when sqlstate '22023' then rejected:=true;end;assert rejected,'SQL-null native validator intent accepted';
 foreach details in array array[setlist_test.details()-'update_event',jsonb_set(setlist_test.details(),'{update_event}','null'),jsonb_set(setlist_test.details(),'{update_event}','"false"'),jsonb_set(setlist_test.details(),'{update_event}','true')] loop
  rejected:=false;begin perform private.save_setlist_workspace_core(t,null,null,details,array[setlist_test.id(10)],null,null,intent);exception when sqlstate '22023' then rejected:=true;end;assert rejected and not exists(select 1 from public.setlists where id=sid),'native event-write mode accepted';
 end loop;
 perform private.save_setlist_workspace_core(t,null,null,setlist_test.details(),array[setlist_test.id(10)],null,null,intent);
 assert (select notes is null and band_notes is null and arrangement is null and lead_member_id is null and youtube_url is null and slide_settings is null from public.setlist_songs where id=setlist_test.id(201)),'new nullable defaults changed';
 update public.setlist_songs set slide_settings='null'::jsonb where id=setlist_test.id(201);
 b:=setlist_test.base(sid); slots:=setlist_test.slots(sid);
 perform private.save_setlist_workspace_core(t,sid,null,setlist_test.details(),array[setlist_test.id(10)],null,(b->'record'->>'sync_revision')::bigint,setlist_test.intent(sid,b,slots));
 assert (select slide_settings is not null and slide_settings='null'::jsonb from public.setlist_songs where id=setlist_test.id(201)),'unchanged JSON-null slide settings collapsed to SQL NULL';
 update public.setlist_songs set slide_settings='{"backgroundType":"color","backgroundValue":"#000000"}' where id=setlist_test.id(201);
 b:=setlist_test.base(sid); slots:=setlist_test.slots(sid); rejected:=false;begin
  perform private.save_setlist_workspace_core(t,sid,null,setlist_test.details(),array[setlist_test.id(10)],null,(b->'record'->>'sync_revision')::bigint,setlist_test.intent(sid,b,jsonb_set(slots,'{0,slideSettings}','null')));
 exception when sqlstate '22023' then rejected:=true;end;assert rejected and setlist_test.base(sid)=b,'changed null slide settings applied';
 foreach invalid in array array['null'::jsonb,'[]'::jsonb,b-'record',b-'slots',jsonb_set(b,'{record}','null'),jsonb_set(b,'{slots}','null')] loop
  rejected:=false;begin perform private.assert_setlist_aggregate_base(t,sid,invalid);exception when sqlstate '22023' then rejected:=true;end;assert rejected,'malformed saved base accepted';
 end loop;
 raise notice 'PASS native JSON/null/missing-key/type matrix, event-write rejection and exact SQL/JSON-null preservation';

 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values(event_id,t,'Tombstone siblings','service','2026-10-18','09:00',setlist_test.id(1));
 target:=public.save_setlist_workspace(t,null,event_id,setlist_test.details(),array[setlist_test.id(10)],null);
 sibling:=public.save_setlist_workspace(t,null,event_id,setlist_test.details(),array[setlist_test.id(10)],null);
 update public.setlists set deleted_at=now() where id=sibling;
 b:=setlist_test.base(target); rejected:=false;begin perform private.delete_setlist_aggregate(t,target,b,'{"deleteLinkedEvent":true,"unlinkSetlists":[]}');exception when sqlstate '40001' then rejected:=true;end;assert rejected,'unreviewed soft-deleted sibling was unlinked';
 select jsonb_build_object('deleteLinkedEvent',true,'unlinkSetlists',jsonb_build_array(jsonb_build_object('id',id,'revision',sync_revision))) into cascade from public.setlists where id=sibling;
 perform private.delete_setlist_aggregate(t,target,b,cascade);
 assert (select s.event_id is null and s.deleted_at is not null from public.setlists s where s.id=sibling),'reviewed soft-deleted sibling was lost/resurrected';
 raise notice 'PASS soft-deleted linked sibling requires explicit scope and survives consented unlink';
end;
$$;
