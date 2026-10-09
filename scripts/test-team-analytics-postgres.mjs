// Isolated PostgreSQL-in-memory authorization/aggregation check. No network or live DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite");
const db = new PGlite();
const sqlFile = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const team = id(1), otherTeam = id(2), owner = id(11), admin = id(12), ordinary = id(13), inactive = id(14), foreign = id(15);
function extract(source, startText, endText) {
  const start = source.indexOf(startText), end = source.indexOf(endText, start);
  assert(start >= 0 && end >= 0, `Actual schema contains ${startText}`);
  return source.slice(start, end + endText.length);
}
async function asUser(user, selectedTeam = team, role = "authenticated") {
  await db.exec(`reset role;set request.jwt.claim.sub='${user ?? ""}';set role ${role};`);
  try { return (await db.query("select public.get_team_analytics($1) result", [selectedTeam])).rows[0].result; }
  finally { await db.exec("reset role;"); }
}
try {
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
    grant usage on schema public,auth,private to authenticated,anon;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  const baseline = sqlFile("20260630010000_anointed_worship_mvp.sql");
  for (const type of ["team_role", "member_status", "event_type", "song_edit_status", "attendance_status"]) await db.exec(extract(baseline, `create type public.${type} `, ";"));
  for (const table of ["profiles", "teams", "team_members", "events", "songs", "setlists", "setlist_songs", "attendance", "practice_files", "message_channels", "messages"]) await db.exec(extract(baseline, `create table public.${table} (`, "\n);"));
  for (const helper of ["is_approved_member", "has_team_role"]) await db.exec(extract(baseline, `create or replace function private.${helper}(`, "$$;"));
  await db.exec(`insert into auth.users select unnest(array['${owner}','${admin}','${ordinary}','${inactive}','${foreign}']::uuid[]);
    insert into public.profiles(id) select id from auth.users;
    insert into public.teams(id,name,code,owner_id) values('${team}','Current','AA-12345','${owner}'),('${otherTeam}','Foreign','BB-12345','${foreign}');
    insert into public.team_members(id,team_id,profile_id,role,status) values
      ('${id(21)}','${team}','${owner}','owner','active'),('${id(22)}','${team}','${admin}','admin','active'),
      ('${id(23)}','${team}','${ordinary}','member','active'),('${id(24)}','${team}','${inactive}','admin','inactive'),('${id(25)}','${otherTeam}','${foreign}','owner','active');
    insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,bpm) values
      ('${id(31)}','${team}','Frequent song','Artist','C','Verse','${owner}',100),('${id(32)}','${team}','Second song','Artist','D','Verse','${owner}',100),('${id(33)}','${otherTeam}','Foreign song','Artist','G','Verse','${foreign}',100);
    insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values
      ('${id(51)}','${team}','Service','service',current_date,'09:00','${owner}'),('${id(52)}','${team}','Rehearsal','rehearsal',current_date,'08:00','${owner}'),('${id(53)}','${otherTeam}','Foreign','service',current_date,'09:00','${foreign}');
    insert into public.attendance(event_id,team_member_id,status) values('${id(51)}','${id(21)}','available'),('${id(51)}','${id(22)}','unavailable'),('${id(53)}','${id(25)}','available');`);
  for (let n = 40; n < 47; n++) {
    await db.query("insert into public.setlists(id,team_id,name,setlist_date,created_by) values($1,$2,'Setlist',current_date,$3)", [id(n), team, owner]);
    await db.query("insert into public.setlist_songs(setlist_id,song_id,song_order,assigned_key) select $1,$2,n,'C' from generate_series(1,$3::integer) n", [id(n), id(n === 46 ? 32 : 31), n === 46 ? 100 : 200]);
  }
  await db.exec(`insert into public.message_channels(id,team_id,name,created_by) values('${id(61)}','${team}','Visible channel','${owner}'),('${id(62)}','${team}','Private hidden','${owner}'),('${id(63)}','${otherTeam}','Foreign channel','${foreign}');
    insert into public.messages(channel_id,sender_member_id,body) select '${id(61)}','${id(21)}','Message' from generate_series(1,1250);
    insert into public.messages(channel_id,sender_member_id,body) select '${id(62)}','${id(21)}','Hidden' from generate_series(1,1500);
    insert into public.messages(channel_id,sender_member_id,body) values('${id(63)}','${id(25)}','Foreign');
    insert into public.messages(channel_id,sender_member_id,body,created_at) values('${id(61)}','${id(21)}','Old',now()-interval '31 days');`);
  for (const table of ["songs", "setlists", "events", "message_channels"]) await db.exec(`alter table public.${table} enable row level security;
    create policy fixture_team_reads on public.${table} for select to authenticated using(private.is_approved_member(team_id)${table === "message_channels" ? " and name<>'Private hidden'" : ""});`);
  await db.exec(`alter table public.setlist_songs enable row level security;alter table public.attendance enable row level security;alter table public.messages enable row level security;
    create policy fixture_slot_reads on public.setlist_songs for select to authenticated using(exists(select 1 from public.setlists where id=setlist_id));
    create policy fixture_attendance_reads on public.attendance for select to authenticated using(exists(select 1 from public.events where id=event_id));
    create policy fixture_message_reads on public.messages for select to authenticated using(exists(select 1 from public.message_channels where id=channel_id));
    grant select on public.songs,public.setlists,public.setlist_songs,public.events,public.attendance,public.message_channels,public.messages to authenticated;`);
  await db.exec(sqlFile("20261008010000_team_analytics_summary.sql"));
  const result = await asUser(owner);
  assert.deepEqual(result.mostPlayedSongs, [{ title: "Frequent song", count: 1200 }, { title: "Second song", count: 100 }]);
  assert.deepEqual(result.attendanceStats, [{ type: "service", rate: 50 }, { type: "rehearsal", rate: 0 }]);
  assert.deepEqual(result.mostActiveChannels, [{ name: "Visible channel", count: 1250 }]);
  assert(Buffer.byteLength(JSON.stringify(result)) < 1000, "Aggregate transfer stays compact despite thousands of visible occurrence rows");
  assert.deepEqual(await asUser(admin), result);
  for (const user of [ordinary, inactive, foreign, null]) await assert.rejects(asUser(user), error => error.code === "42501");
  await assert.rejects(asUser(owner, otherTeam), error => error.code === "42501");
  await assert.rejects(asUser(null, team, "anon"), error => error.code === "42501");
  assert.equal((await db.query("select prosecdef from pg_proc where oid='public.get_team_analytics(uuid)'::regprocedure")).rows[0].prosecdef, false);
  await db.exec("revoke select on public.messages from authenticated");
  await assert.rejects(asUser(owner), error => error.code === "42501");
  console.log("PASS team analytics: exact >1000-row totals, empty attendance types, 30-day cutoff, caller RLS/private channel exclusion, owner/admin allow and tenant/member/inactive/anon denial. Actual baseline tables; read policies are an explicit scoped fixture.");
} finally { await db.close(); }
