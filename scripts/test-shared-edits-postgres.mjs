// Runs real PostgreSQL in memory. No network connection or remote writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite");
const db = new PGlite();
const sqlFile = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const team = id(1), otherTeam = id(2), owner = id(11), member = id(12), foreign = id(13), inactive = id(14), band = id(15), pastor = id(16);
const ownerMember = id(21), ordinaryMember = id(22), foreignMember = id(23), inactiveMember = id(24), bandMember = id(25), pastorMember = id(26);
const songA = id(31), songB = id(32), foreignSong = id(33), template = id(41), foreignTemplate = id(42);
const eventDetails = { name: "Sunday", type: "service", event_date: "2027-01-31", starts_at: "09:00", ends_at: "11:00", rehearsal_date: "2027-01-30", rehearsal_time: "18:00", rehearsal_end_time: "19:00", recurrence_rule: "none", location: "Sanctuary" };
const setlistDetails = { name: "Songs", event_type: "service", setlist_date: "2027-01-31", call_time: "08:00", rehearsal_time: "08:30", service_times: ["09:00"], notes: "Plan", location: "Sanctuary" };
const assignments = [{ team_member_id: ownerMember, assignment: "Worship Leader" }, { team_member_id: ordinaryMember, assignment: "Main Keys" }];
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    grant usage on schema public, auth, private to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key);`);
  const baseline = sqlFile("20260630010000_anointed_worship_mvp.sql");
  // Extract actual repository table definitions and authorization functions.
  for (const name of ["team_role", "member_status", "event_type", "song_edit_status", "attendance_status"]) {
    const start = baseline.indexOf(`create type public.${name} `); await db.exec(baseline.slice(start, baseline.indexOf(";", start) + 1));
  }
  for (const name of ["profiles", "teams", "team_members", "events", "event_assignments", "songs", "setlists", "setlist_songs", "attendance", "song_edit_requests", "announcements", "notifications", "dance_notes"]) {
    const start = baseline.indexOf(`create table public.${name} (`); await db.exec(baseline.slice(start, baseline.indexOf("\n);", start) + 4));
  }
  for (const name of ["is_approved_member", "has_team_role"]) {
    const start = baseline.indexOf(`create or replace function private.${name}(`); await db.exec(baseline.slice(start, baseline.indexOf("$$;", start) + 3));
  }
  for (const [file, name] of [["20260702030000_service_templates_conflicts_setlist_history.sql", "setlist_change_log"], ["20260724000000_feature_24_32_39.sql", "setlist_templates"], ["20260724000000_feature_24_32_39.sql", "custom_roles"]]) {
    const source = sqlFile(file), start = source.indexOf(`create table if not exists public.${name} (`); await db.exec(source.slice(start, source.indexOf("\n);", start) + 4));
  }
  await db.exec(`alter table public.team_members add column custom_role_id uuid references public.custom_roles(id);
    alter type public.event_type add value 'service_rehearsal';
    alter table public.events add column approval_status text not null default 'approved', add column rehearsal_date date, add column rehearsal_end_time time,
      add column recurrence_rule text, add column recurrence_parent_id uuid references public.events(id), add column deleted_at timestamptz;
    alter table public.songs alter column bpm drop not null; alter table public.songs add column deleted_at timestamptz;
    alter table public.setlists add column deleted_at timestamptz;
    alter table public.setlist_songs add column arrangement text, add column band_notes text, add column slide_settings jsonb, add column youtube_url text;
    create table public.test_annotations(slot_id uuid references public.setlist_songs(id) on delete cascade, note text);
    insert into auth.users select unnest(array['${owner}','${member}','${foreign}','${inactive}','${band}','${pastor}']::uuid[]);
    insert into public.profiles(id) select id from auth.users;
    insert into public.teams(id,name,code,owner_id) values ('${team}','Team A','AA-12345','${owner}'),('${otherTeam}','Team B','BB-12345','${foreign}');
    insert into public.team_members(id,team_id,profile_id,role,status) values
      ('${ownerMember}','${team}','${owner}','owner','active'), ('${ordinaryMember}','${team}','${member}','member','active'),
      ('${foreignMember}','${otherTeam}','${foreign}','owner','active'), ('${inactiveMember}','${team}','${inactive}','member','inactive'),
      ('${bandMember}','${team}','${band}','band_leader','active'), ('${pastorMember}','${team}','${pastor}','pastor','active');
    insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by) values
      ('${songA}','${team}','A','Artist','D','lyrics','${owner}'),('${songB}','${team}','B','Artist','G','lyrics','${owner}'),('${foreignSong}','${otherTeam}','X','Artist','C','lyrics','${foreign}');
    insert into public.setlist_templates(id,team_id,name,slots,created_by) values
      ('${template}','${team}','Template','[{"order":2,"label":"Opening","tag":"Praise"},{"order":4,"label":"Response","tag":"Worship"}]','${owner}'),
      ('${foreignTemplate}','${otherTeam}','Foreign','[]','${foreign}');`);


  await db.exec(`alter table public.songs add column image_url text,add column album text,add column seed_source text,add column sync_revision bigint not null default 0;
    alter table public.events add column sync_revision bigint not null default 0;
    alter table public.setlists add column sync_revision bigint not null default 0;
    alter table public.setlist_songs add column deleted_at timestamptz,add column updated_at timestamptz not null default now(),add column sync_revision bigint not null default 0;
    alter table public.announcements add column target_role public.team_role,add column target_profile_id uuid,add column priority text default 'normal',add column is_pinned boolean default false;
    alter table public.notifications add column target_path text,add column acknowledged_at timestamptz,add column priority text default 'normal',add column event_id uuid,add column scheduled_for timestamptz default now(),add column recurrence_rule text default 'none',add column recurrence_index int default 0,add column recurrence_total int default 1,add column notice_group_id uuid,add column created_by uuid,add column target_role public.team_role,add column target_profile_id uuid,add column target_label text;
    alter table public.dance_notes add column song_title text,add column song_artist text,add column song_version text,add column video_url text;
  `);
  const sync=sqlFile('20260726000000_desktop_offline_sync_foundation.sql'),at=sync.indexOf('create table if not exists public.worship_sync_changes (');
  await db.exec(sync.slice(at,sync.indexOf('\n);',at)+4));
  const receiptsAt=sync.indexOf('create table if not exists public.worship_sync_receipts (');
  await db.exec(sync.slice(receiptsAt,sync.indexOf('\n);',receiptsAt)+4));
  await db.exec('alter table public.worship_sync_changes enable row level security;alter table public.worship_sync_receipts enable row level security;grant select,insert on public.worship_sync_receipts to authenticated;grant select on public.worship_sync_changes to authenticated;');
  await db.exec(sqlFile('20260726000001_offline_sync_rls_policies.sql'));
  await db.exec(`insert into public.song_edit_requests(id,song_id,proposed_title,submitted_by) values('${id(90)}','${songA}','Legacy draft','${member}');`);
  await db.exec(sqlFile('20261006010000_atomic_event_setlist_workflows.sql'));
  await db.exec(sqlFile('20261006020000_shared_edit_requests_song_ownership.sql'));
  const legacy=(await db.query('select status,changes,legacy_song_request_id from public.shared_edit_requests where legacy_song_request_id=$1',[id(90)])).rows[0];
  assert.equal(legacy.status,'needs_revision');assert.equal(legacy.changes.title,'Legacy draft');
  assert.equal((await db.query('select status from public.song_edit_requests where id=$1',[id(90)])).rows[0].status,'pending','Legacy requests remain unchanged');
  async function asUser(user,query,params=[],role='authenticated') {
    await db.exec(`reset role;set request.jwt.claim.sub='${user??''}';set role ${role};`);
    try{return await db.query(query,params);}finally{await db.exec('reset role;');}
  }
  const denied=promise=>assert.rejects(promise,error=>error.code==='42501');
  await db.exec(`alter table public.songs enable row level security;grant select,insert,update on public.songs to authenticated;
    create policy fixture_song_reads on public.songs for select to authenticated using(private.is_approved_member(team_id));
    grant select on public.team_members,public.custom_roles to authenticated;
  `);
  const submit=(user,type,target,revision,changes,nonce=id(101),reason='Please revise')=>asUser(user,'select public.submit_shared_edit_request($1,$2,$3,$4::jsonb,$5,$6) id',[type,target,revision,JSON.stringify(changes),reason,nonce]);
  const review=(user,request,decision='approved',reason='')=>asUser(user,'select public.review_shared_edit_request($1,$2,$3) status',[request,decision,reason]);
  for(const user of [null,foreign,inactive]) await denied(submit(user,'song',songA,0,{title:'Proposal'}));
  await denied(asUser(member,'insert into public.song_edit_requests(song_id,submitted_by,status) values($1,$2,$3)',[songA,member,'approved']));
  await denied(asUser(owner,'update public.song_edit_requests set status=$1 where id=$2',['approved',id(90)]));
  await denied(asUser(null,'select public.submit_shared_edit_request($1,$2,0,$3::jsonb,$4,$5)',['song',songA,'{"title":"x"}','Reason',id(102)],'anon'));
  const request=(await submit(member,'song',songA,0,{title:'Proposal'})).rows[0].id;
  assert.equal((await db.query('select title from public.songs where id=$1',[songA])).rows[0].title,'A');
  assert.equal((await submit(member,'song',songA,0,{title:'Proposal'})).rows[0].id,request);
  await assert.rejects(submit(member,'song',songA,0,{title:'Different'}),error=>error.code==='22023');
  for(const user of [member,band,pastor,foreign,inactive,null]) await denied(review(user,request));
  assert.equal((await review(owner,request)).rows[0].status,'approved');
  assert.equal((await db.query('select title,sync_revision from public.songs where id=$1',[songA])).rows[0].title,'Proposal');

  await db.exec(sqlFile('20261006040000_shared_preparation_service_order.sql'));
  await db.exec(sqlFile('20261006050000_shared_edit_workflow_adapters.sql'));
  await db.exec(sqlFile('20261006080000_setlist_aggregate_revisions.sql'));
  await db.exec(sqlFile('20261006090000_sync_snapshot_visibility.sql'));
  const createdSong=id(110);
  await asUser(member,'insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by) values($1,$2,$3,$4,$5,$6,$7)',[createdSong,team,'Member song','Artist','C','Lyrics',member]);
  await asUser(member,'update public.songs set title=$1 where id=$2',['Creator edit',createdSong]);
  assert.equal((await db.query('select sync_revision from public.songs where id=$1',[createdSong])).rows[0].sync_revision,2);
  await denied(asUser(member,'insert into public.songs(team_id,title,artist,original_key,lyrics_chords,created_by) values($1,$2,$3,$4,$5,$6)',[team,'Forgery','A','C','Lyrics',owner]));
  for(const field of ['created_by','team_id','status','seed_source']) {
    const value=field==='created_by'?member:field==='team_id'?otherTeam:field==='status'?'pending':'starter-library-v1';
    await denied(asUser(owner,`update public.songs set ${field}=$1 where id=$2`,[value,songA]));
  }
  const ignored=await asUser(member,'update public.songs set title=$1 where id=$2 returning id',['Forbidden',songA]);
  assert.equal(ignored.rows.length,0,'Non-creator raw updates are filtered by RLS');
  await db.exec(`update public.team_members set role='worship_leader' where id='${bandMember}'`);
  await denied(asUser(band,'update public.songs set title=$1 where id=$2',['Leader forbidden',songA]));
  await asUser(band,'update public.songs set deleted_at=now() where id=$1',[songB]);
  await asUser(band,'update public.songs set deleted_at=null where id=$1',[songB]);
  await denied(asUser(member,'update public.songs set deleted_at=now() where id=$1',[createdSong]));
  await assert.rejects(asUser(owner,'update public.songs set sync_revision=999 where id=$1',[songA]),error=>error.code==='22023');
  await denied(asUser(member,'update public.shared_edit_requests set status=$1 where id=$2',['approved',request]));
  await denied(asUser(null,'select * from public.shared_edit_requests',[],'anon'));
  assert.equal((await asUser(foreign,'select * from public.shared_edit_requests')).rows.length,0);
  assert.equal((await asUser(inactive,'select * from public.shared_edit_requests')).rows.length,0);
  const self=(await submit(owner,'song',songA,1,{title:'Self proposal'},id(111))).rows[0].id;
  await denied(review(owner,self));
  const stale=(await submit(member,'song',songA,1,{title:'Stale proposal'},id(112))).rows[0].id;
  await asUser(owner,'update public.songs set title=$1 where id=$2',['New version',songA]);
  assert.equal((await review(owner,stale)).rows[0].status,'needs_revision');
  assert.equal((await db.query('select changes from public.shared_edit_requests where id=$1',[stale])).rows[0].changes.title,'Stale proposal');
  const rejected=(await submit(member,'song',songA,2,{title:'Rejected'},id(113))).rows[0].id;
  await assert.rejects(review(owner,rejected,'rejected',''),error=>error.code==='22023');
  await review(owner,rejected,'rejected','Please adjust the lyrics');
  assert.equal((await db.query('select review_reason from public.shared_edit_requests where id=$1',[rejected])).rows[0].review_reason,'Please adjust the lyrics');
  const withdrawn=(await submit(member,'song',songA,2,{title:'Withdraw'},id(114))).rows[0].id;
  await denied(asUser(owner,'select public.withdraw_shared_edit_request($1)',[withdrawn]));
  await asUser(member,'select public.withdraw_shared_edit_request($1)',[withdrawn]);
  await assert.rejects(review(owner,withdrawn),error=>error.code==='22023');
  const rollback=(await submit(member,'song',songA,2,{title:'Fail apply'},id(115))).rows[0].id;
  await db.exec(`create function public.fail_song_edit() returns trigger language plpgsql as $$ begin if new.title='Fail apply' then raise exception 'Injected update failure';end if;return new;end $$;
    create trigger fail_song_edit before update on public.songs for each row execute function public.fail_song_edit();`);
  const notifications=(await db.query('select count(*)::int n from public.notifications')).rows[0].n;
  await assert.rejects(review(owner,rollback));
  assert.equal((await db.query('select status from public.shared_edit_requests where id=$1',[rollback])).rows[0].status,'pending');
  assert.equal((await db.query('select title from public.songs where id=$1',[songA])).rows[0].title,'New version');
  assert.equal((await db.query('select count(*)::int n from public.notifications')).rows[0].n,notifications);
  await db.exec('drop trigger fail_song_edit on public.songs;');
  for(const changes of [{created_by:member},{tags:[42]},{time_signature:'xx'},{status:'approved'},{}]) await assert.rejects(submit(member,'song',songA,2,changes,id(116)),error=>error.code==='22023');
  const eventId=(await asUser(owner,'select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) id',[team,JSON.stringify(eventDetails),JSON.stringify(assignments)])).rows[0].id;
  const setlistId=(await asUser(owner,'select public.save_setlist_workspace($1,null,$2,$3::jsonb,$4::uuid[],null) id',[team,eventId,JSON.stringify({...setlistDetails,update_event:false}),[songA,songB]])).rows[0].id;
  const slot=(await db.query('select id,sync_revision from public.setlist_songs where setlist_id=$1 order by song_order limit 1',[setlistId])).rows[0];
  const keys=['Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions','Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs','Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues'];
  const tasks=keys.map(key=>({key,assignee_member_id:ordinaryMember}));
  const plan=(await submit(member,'rehearsal_plan',setlistId,0,{allocations:[{slot_id:slot.id,minutes:8,focus:'Intro'}],tasks},id(120))).rows[0].id;
  assert.equal((await asUser(member,'select * from public.shared_edit_requests where id=$1',[plan])).rows.length,1,'Workflow requests remain visible after adapter policy rebinding');
  await review(owner,plan);
  assert.equal((await db.query('select revision from public.rehearsal_plans where setlist_id=$1',[setlistId])).rows[0].revision,1);
  const invalidPlan=(await submit(member,'rehearsal_plan',setlistId,1,{tasks:tasks.map(t=>({...t,assignee_member_id:foreignMember}))},id(121))).rows[0].id;
  await assert.rejects(review(owner,invalidPlan),error=>error.code==='22023');
  assert.equal((await db.query('select status from public.shared_edit_requests where id=$1',[invalidPlan])).rows[0].status,'pending');
  const order=(await submit(member,'service_order',eventId,0,{entries:[{id:id(130),kind:'song',title:'Opening',slot_id:slot.id,duration_seconds:300,responsible_member_id:ordinaryMember,cue:'Intro'}],required_roles:['Main Keys']},id(122))).rows[0].id;
  await review(owner,order);
  assert.equal((await db.query('select revision from public.service_orders where event_id=$1',[eventId])).rows[0].revision,1);
  const srev=(await db.query('select sync_revision from public.setlists where id=$1',[setlistId])).rows[0].sync_revision;
  const erev=(await db.query('select sync_revision from public.events where id=$1',[eventId])).rows[0].sync_revision;
  const setlistRequest=(await submit(member,'setlist',setlistId,srev,{notes:'Approved plan'},id(123))).rows[0].id;
  await review(owner,setlistRequest);
  assert.equal((await db.query('select sync_revision from public.events where id=$1',[eventId])).rows[0].sync_revision,erev,'Setlist approval does not rewrite associated event');
  assert.equal((await db.query('select id from public.setlist_songs where setlist_id=$1 order by song_order limit 1',[setlistId])).rows[0].id,slot.id,'Setlist approval retains slot identity');
  const newSlotRevision=(await db.query('select sync_revision from public.setlist_songs where id=$1',[slot.id])).rows[0].sync_revision;
  const slotRequest=(await submit(member,'song_slot',slot.id,newSlotRevision,{notes:'Watch ending'},id(124))).rows[0].id;await review(owner,slotRequest);
  assert.equal((await db.query('select notes from public.setlist_songs where id=$1',[slot.id])).rows[0].notes,'Watch ending');

  const eventRevision=(await db.query('select sync_revision from public.events where id=$1',[eventId])).rows[0].sync_revision;
  const eventRequest=(await submit(member,'event',eventId,eventRevision,{name:'Approved event edit',assignments:[{team_member_id:ordinaryMember,assignment:'Drums'}]},id(125))).rows[0].id;
  await review(owner,eventRequest);
  assert.equal((await db.query('select name from public.events where id=$1',[eventId])).rows[0].name,'Approved event edit');
  assert.equal((await db.query('select assignment from public.event_assignments where event_id=$1',[eventId])).rows[0].assignment,'Drums');
  const assignmentStaleRevision=(await db.query('select sync_revision from public.events where id=$1',[eventId])).rows[0].sync_revision;
  const assignmentStale=(await submit(member,'event',eventId,assignmentStaleRevision,{name:'Should stay stale'},id(126))).rows[0].id;
  await db.exec(`set request.jwt.claim.sub='';update public.event_assignments set assignment='Main Keys' where event_id='${eventId}';`);
  assert.equal((await review(owner,assignmentStale)).rows[0].status,'needs_revision','Roster edits invalidate event proposal revision');
  const removedSlot=(await db.query('select id from public.setlist_songs where setlist_id=$1 and id<>$2',[setlistId,slot.id])).rows[0].id;
  await db.exec(`set request.jwt.claim.sub='';delete from public.setlist_songs where id='${removedSlot}';`);
  const tombstone=(await db.query("select operation,payload from public.worship_sync_changes where entity_id=$1 order by cursor desc limit 1",[removedSlot])).rows[0];
  assert.equal(tombstone.operation,'delete','Physical slot removal records a sync tombstone');
  assert(tombstone.payload.deleted_at,'Tombstone payload remains deleted when imported by existing desktop cache');
  const a=id(140),r=id(141),chart=id(142);
  await db.exec(`set request.jwt.claim.sub='';
    update public.team_members set role='band_leader' where id='${bandMember}';
    insert into public.announcements(id,team_id,title,body,category,created_by,target_profile_id) values('${a}','${team}','Private notice','Private body','General','${owner}','${member}');
    insert into public.notifications(team_id,profile_id,title,body,created_by,notice_group_id) values('${team}','${member}','Reminder','Body','${owner}','${r}'),('${team}','${owner}','Reminder','Body','${owner}','${r}');
    insert into public.dance_notes(id,team_id,title,choreography_notes,created_by) values('${chart}','${team}','Dance','Step left','${owner}');`);
  await denied(submit(band,'announcement',a,0,{title:'Forbidden content'},id(143)));
  const notice=(await submit(member,'announcement',a,0,{body:'Proposed private body'},id(144))).rows[0].id;
  assert.equal((await asUser(pastor,'select * from public.shared_edit_requests where id=$1',[notice])).rows.length,1,'Permission-eligible reviewer outside audience can inspect the request');
  assert.equal((await asUser(band,'select * from public.shared_edit_requests where id=$1',[notice])).rows.length,0,'Unrelated audience outsider cannot inspect the request');
  for(const user of [foreign,inactive,null]) await denied(asUser(user,'select public.get_shared_edit_target($1,$2)',['announcement',a]));
  await review(pastor,notice);
  const reminder=(await submit(member,'reminder',r,0,{body:'Updated reminder'},id(145))).rows[0].id;
  await denied(submit(pastor,'reminder',r,0,{body:'Forbidden'},id(146)));
  await review(owner,reminder);
  assert.equal((await db.query('select count(*)::int n from public.notifications where notice_group_id=$1 and body=$2',[r,'Updated reminder'])).rows[0].n,2,'Reminder group content changes transactionally');
  const targetedReminder=id(149),reviewerRole=id(150);
  await db.exec(`set request.jwt.claim.sub='';
    insert into public.notifications(team_id,profile_id,title,body,created_by,notice_group_id) values('${team}','${member}','Recipient only','Body','${owner}','${targetedReminder}');
    insert into public.custom_roles(id,team_id,name,permissions) values('${reviewerRole}','${team}','Reminder reviewers',array['members.manage']);
    update public.team_members set custom_role_id='${reviewerRole}' where id='${pastorMember}';`);
  const outsideReminder=(await submit(member,'reminder',targetedReminder,0,{body:'Reviewed outside audience'},id(156))).rows[0].id;
  assert.equal((await asUser(pastor,'select * from public.shared_edit_requests where id=$1',[outsideReminder])).rows.length,1);
  assert.equal((await asUser(band,'select * from public.shared_edit_requests where id=$1',[outsideReminder])).rows.length,0);
  for(const user of [foreign,inactive,null]) await denied(asUser(user,'select public.get_shared_edit_target($1,$2)',['reminder',targetedReminder]));
  await review(pastor,outsideReminder);
  assert.equal((await db.query('select body from public.notifications where notice_group_id=$1',[targetedReminder])).rows[0].body,'Reviewed outside audience');
  await db.exec(`set request.jwt.claim.sub='';update public.team_members set custom_role_id=null where id='${pastorMember}';`);
  const choreography=(await submit(member,'choreography',chart,0,{choreography_notes:'Step right'},id(147))).rows[0].id;
  await review(owner,choreography);
  assert.equal((await db.query('select choreography_notes from public.dance_notes where id=$1',[chart])).rows[0].choreography_notes,'Step right');

  const snapshot=(await asUser(member,'select public.get_shared_edit_target($1,$2) snapshot',['song',songA])).rows[0].snapshot;
  assert.equal(snapshot.team_id,team);assert.equal(snapshot.revision,2);assert.equal(snapshot.values.title,'New version');
  assert.equal(snapshot.values.created_by,undefined,'Snapshot exposes only editable fields');
  for(const user of [null,foreign,inactive]) await denied(asUser(user,'select public.get_shared_edit_target($1,$2)',['song',songA]));
  await denied(asUser(null,'select public.get_shared_edit_target($1,$2)',['song',songA],'anon'));
  await db.exec(`set request.jwt.claim.sub='';insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status) values('${id(161)}','${team}','Unpublished','A','C','Private draft','${owner}','pending');`);
  await denied(asUser(member,'select public.get_shared_edit_target($1,$2)',['song',id(161)]));
  await denied(asUser(band,'select public.get_shared_edit_target($1,$2)',['announcement',a]));
  assert.equal((await asUser(member,'select public.get_shared_edit_target($1,$2) snapshot',['rehearsal_plan',setlistId])).rows[0].snapshot.revision,1);
  await db.exec(`grant select,update on public.notifications to authenticated;alter table public.notifications enable row level security;
    create policy fixture_notification_reads on public.notifications for select to authenticated using(profile_id=auth.uid() or private.has_team_role(team_id,array['owner','admin']::public.team_role[]));
    create policy fixture_notification_receipts on public.notifications for update to authenticated using(profile_id=auth.uid()) with check(profile_id=auth.uid());
    grant select,update on public.dance_notes to authenticated;alter table public.dance_notes enable row level security;
    create policy fixture_chart_reads on public.dance_notes for select to authenticated using(private.is_approved_member(team_id));
    create policy fixture_chart_updates on public.dance_notes for update to authenticated using(private.is_approved_member(team_id)) with check(private.is_approved_member(team_id));`);
  const beforeReceipt=(await asUser(member,'select public.get_shared_edit_target($1,$2) snapshot',['reminder',r])).rows[0].snapshot.revision;
  await asUser(member,'update public.notifications set read_at=now(),acknowledged_at=now() where notice_group_id=$1 and profile_id=$2',[r,member]);
  assert.equal((await asUser(member,'select public.get_shared_edit_target($1,$2) snapshot',['reminder',r])).rows[0].snapshot.revision,beforeReceipt,'Personal receipts do not stale shared reminder proposals');
  await denied(asUser(member,'update public.notifications set title=$1 where notice_group_id=$2 and profile_id=$3',['Forbidden',r,member]));
  await denied(asUser(member,'update public.dance_notes set choreography_notes=$1 where id=$2',['Bypass',chart]));
  await db.exec(`set request.jwt.claim.sub='';insert into public.notifications(team_id,profile_id,title,notice_group_id) values('${otherTeam}','${foreign}','Collision','${r}');`);
  await denied(asUser(owner,'select public.get_shared_edit_target($1,$2)',['reminder',r]));
  await denied(submit(member,'reminder',r,beforeReceipt,{title:'Collision attack'},id(148)));
  await db.exec(`delete from public.notifications where team_id='${otherTeam}' and notice_group_id='${r}';
    insert into public.custom_roles(id,team_id,name,permissions) values('${id(151)}','${team}','Scoped reviewers',array['dance_notes.review','songs.review']);
    update public.team_members set custom_role_id='${id(151)}' where id='${ordinaryMember}';`);
  const customChart=(await submit(owner,'choreography',chart,1,{title:'Delegated chart'},id(152))).rows[0].id;
  await review(member,customChart);
  const customSong=(await submit(owner,'song',songA,2,{title:'Owner proposal'},id(153))).rows[0].id;
  await denied(review(member,customSong));
  const desktopPayload={id:createdSong,teamId:team,title:'Desktop creator update',artist:'Artist',originalKey:'C',lyricsChords:'Lyrics',timeSignature:'4/4',bpm:null};
  const beforeLogs=(await db.query('select count(*)::int n from public.worship_sync_changes where entity_id=$1',[createdSong])).rows[0].n;
  const synced=await asUser(member,'select public.apply_worship_mutation($1,$2,$3,$4::jsonb,$5) result',['device',id(154),'song.update',JSON.stringify(desktopPayload),2]);
  assert.equal(synced.rows[0].result.status,'applied');
  assert.equal((await db.query('select count(*)::int n from public.worship_sync_changes where entity_id=$1',[createdSong])).rows[0].n,beforeLogs+1,'Sync RPC emits exactly one row change');
  await asUser(member,'select public.apply_worship_mutation($1,$2,$3,$4::jsonb,$5)',['device',id(154),'song.update',JSON.stringify(desktopPayload),2]);
  assert.equal((await db.query('select count(*)::int n from public.worship_sync_changes where entity_id=$1',[createdSong])).rows[0].n,beforeLogs+1,'Idempotent sync receipt does not reapply');
  await denied(asUser(band,'select public.apply_worship_mutation($1,$2,$3,$4::jsonb,$5)',['device',id(155),'song.update',JSON.stringify({...desktopPayload,id:songA}),2]));
  // Child edits invalidate proposals based on the entire setlist, including raw writes.
  const aggregateRevision=(await db.query('select sync_revision from public.setlists where id=$1',[setlistId])).rows[0].sync_revision;
  const aggregateRequest=(await submit(member,'setlist',setlistId,aggregateRevision,{notes:'Stale aggregate'},id(170))).rows[0].id;
  await db.exec(`set request.jwt.claim.sub='';update public.setlist_songs set band_notes='Latest child edit' where id='${slot.id}';`);
  assert.equal((await review(owner,aggregateRequest)).rows[0].status,'needs_revision');
  assert.equal((await db.query('select band_notes from public.setlist_songs where id=$1',[slot.id])).rows[0].band_notes,'Latest child edit');
  await assert.rejects(asUser(owner,'select public.save_setlist_workspace($1,$2,null,$3::jsonb,$4::uuid[],null,$5)',[team,setlistId,JSON.stringify({...setlistDetails,update_event:false}),[songA],aggregateRevision]),e=>e.code==='40001');
  const currentEventRevision=(await db.query('select sync_revision from public.events where id=$1',[eventId])).rows[0].sync_revision;
  await assert.rejects(asUser(owner,'select public.save_event_workspace($1,$2,$3::jsonb,$4::jsonb,null,$5)',[team,eventId,JSON.stringify(eventDetails),JSON.stringify(assignments),currentEventRevision-1]),e=>e.code==='40001');
  const currentSetlistRevision=(await db.query('select sync_revision from public.setlists where id=$1',[setlistId])).rows[0].sync_revision;
  await assert.rejects(asUser(owner,'select public.save_setlist_workspace($1,$2,null,$3::jsonb,$4::uuid[],null,$5)',[team,setlistId,JSON.stringify({...setlistDetails,event_revision:currentEventRevision-1}),[songA],currentSetlistRevision]),e=>e.code==='40001');
  assert.equal((await db.query('select sync_revision from public.setlists where id=$1',[setlistId])).rows[0].sync_revision,currentSetlistRevision,'Linked event conflicts roll back the entire setlist edit');
  const mutationList=(await asUser(owner,'select public.save_setlist_workspace($1,null,null,$2::jsonb,$3::uuid[],null) id',[team,JSON.stringify({...setlistDetails,update_event:false}),[]])).rows[0].id;
  const mutate=(user,slot,operation,values={})=>asUser(user,'select public.mutate_setlist_slot($1,$2,$3,$4::jsonb)',[mutationList,slot,operation,JSON.stringify(values)]);
  await denied(mutate(member,null,'add',{song_id:songA}));
  await mutate(owner,null,'add',{song_id:songA,assigned_key:'D'});await mutate(owner,null,'add',{song_id:songB,assigned_key:'G'});
  const mutationSlots=(await db.query('select id,song_id from public.setlist_songs where setlist_id=$1 order by song_order',[mutationList])).rows;
  await mutate(owner,mutationSlots[1].id,'move',{song_order:1});
  assert.deepEqual((await db.query('select id from public.setlist_songs where setlist_id=$1 order by song_order',[mutationList])).rows.map(r=>r.id),[mutationSlots[1].id,mutationSlots[0].id]);
  await mutate(owner,mutationSlots[1].id,'update',{band_notes:'Keep this note'});
  await assert.rejects(mutate(owner,mutationSlots[1].id,'update',{lead_member_id:foreignMember}),e=>e.code==='22023');
  await mutate(owner,mutationSlots[0].id,'remove');
  assert.deepEqual((await db.query('select id,song_order,band_notes from public.setlist_songs where setlist_id=$1',[mutationList])).rows,[{id:mutationSlots[1].id,song_order:1,band_notes:'Keep this note'}]);
  await assert.rejects(mutate(owner,null,'add',{song_id:foreignSong}),e=>e.code==='22023');
  const privateEvent=(await asUser(member,'select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) id',[team,JSON.stringify({...eventDetails,name:'Private pending event'}),JSON.stringify(assignments)])).rows[0].id;
  assert.equal((await asUser(band,'select * from public.worship_sync_changes where entity_id=$1',[privateEvent])).rows.length,0,'Unrelated members cannot read pending event snapshots');
  assert((await asUser(member,'select * from public.worship_sync_changes where entity_id=$1',[privateEvent])).rows.length>0,'Requester can read own pending event');
  await asUser(owner,'select public.review_event_request($1,$2)',[privateEvent,'approved']);
  const publicSnapshots=(await asUser(band,'select payload from public.worship_sync_changes where entity_id=$1',[privateEvent])).rows;
  assert(publicSnapshots.length>0);assert(publicSnapshots.every(row=>row.payload.approval_status==='approved'),'Approval does not reveal historical pending drafts');
  assert.equal((await asUser(member,'select * from public.worship_sync_changes where entity_id=$1',[id(161)])).rows.length,0,'Unpublished song history remains private');
  for(const user of [foreign,inactive,null]) assert.equal((await asUser(user,'select * from public.worship_sync_changes where team_id=$1',[team])).rows.length,0,'Sync history requires active same-team identity');
  await db.exec(`set request.jwt.claim.sub='';delete from public.events where id='${privateEvent}';`);
  const deletedSnapshot=(await db.query('select payload from public.worship_sync_changes where entity_id=$1 and operation=$2 order by cursor desc limit 1',[privateEvent,'delete'])).rows[0].payload;
  assert.equal(deletedSnapshot.name,undefined,'Deletion snapshots contain no private event text');
  console.log('PASS real PostgreSQL core/workflow requests, creation/creator raw writes, owner-only song approval, protected identity, unchanged deletion scope, tenant/anon/inactive denial, nonce replay, stale preservation, rejection, withdrawal, injected rollback, targeted audiences, stable slots and atomic reminder/choreography edits. Scoped baseline RLS fixture; native concurrent connections and deployed schema remain unverified.');

} catch(error) {console.error(error.stack,error.code,error.where??'',error.position,error.internalQuery??'',error.query?.slice(Math.max(0,Number(error.position)-150),Number(error.position)+150));process.exitCode=1;} finally {await db.close();}
