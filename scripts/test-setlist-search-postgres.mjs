import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const team = id(1), user = id(2), foreignTeam = id(3);
const baseline = readFileSync(new URL("../supabase/migrations/20260630010000_anointed_worship_mvp.sql", import.meta.url), "utf8");
const start = baseline.indexOf("create or replace function private.is_approved_member");
assert(start >= 0);
const helper = baseline.slice(start, baseline.indexOf("$$;", start) + 3);
async function asUser(actor, sql, params = [], role = "authenticated") {
  await db.exec(`reset role;set request.jwt.claim.sub='${actor ?? ""}';set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
    grant usage on schema public,auth,private to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key,full_name text);
    create table public.team_members(id uuid primary key,team_id uuid,profile_id uuid,status text);
    create table public.setlists(id uuid primary key,team_id uuid,name text,location text,setlist_date date,service_times text[],leader_member_id uuid,deleted_at timestamptz);
    create table public.songs(id uuid primary key,team_id uuid,title text,deleted_at timestamptz);
    create table public.setlist_songs(id uuid primary key,setlist_id uuid,song_id uuid,deleted_at timestamptz);
    ${helper}
    grant select on all tables in schema public to authenticated;
    alter table public.setlists enable row level security;alter table public.songs enable row level security;
    create policy team_read on public.setlists for select to authenticated using(private.is_approved_member(team_id));
    create policy team_read on public.songs for select to authenticated using(private.is_approved_member(team_id));`);
  await db.query("insert into profiles values($1,'Dana')", [user]);
  await db.query("insert into team_members values($1,$2,$3,'active')", [id(4), team, user]);
  await db.exec(`insert into songs select ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${team}','Needle song',null from generate_series(1,1000) n;
    insert into setlists select ('00000000-0000-4000-8000-'||lpad((3000+n)::text,12,'0'))::uuid,'${team}','Service '||n,'Sanctuary','2026-10-06',array['Morning'],'${id(4)}',null from generate_series(1,500) n;
    insert into setlist_songs select ('00000000-0000-4000-8000-'||lpad((4000+n)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad((3000+n)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad((1500+n)::text,12,'0'))::uuid,null from generate_series(1,500) n;`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006060000_global_setlist_search.sql", import.meta.url), "utf8"));
  const count = async q => (await asUser(user, "select count(*)::int n from public.search_setlists($1,$2)", [team, q])).rows[0].n;
  assert.equal(await count("needle"), 500); // Every linked song lies after the old 500-song cap.
  assert.equal(await count("sanctuary"), 500);
  assert.equal(await count("dana"), 500);
  assert.equal(await count("morning"), 500);
  assert.equal(await count("2026-10-06"), 500);
  assert.equal(await count("%"), 0); // Literal search, no wildcard expansion.
  assert.equal((await asUser(user, "select * from public.search_setlists($1,$2) order by id limit 20 offset 20", [team, "needle"])).rows.length, 20);
  await assert.rejects(asUser(user, "select * from public.search_setlists($1,$2)", [foreignTeam, "needle"]), error => error.code === "42501");
  await assert.rejects(asUser(null, "select * from public.search_setlists($1,$2)", [team, "needle"], "anon"), error => error.code === "42501");
  await db.exec(`update songs set deleted_at=now() where id='${id(1501)}';`);
  assert.equal(await count("needle"), 499);
  await db.exec(`alter table songs add column artist text default 'Artist',add column tags text[] default '{}',add column status text default 'approved';
    create table song_favorites(song_id uuid,team_member_id uuid);
    grant select on song_favorites to authenticated;
    insert into song_favorites values('${id(2000)}','${id(4)}');
    insert into setlist_songs values('${id(9999)}','${id(3500)}','${id(2000)}',null);`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006100000_song_library_search_sort.sql", import.meta.url), "utf8"));
  const popular=(await asUser(user,"select id from public.search_songs($1,'',false,'playCount') limit 50",[team])).rows;
  assert.equal(popular[0].id,id(2000),'Global popularity sorting finds the most-used song beyond the title-first page');
  assert.equal((await asUser(user,"select count(*)::int n from public.search_songs($1,'needle',false,'title')",[team])).rows[0].n,999);
  assert.deepEqual((await asUser(user,"select id from public.search_songs($1,'',true,'playCount')",[team])).rows,[{id:id(2000)}],'Favorite filtering uses the actor membership before paging');
  assert.equal((await asUser(user,"select count(*)::int n from public.search_songs($1,'%',false,'title')",[team])).rows[0].n,0);
  await assert.rejects(asUser(user,"select * from public.search_songs($1,'',false,'title')",[foreignTeam]),error=>error.code==='42501');
  await assert.rejects(asUser(null,"select * from public.search_songs($1,'',false,'title')",[team],'anon'),error=>error.code==='42501');
  await db.exec(`create type public.event_type as enum('service','rehearsal');
    create table events(id uuid primary key,team_id uuid,name text,location text,type event_type,event_date date,deleted_at timestamptz);
    grant select on events to authenticated;alter table events enable row level security;
    create policy fixture_events on events for select to authenticated using(private.is_approved_member(team_id));
    insert into events values('${id(7000)}','${team}','Sunday','Hall','service','2026-10-11',null),('${id(7001)}','${foreignTeam}','Foreign','Hall','service','2026-10-11',null);`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006110000_global_event_search.sql", import.meta.url), "utf8"));
  for(const term of ['service','Sunday','hall','2026-10-11']) assert.equal((await asUser(user,'select count(*)::int n from public.search_events($1,$2)',[team,term])).rows[0].n,1);
  assert.equal((await asUser(user,"select count(*)::int n from public.search_events($1,'%')",[team])).rows[0].n,0);
  await assert.rejects(asUser(user,"select * from public.search_events($1,'')",[foreignTeam]),error=>error.code==='42501');
  console.log("PASS real PostgreSQL global search: 1000-song/500-setlist fixture, matches beyond former cap, count/order/page, name/location/date/leader/service time, deleted rows, literal query and tenant/anonymous denials.");
} finally { await db.close(); }
