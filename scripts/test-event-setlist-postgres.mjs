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
  for (const name of ["profiles", "teams", "team_members", "events", "event_assignments", "songs", "setlists", "setlist_songs", "attendance"]) {
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
  await db.exec(`alter table public.events add column sync_revision bigint not null default 0;alter table public.setlists add column sync_revision bigint not null default 0;alter table public.setlist_songs add column sync_revision bigint not null default 0,add column deleted_at timestamptz,add column updated_at timestamptz default now();`);
  const revisionSource=sqlFile("20261006020000_shared_edit_requests_song_ownership.sql");
  const revisionStart=revisionSource.indexOf("create function private.bump_workspace_sync_revision()");
  await db.exec(revisionSource.slice(revisionStart,revisionSource.indexOf("$$;",revisionStart)+3));
  for(const table of ["events","setlists","setlist_songs"]) await db.exec(`create trigger fixture_revision before insert or update on public.${table} for each row execute function private.bump_workspace_sync_revision();`);
  await db.exec(sqlFile("20261006010000_atomic_event_setlist_workflows.sql"));
  async function asUser(user, query, params = [], role = "authenticated") {
    await db.exec(`reset role; set request.jwt.claim.sub = '${user || ""}'; set role ${role};`);
    try { return await db.query(query, params); } finally { await db.exec("reset role;"); }
  }
  const eventSql = "select public.save_event_workspace($1,$2,$3::jsonb,$4::jsonb,$5) id";
  const saveEvent = async (user, details = eventDetails, roles = assignments, eventId = null, linked = null, selectedTeam = team) => asUser(user,eventSql.replace("$5)","$5,$6)"),[selectedTeam,eventId,JSON.stringify(details),JSON.stringify(roles),linked,eventId ? (await db.query("select sync_revision from public.events where id=$1",[eventId])).rows[0]?.sync_revision ?? 0 : null]);
  const setlistSql = "select public.save_setlist_workspace($1,$2,$3,$4::jsonb,$5::uuid[],$6) id";
  const saveSetlist = async (user, songs = [songA,songB], setlistId = null, templateId = null, eventId = null, details = setlistDetails) => asUser(user,setlistSql.replace("$6)","$6,$7)"),[team,setlistId,eventId,JSON.stringify({...details,event_revision:eventId ? (await db.query('select sync_revision from public.events where id=$1',[eventId])).rows[0]?.sync_revision : setlistId ? (await db.query('select e.sync_revision from public.events e join public.setlists s on s.event_id=e.id where s.id=$1',[setlistId])).rows[0]?.sync_revision : null}),songs,templateId,setlistId ? (await db.query("select sync_revision from public.setlists where id=$1",[setlistId])).rows[0]?.sync_revision ?? 0 : null]);
  const review = (user,eventId,decision = "approved") => asUser(user,"select public.review_event_request($1,$2)",[eventId,decision]);
  const expectDenied = (promise) => assert.rejects(promise, (error) => error.code === "42501");
  await expectDenied(asUser(null,eventSql,[team,null,JSON.stringify(eventDetails),"[]",null],"anon"));
  await expectDenied(saveEvent(null)); await expectDenied(saveEvent(foreign)); await expectDenied(saveEvent(inactive));
  for (const badMember of [foreignMember,inactiveMember,id(99)]) await assert.rejects(saveEvent(owner,eventDetails,[{team_member_id:badMember,assignment:"Main Keys"}]),(error)=>error.code === "22023");
  await assert.rejects(saveEvent(owner,eventDetails,[assignments[0],assignments[0]]),(error)=>error.code === "22023");
  assert.equal((await db.query("select count(*)::int n from public.events")).rows[0].n,0,"Invalid assignments create no events");
  const pending = (await saveEvent(member)).rows[0].id;
  assert.equal((await db.query("select approval_status, jsonb_array_length(requested_assignments) n from public.events where id=$1",[pending])).rows[0].approval_status,"pending");
  assert.equal((await db.query("select * from public.event_assignments where event_id=$1",[pending])).rows.length,0,"Proposals do not become live assignments");
  await expectDenied(review(member,pending)); await expectDenied(review(foreign,pending)); await expectDenied(saveEvent(member,eventDetails,assignments,pending)); await expectDenied(saveEvent(pastor,eventDetails,assignments,pending));
  await db.exec(`update public.team_members set status='inactive' where id='${ordinaryMember}'`);
  await assert.rejects(review(owner,pending),(error)=>error.code === "22023");
  assert.equal((await db.query("select approval_status from public.events where id=$1",[pending])).rows[0].approval_status,"pending","Failed approval rolls back status");
  await db.exec(`update public.team_members set status='active' where id='${ordinaryMember}'`); await review(owner,pending);
  assert.equal((await db.query("select * from public.event_assignments where event_id=$1",[pending])).rows.length,2,"Approval activates submitted assignments atomically");
  await assert.rejects(review(owner,pending),(error)=>error.code === "22023");
  const approved = (await saveEvent(owner)).rows[0].id;
  const retained = (await db.query("select id from public.event_assignments where event_id=$1 and team_member_id=$2",[approved,ownerMember])).rows[0].id;
  await saveEvent(owner,{...eventDetails,name:"Edited"},[assignments[0],{team_member_id:ordinaryMember,assignment:"Drums"}],approved);
  assert.equal((await db.query("select id from public.event_assignments where event_id=$1 and team_member_id=$2",[approved,ownerMember])).rows[0].id,retained,"Unchanged role keeps identity");
  assert.equal((await db.query("select assignment from public.event_assignments where event_id=$1 and team_member_id=$2",[approved,ordinaryMember])).rows[0].assignment,"Drums");
  await db.exec(`create function public.test_fail_assignment() returns trigger language plpgsql as $$ begin if new.assignment='Media' then raise exception 'Injected failure'; end if; return new; end $$;
    create trigger test_fail_assignment before insert on public.event_assignments for each row execute function public.test_fail_assignment();`);
  await assert.rejects(saveEvent(owner,{...eventDetails,name:"Must roll back"},[{team_member_id:ownerMember,assignment:"Media"}],approved));
  assert.equal((await db.query("select name from public.events where id=$1",[approved])).rows[0].name,"Edited","Assignment failure rolls back event edit and roster deletion");
  assert.equal((await db.query("select * from public.event_assignments where event_id=$1",[approved])).rows.length,2);
  await db.exec("drop trigger test_fail_assignment on public.event_assignments;");
  const recurring = (await saveEvent(owner,{...eventDetails,recurrence_rule:"monthly"})).rows[0].id;
  const series = (await db.query("select event_date::text date,rehearsal_date::text rehearsal from public.events where id=$1 or recurrence_parent_id=$1 order by event_date",[recurring])).rows;
  assert.deepEqual(series,[{date:"2027-01-31",rehearsal:"2027-01-30"},{date:"2027-02-28",rehearsal:"2027-02-27"},{date:"2027-03-31",rehearsal:"2027-03-30"},{date:"2027-04-30",rehearsal:"2027-04-29"}],"Monthly recurrence anchors to original day and shifts rehearsal");
  await saveEvent(owner,{...eventDetails,name:"One occurrence",recurrence_rule:"weekly"},assignments,recurring);
  assert.equal((await db.query("select * from public.events where recurrence_parent_id=$1",[recurring])).rows.length,3,"Editing one occurrence never duplicates series");
  const beforeSeriesFailure = (await db.query("select count(*)::int n from public.events")).rows[0].n;
  await db.exec(`create function public.test_fail_occurrence() returns trigger language plpgsql as $$ begin if new.name='Fail series' and new.recurrence_parent_id is not null then raise exception 'Injected recurrence failure'; end if; return new; end $$;
    create trigger test_fail_occurrence before insert on public.events for each row execute function public.test_fail_occurrence();`);
  await assert.rejects(saveEvent(owner,{...eventDetails,name:"Fail series",recurrence_rule:"weekly"}));
  assert.equal((await db.query("select count(*)::int n from public.events")).rows[0].n,beforeSeriesFailure,"Child failure rolls back the entire series");
  await db.exec("drop trigger test_fail_occurrence on public.events;");
  for (const user of [member,inactive,foreign]) await expectDenied(saveSetlist(user));
  const standaloneBand = (await saveSetlist(band)).rows[0].id;
  assert.equal((await db.query("select event_id from public.setlists where id=$1",[standaloneBand])).rows[0].event_id,null,"Standalone band-leader setlists do not manufacture approved events");
  const setlist = (await saveSetlist(owner,[songA,songB,songA])).rows[0].id;
  const originalSlots = (await db.query("select * from public.setlist_songs where setlist_id=$1 order by song_order",[setlist])).rows;
  const first = originalSlots[0].id, second = originalSlots[1].id, repeated = originalSlots[2].id;
  await db.exec(`update public.setlist_songs set assigned_key='E',notes='Personal',lead_member_id='${ordinaryMember}',arrangement='Intro twice',band_notes='Quiet',slide_settings='{"font":"large"}',youtube_url='https://example.org/video' where id='${first}';
    insert into public.test_annotations values ('${first}','Keep annotation'),('${repeated}','Repeat note');`);
  await saveSetlist(owner,[songB,songA,songA],setlist);
  const savedSlots = (await db.query("select * from public.setlist_songs where setlist_id=$1 order by song_order",[setlist])).rows;
  assert.deepEqual(savedSlots.map((slot)=>slot.id),[second,first,repeated],"Reordering retains each occurrence identity");
  assert.deepEqual(savedSlots[1],{...originalSlots[0],sync_revision:savedSlots[1].sync_revision,song_order:2,assigned_key:"E",notes:"Personal",lead_member_id:ordinaryMember,arrangement:"Intro twice",band_notes:"Quiet",slide_settings:{font:"large"},youtube_url:"https://example.org/video"});
  assert.equal((await db.query("select * from public.test_annotations")).rows.length,2,"Referring annotations remain attached");
  await assert.rejects(saveSetlist(owner,[foreignSong],setlist),(error)=>error.code === "22023");
  await assert.rejects(saveSetlist(owner,[songA],null,foreignTemplate),(error)=>error.code === "22023");
  await db.exec(`create function public.test_fail_history() returns trigger language plpgsql as $$ begin raise exception 'Injected history failure'; end $$;
    create trigger test_fail_history before insert on public.setlist_change_log for each row execute function public.test_fail_history();`);
  await assert.rejects(saveSetlist(owner,[songA],setlist,null,null,{...setlistDetails,name:"Never committed"}));
  assert.equal((await db.query("select name from public.setlists where id=$1",[setlist])).rows[0].name,"Songs","History failure rolls back metadata, event, slots and annotations");
  assert.deepEqual((await db.query("select id from public.setlist_songs where setlist_id=$1 order by song_order",[setlist])).rows.map(row=>row.id),[second,first,repeated]);
  await db.exec("drop trigger test_fail_history on public.setlist_change_log;");
  const templated = (await saveSetlist(owner,[songA],null,template)).rows[0].id;
  const templateRows = (await db.query("select ss.song_order, ss.notes, s.title from public.setlist_songs ss join public.songs s on s.id=ss.song_id where setlist_id=$1 order by song_order",[templated])).rows;
  assert.deepEqual(templateRows,[{song_order:1,notes:"Template Tag: Praise",title:"[Slot: Opening]"},{song_order:2,notes:"Template Tag: Worship",title:"[Slot: Response]"},{song_order:3,notes:null,title:"A"}],"Template slots and selected songs share contiguous order");
  const linkedEvent = (await db.query("select event_id from public.setlists where id=$1",[setlist])).rows[0].event_id;
  await saveSetlist(band,[songA],setlist,null,null,{...setlistDetails,name:"Band plan"});
  assert.equal((await db.query("select name from public.events where id=$1",[linkedEvent])).rows[0].name,"Songs","Band leader cannot edit associated event details");
  await saveSetlist(owner,[],setlist);
  assert.equal((await db.query("select * from public.setlist_songs where setlist_id=$1",[setlist])).rows.length,0,"An intentionally empty list removes slots");
  await saveSetlist(owner,[songA],setlist,null,null,{...setlistDetails,leader_member_id:ordinaryMember});
  await saveSetlist(owner,[songA],setlist);
  assert.equal((await db.query("select leader_member_id from public.setlists where id=$1",[setlist])).rows[0].leader_member_id,ordinaryMember,"Omitted leader preserves prior active selection");
  await assert.rejects(saveSetlist(owner,[songA],setlist,null,null,{...setlistDetails,leader_member_id:foreignMember}),(error)=>error.code === "22023");
  await assert.rejects(saveSetlist(owner,[songA],setlist,null,null,{...setlistDetails,leader_member_id:inactiveMember}),(error)=>error.code === "22023");
  await saveSetlist(owner,[songA],setlist,null,null,{...setlistDetails,leader_member_id:null});
  assert.equal((await db.query("select leader_member_id from public.setlists where id=$1",[setlist])).rows[0].leader_member_id,null,"Explicit null clears the leader");
  await db.exec(`insert into public.custom_roles(id,team_id,name,permissions) values ('${id(71)}','${team}','Workspace',array['events.manage','setlists.manage']::text[]);`);
  await db.exec(`update public.team_members set custom_role_id='${id(71)}' where id='${ordinaryMember}'`);
  const customEvent = (await saveEvent(member)).rows[0].id;
  assert.equal((await db.query("select approval_status from public.events where id=$1",[customEvent])).rows[0].approval_status,"approved","Persisted custom event permission allows managing events");
  await saveEvent(member,{...eventDetails,name:"Custom edit"},assignments,customEvent);
  await saveSetlist(member);
  const pendingReview = (await saveEvent(band)).rows[0].id;
  await expectDenied(review(member,pendingReview));
  await db.exec(`insert into public.custom_roles(id,team_id,name,permissions) values ('${id(72)}','${otherTeam}','Foreign workspace',array['events.manage','setlists.manage']::text[]); update public.team_members set custom_role_id='${id(72)}' where id='${ordinaryMember}'`);
  await expectDenied(saveEvent(member,eventDetails,assignments,customEvent)); await expectDenied(saveSetlist(member));
  await expectDenied(asUser(owner,"select private.has_workspace_permission($1,$2)",[team,"events.manage"]));
  console.log("PASS: actual PostgreSQL RPC permissions, pending proposals/approval, same-team active assignments, atomic edit/series/history rollback, stable duplicate slots/annotations, recurrence dates, template ordering, band-leader event boundary and empty lists.");
} finally { await db.close(); }
