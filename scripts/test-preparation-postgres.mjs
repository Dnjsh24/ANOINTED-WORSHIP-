// Local real PostgreSQL checks. Applies repository authorization helpers and
// the actual preparation migration; this script has no network connection.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const team=id(1), otherTeam=id(2), owner=id(11), member=id(12), foreign=id(13), inactive=id(14), unassigned=id(15);
const ownerMember=id(21), memberId=id(22), foreignMember=id(23), inactiveMember=id(24), unassignedMember=id(25);
const event=id(31), foreignEvent=id(32), setlist=id(41), foreignSetlist=id(42), slot=id(51), foreignSlot=id(52), assignment=id(61);
const keys=["Tune instruments and check cables","Check monitors and click levels","Agree intros, endings and transitions","Warm up and check comfortable keys","Confirm lead vocals and harmonies","Agree cues and microphone handoffs","Confirm roles, call time and attendance","Verify lyrics and slide order","Check microphones and backing tracks","Confirm prayer, media and dance cues"];
const tasks=keys.map(key=>({key,assignee_member_id:memberId}));
const allocations=[{slot_id:slot,minutes:5,focus:"Transitions"}];
const entries=[{id:id(71),kind:"song",title:"Opening song",slot_id:slot,duration_seconds:300,responsible_member_id:memberId,cue:"Intro twice"}];
const baseline=readFileSync(new URL("../supabase/migrations/20260630010000_anointed_worship_mvp.sql",import.meta.url),"utf8");
const workspace=readFileSync(process.argv[3] ?? new URL("../supabase/migrations/20261006010000_atomic_event_setlist_workflows.sql",import.meta.url),"utf8");
function helper(source,start) {
  const index=source.indexOf(start),end=source.indexOf("$$;",index);
  assert(index>=0&&end>index);
  return source.slice(index,end+3);
}
async function asUser(user,sql,params=[],role="authenticated") {
  await db.exec(`reset role; set request.jwt.claim.sub='${user??""}'; set role ${role};`);
  try{return await db.query(sql,params);}finally{await db.exec("reset role;");}
}
const savePlan=(user,revision=0,a=allocations,t=tasks,target=setlist)=>asUser(user,"select public.save_rehearsal_plan($1,$2,$3::jsonb,$4::jsonb) revision",[target,revision,JSON.stringify(a),JSON.stringify(t)]);
const saveOrder=(user,revision=0,e=entries,roles=["Main Keys"],target=event)=>asUser(user,"select public.save_service_order($1,$2,$3::jsonb,$4::text[]) revision",[target,revision,JSON.stringify(e),roles]);
const respondTask=(user,completed=true)=>asUser(user,"select public.respond_preparation_task($1,$2,$3)",[setlist,keys[0],completed]);
const readiness=(user,state="ready",target=slot)=>asUser(user,"select public.respond_song_readiness($1,$2,$3)",[target,state,"Practiced intro"]);
const response=(user,state="confirmed")=>asUser(user,"select public.respond_assignment($1,$2,$3)",[assignment,state,""]);
const denied=promise=>assert.rejects(promise,error=>error.code==="42501");
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
    grant usage on schema public,auth,private to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create type public.team_role as enum('owner','admin','pastor','worship_leader','band_leader','member');
    create table public.profiles(id uuid primary key);
    create table public.teams(id uuid primary key);
    create table public.custom_roles(id uuid primary key,team_id uuid,permissions text[]);
    create table public.team_members(id uuid primary key,team_id uuid,profile_id uuid,role public.team_role,status text,custom_role_id uuid);
    create table public.events(id uuid primary key,team_id uuid,approval_status text,deleted_at timestamptz);
    create table public.setlists(id uuid primary key,team_id uuid,event_id uuid,deleted_at timestamptz);
    create table public.setlist_songs(id uuid primary key,setlist_id uuid,deleted_at timestamptz);
    create table public.event_assignments(id uuid primary key,event_id uuid,team_member_id uuid);
    insert into public.profiles select unnest(array['${owner}','${member}','${foreign}','${inactive}','${unassigned}']::uuid[]);
    insert into public.teams values('${team}'),('${otherTeam}');
    insert into public.team_members values('${ownerMember}','${team}','${owner}','owner','active',null),
      ('${memberId}','${team}','${member}','member','active',null),('${foreignMember}','${otherTeam}','${foreign}','owner','active',null),
      ('${inactiveMember}','${team}','${inactive}','member','inactive',null),('${unassignedMember}','${team}','${unassigned}','member','active',null);
    insert into public.events values('${event}','${team}','approved',null),('${foreignEvent}','${otherTeam}','approved',null);
    insert into public.setlists values('${setlist}','${team}','${event}',null),('${foreignSetlist}','${otherTeam}','${foreignEvent}',null);
    insert into public.setlist_songs values('${slot}','${setlist}',null),('${foreignSlot}','${foreignSetlist}',null);
    insert into public.event_assignments values('${assignment}','${event}','${memberId}');
    grant select on public.events,public.setlists,public.setlist_songs,public.event_assignments to authenticated;
    alter table public.events enable row level security;alter table public.setlists enable row level security;
    alter table public.setlist_songs enable row level security;alter table public.event_assignments enable row level security;`);
  await db.exec(helper(baseline,"create or replace function private.is_approved_member("));
  await db.exec(helper(baseline,"create or replace function private.has_team_role("));
  await db.exec(helper(workspace,"create function private.has_workspace_permission("));
  await db.exec(helper(workspace,"create function private.lock_workspace_members("));
  await db.exec(`create policy fixture_event_reads on public.events for select to authenticated using(private.is_approved_member(team_id));
    create policy fixture_setlist_reads on public.setlists for select to authenticated using(private.is_approved_member(team_id));
    create policy fixture_slot_reads on public.setlist_songs for select to authenticated using(exists(select 1 from public.setlists s where s.id=setlist_songs.setlist_id));
    create policy fixture_assignment_reads on public.event_assignments for select to authenticated using(exists(select 1 from public.events e where e.id=event_assignments.event_id));`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006040000_shared_preparation_service_order.sql",import.meta.url),"utf8"));
  await denied(asUser(null,"select public.save_rehearsal_plan($1,0,'[]'::jsonb,'[]'::jsonb)",[setlist],"anon"));
  for(const user of [null,member,foreign,inactive]) {await denied(savePlan(user));await denied(saveOrder(user));}
  assert.equal((await savePlan(owner)).rows[0].revision,1);
  await db.exec(`alter table public.setlists add column name text default 'Sunday';alter table public.setlists add column setlist_date date default current_date;grant select on public.team_members to authenticated;`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006070000_personal_preparation_summary.sql",import.meta.url),"utf8"));
  const personal = user => asUser(user,"select * from public.get_personal_preparation($1)",[team]);
  assert.equal((await personal(member)).rows.length,10);
  assert.equal((await personal(owner)).rows.length,0);
  for(const user of [null,foreign,inactive]) await denied(personal(user));
  await assert.rejects(savePlan(owner,0),error=>error.code==="40001");
  await assert.rejects(savePlan(owner,1,[{...allocations[0],slot_id:foreignSlot}]),error=>error.code==="22023");
  await assert.rejects(savePlan(owner,1,allocations,tasks.map(t=>({...t,assignee_member_id:foreignMember}))),error=>error.code==="22023");
  await assert.rejects(savePlan(owner,1,allocations,tasks.map(t=>({...t,assignee_member_id:inactiveMember}))),error=>error.code==="22023");
  await assert.rejects(savePlan(owner,1,allocations,tasks.map(()=>tasks[0])),error=>error.code==="22023");
  for(const user of [null,owner,foreign,inactive,unassigned]) await denied(respondTask(user));
  await respondTask(member);
  assert.equal((await personal(member)).rows.length,9,"Saved completion removes own outstanding check");
  assert.equal((await asUser(owner,"select * from public.rehearsal_task_responses")).rows[0].completed,true);
  await respondTask(member,false);
  assert.equal((await db.query("select * from public.rehearsal_task_responses")).rows.length,1,"Responses update own row without duplicates");
  assert.equal((await savePlan(owner,1)).rows[0].revision,2);
  assert.equal((await db.query("select * from public.rehearsal_task_responses")).rows.length,1,"Unchanged assignee retains check");
  await savePlan(owner,2,allocations,tasks.map(t=>({...t,assignee_member_id:null})));
  assert.equal((await db.query("select * from public.rehearsal_task_responses")).rows.length,0,"Reassignment removes stale response");
  await denied(respondTask(member));
  for(const user of [null,owner,foreign,inactive,unassigned]) {await denied(readiness(user));await denied(response(user));}
  await readiness(member);await readiness(member,"needs_help");await response(member);await response(member,"declined");
  assert.equal((await asUser(owner,"select * from public.song_readiness")).rows[0].state,"needs_help");
  assert.equal((await asUser(owner,"select * from public.assignment_responses")).rows[0].state,"declined");
  await denied(readiness(member,"ready",foreignSlot));
  await assert.rejects(readiness(member,"invented"),error=>error.code==="22023");
  await db.exec(`update public.setlists set event_id=null where id='${setlist}'`);
  await denied(readiness(member));
  assert.equal((await asUser(owner,"select * from public.song_readiness")).rows.length,0,"Relinked readiness is hidden");
  await db.exec(`update public.setlists set event_id='${event}' where id='${setlist}'`);
  assert.equal((await saveOrder(owner)).rows[0].revision,1);
  await assert.rejects(saveOrder(owner,0),error=>error.code==="40001");
  await assert.rejects(saveOrder(owner,1,[{...entries[0],slot_id:foreignSlot}]),error=>error.code==="22023");
  await assert.rejects(saveOrder(owner,1,[{...entries[0],responsible_member_id:inactiveMember}]),error=>error.code==="22023");
  await assert.rejects(saveOrder(owner,1,entries,["Main Keys","Main Keys"]),error=>error.code==="22023");
  await assert.rejects(saveOrder(owner,1,[{...entries[0],kind:"prayer"}]),error=>error.code==="22023");
  const tables=["rehearsal_plans","rehearsal_task_responses","song_readiness","service_orders","assignment_responses"];
  for(const table of tables) {
    assert.equal((await asUser(foreign,`select * from public.${table}`)).rows.length,0);
    assert.equal((await asUser(inactive,`select * from public.${table}`)).rows.length,0);
    await denied(asUser(owner,`delete from public.${table}`));
    await denied(asUser(owner,`update public.${table} set updated_at=now()`));
    await denied(asUser(null,`select * from public.${table}`,[],"anon"));
  }
  await denied(asUser(owner,"insert into public.assignment_responses(assignment_id,team_member_id,state) values($1,$2,'confirmed')",[assignment,ownerMember]));
  await db.exec(`create function public.fail_plan() returns trigger language plpgsql as $$ begin raise exception 'Injected save failure';end $$;
    create trigger fail_plan before update on public.rehearsal_plans for each row execute function public.fail_plan();`);
  await assert.rejects(savePlan(owner,3));
  assert.equal((await db.query("select revision from public.rehearsal_plans")).rows[0].revision,3,"Failed save rolls back revision");
  await db.exec("drop trigger fail_plan on public.rehearsal_plans;");
  await db.exec(`insert into public.custom_roles values('${id(81)}','${team}',array['setlists.manage','events.manage']);update public.team_members set custom_role_id='${id(81)}' where id='${unassignedMember}'`);
  await savePlan(unassigned,3);await saveOrder(unassigned,1);
  await respondTask(member,false);
  await db.exec(`update public.setlists set deleted_at=now() where id='${setlist}'`);
  await denied(respondTask(member,true));
  assert.equal((await db.query("select completed from public.rehearsal_task_responses where setlist_id=$1 and task_key=$2",[setlist,keys[0]])).rows[0].completed,false,"Deleted parent rejects responses and preserves the saved check");
  await db.exec(`update public.setlists set deleted_at=null where id='${setlist}'`);
  await db.exec(`delete from public.event_assignments where id='${assignment}'`);
  await denied(response(member));await denied(readiness(member));
  assert.equal((await db.query("select * from public.assignment_responses")).rows.length,0,"Assignment removal cascades personal response");
  await db.exec(`delete from public.setlist_songs where id='${slot}'`);
  assert.equal((await db.query("select * from public.song_readiness")).rows.length,0,"Slot removal cascades readiness");
  console.log("PASS: real PostgreSQL plan/order revisions, team scope, custom grants, stale saves, bounded references, own-only checks/readiness/assignment responses, denied raw writes, reassignment cleanup, rollback and cascades. Parent-table read policies are a scoped fixture; this is not a complete deployed-schema test.");
} finally {await db.close();}
