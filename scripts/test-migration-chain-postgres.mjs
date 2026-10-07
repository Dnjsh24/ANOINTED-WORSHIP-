// Replay application DDL in a private, loopback-only native PostgreSQL cluster.
// Supabase service schemas are explicit local prerequisites. Only pg_net's
// extension statement is adapted; net.http_post never sends a request.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pgBin = process.env.PG_BIN_DIR ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const pgNetStatement = "create extension if not exists pg_net with schema extensions;";
const digest = value => createHash("sha256").update(value).digest("hex");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const filenames = (await readdir(migrationsDir)).filter(name => /^\d{14}_.*\.sql$/.test(name)).sort();
const migrations = await Promise.all(filenames.map(async name => ({ name, source: await readFile(path.join(migrationsDir, name), "utf8") })));
assert.equal(migrations.reduce((count, migration) => count + migration.source.split(pgNetStatement).length - 1, 0), 1, "Exactly one unavailable pg_net statement is adapted");
const milestone = migrations.filter(migration => migration.name.startsWith("20261006"));
assert.equal(milestone.length, 11);
const bundle = await readFile(path.join(repoRoot, "supabase", "manual", "20261006_team_workflows.sql"), "utf8");
const bundleBody = bundle.slice(bundle.indexOf("begin;"));
const expectedBundle = ["begin;", ...milestone.flatMap(migration => [`-- Source: ${migration.name}`, migration.source.trimEnd()]), "commit;", ""].join("\n");
assert.equal(bundleBody.replaceAll("\r\n", "\n"), expectedBundle.replaceAll("\r\n", "\n"), "Manual bundle exactly matches the chronological milestone");

function assertWithin(parent, target) {
  const relative = path.relative(parent, target);
  assert(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "Temporary paths must stay within their private root");
}

function runProgram(executable, args, input, capture = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: capture ? ["pipe", "pipe", "pipe"] : "ignore" });
    let stdout = "", stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
      child.stdin.on("error", error => { if (error.code !== "EPIPE") reject(error); });
      child.stdin.end(input);
    }
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(executable)} exited ${code}\n${stdout.slice(-2000)}\n${stderr.slice(-5000)}`)));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

const bootstrap = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema realtime; create schema extensions; create schema private;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table realtime.messages(id bigint generated always as identity primary key,extension text,private boolean,topic text,payload jsonb);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
create schema net;
create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language sql as $$ select 1::bigint $$;
grant usage on schema public,auth,storage,realtime,extensions,private to anon,authenticated,service_role;
grant all on all tables in schema storage,realtime to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
create publication supabase_realtime;
`;

const smoke = `
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000011','owner@example.test','{"full_name":"Chain owner"}'),
 ('00000000-0000-0000-0000-000000000012','member@example.test','{"full_name":"Chain member"}');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
do $$
<<smoke>>
declare workspace record; event_id uuid; setlist_id uuid; song_id uuid; snapshot jsonb; mutation jsonb; revision bigint;
begin
 select * into workspace from public.create_team_workspace('Chronological chain test','QA-12345');
 insert into public.team_members(team_id,profile_id,role,status) values(workspace.team_id,'00000000-0000-0000-0000-000000000012','member','active');
 insert into public.songs(team_id,title,artist,original_key,lyrics_chords,created_by)
 values(workspace.team_id,'Chain song','Test artist','C','Verse',auth.uid()) returning id into song_id;
 event_id := public.save_event_workspace(workspace.team_id,null,
  '{"name":"Chain service","type":"service","event_date":"2027-01-31","starts_at":"09:00","ends_at":"11:00","recurrence_rule":"none"}'::jsonb,'[]'::jsonb,null);
 setlist_id := public.save_setlist_workspace(workspace.team_id,null,event_id,
  '{"name":"Chain setlist","event_type":"service","setlist_date":"2027-01-31","call_time":"08:00","rehearsal_time":"08:30","service_times":["09:00"],"notes":"Chain notes","update_event":false}'::jsonb,
  array[song_id],null,null);
 snapshot := public.get_shared_edit_target('setlist',setlist_id);
 if snapshot is null then raise exception 'Missing shared setlist snapshot'; end if;
 if (select count(*) from public.search_songs(workspace.team_id,'Chain song',false,'title')) <> 1 then raise exception 'Song search smoke failed'; end if;
 if (select count(*) from public.search_setlists(workspace.team_id,'Chain song')) <> 1 then raise exception 'Setlist search smoke failed'; end if;
 if (select count(*) from public.search_events(workspace.team_id,'Chain service')) <> 1 then raise exception 'Event search smoke failed'; end if;
 if not exists(select 1 from public.setlist_songs ss where ss.setlist_id=smoke.setlist_id and ss.song_id=smoke.song_id) then raise exception 'Setlist entry missing'; end if;
 select s.sync_revision into revision from public.songs s where s.id=smoke.song_id;
 mutation := public.apply_worship_mutation('chain-local-device','00000000-0000-0000-0000-000000000101','song.update',
  jsonb_build_object('teamId',workspace.team_id,'id',song_id,'title','Chain synced song','artist','Test artist','originalKey','C','lyricsChords','Verse'),revision);
 if mutation->>'status' is distinct from 'applied' then raise exception 'Sync under final privileges failed: %',mutation; end if;
 revision := public.save_setlist_presentation_settings(workspace.team_id,setlist_id,'{"linesPerSlide":4}'::jsonb);
 if not exists(select 1 from public.setlists s where s.id=smoke.setlist_id and s.presentation_settings='{"linesPerSlide":4}'::jsonb and s.sync_revision=smoke.revision)
  then raise exception 'Presentation persistence/revision smoke failed'; end if;
 perform public.delete_event_cascade(event_id);
 if exists(select 1 from public.events e where e.id=smoke.event_id) or exists(select 1 from public.setlists s where s.id=smoke.setlist_id) then raise exception 'Cascade under final privileges failed'; end if;
end $$;
reset role;
do $$
begin
 if exists(select 1 from (values ('shared_edit_requests'),('rehearsal_plans'),('rehearsal_task_responses'),('song_readiness'),('service_orders'),('assignment_responses')) expected(name)
  left join pg_class c on c.oid=to_regclass('public.'||expected.name) where c.oid is null or not c.relrowsecurity) then raise exception 'Missing protected milestone table'; end if;
 if has_function_privilege('anon','public.apply_worship_mutation(text,uuid,text,jsonb,bigint)','execute') then raise exception 'Anonymous sync execute grant'; end if;
 if exists(select 1 from (values ('events'),('setlists'),('event_assignments'),('setlist_songs'),('worship_sync_receipts')) protected(name)
  where has_table_privilege('authenticated','public.'||protected.name,'INSERT,UPDATE,DELETE,TRUNCATE')
   or has_table_privilege('anon','public.'||protected.name,'INSERT,UPDATE,DELETE,TRUNCATE')
   or has_any_column_privilege('authenticated','public.'||protected.name,'INSERT,UPDATE')
   or has_any_column_privilege('anon','public.'||protected.name,'INSERT,UPDATE')) then raise exception 'Raw workspace DML grant bypasses RPC boundary'; end if;
end $$;
\\echo PASS application schema, workspace/profile bootstrap, event/setlist saves, snapshot/search, sync/presentation/cascade RPCs and RLS/raw-write grants smoke
`;

const port = await freePort();
const pgRoot = await mkdtemp(path.join(os.tmpdir(), "anointed-migration-chain-"));
const dataDir = path.join(pgRoot, "data");
assertWithin(os.tmpdir(), pgRoot); assertWithin(pgRoot, dataDir);
const psql = (database, source) => runProgram(path.join(pgBin, "psql.exe"), ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database], source);
const replay = migration => `\\echo APPLY ${migration.name}\nbegin;\n${migration.source.replace(pgNetStatement, "-- Local pg_net prerequisite adapter: net.http_post is a no-network stub.")}\ncommit;\n\\echo APPLIED ${migration.name}\n`;
const evidence = { scope: "Application DDL replay with local Supabase prerequisite adapters; provider services and live history unverified", postgresVersion: null, migrationCount: migrations.length, migrations: migrations.map(({ name, source }) => ({ name, sha256: digest(source) })), scriptSha256: digest(await readFile(fileURLToPath(import.meta.url))), bundleSha256: digest(bundle), adaptedStatement: pgNetStatement, results: [] };
let started = false;
try {
  await runProgram(path.join(pgBin, "initdb.exe"), ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"]);
  await runProgram(path.join(pgBin, "pg_ctl.exe"), ["-D", dataDir, "-l", path.join(pgRoot, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F -c wal_level=logical`, "-w", "start"], undefined, false);
  started = true;
  evidence.postgresVersion = (await psql("postgres", "show server_version;")).trim();
  await psql("postgres", "create database chronological; create database manual_bundle;");
  // Roles are cluster-wide; provider schemas/default grants belong to each database.
  await psql("chronological", bootstrap);
  await psql("manual_bundle", bootstrap.replace("create role anon; create role authenticated; create role service_role bypassrls;", ""));
  for (const database of ["chronological", "manual_bundle"]) {
    const replaySource = database === "chronological" ? migrations.map(replay).join("\n")
      : migrations.filter(migration => !migration.name.startsWith("20261006")).map(replay).join("\n") + `\\echo APPLY manual milestone bundle\n${bundle}\n\\echo APPLIED manual milestone bundle\n`;
    console.log(`Replaying ${database}: ${migrations.length} migrations`);
    const output = await psql(database, replaySource);
    const applied = output.split(/\r?\n/).filter(line => line.startsWith("APPLIED "));
    const expectedApplied = database === "chronological" ? migrations.map(migration => `APPLIED ${migration.name}`)
      : [...migrations.filter(migration => !migration.name.startsWith("20261006")).map(migration => `APPLIED ${migration.name}`), "APPLIED manual milestone bundle"];
    assert.deepEqual(applied, expectedApplied, "Every migration must apply in chronological order");
    const result = { database, applied, ddl: "passed", smoke: "pending" };
    evidence.results.push(result);
    console.log((await psql(database, smoke)).trim());
    result.smoke = "passed";
  }
  console.log("PASS complete chronological application migration chain and equivalent manual milestone bundle");
} catch (error) {
  evidence.error = error.message;
  throw error;
} finally {
  if (started) await runProgram(path.join(pgBin, "pg_ctl.exe"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(error => console.error(error.message));
  const evidenceFile = path.join(os.tmpdir(), `anointed-migration-chain-${path.basename(pgRoot)}.json`);
  await writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`Evidence: ${evidenceFile}`);
  assertWithin(os.tmpdir(), pgRoot);
  await rm(pgRoot, { recursive: true, force: true });
}
