// Native PostgreSQL workflow concurrency checks. This script creates and deletes
// only its own temporary cluster; it never connects to a configured Supabase URL.
// Run with PG_MODULE_PATH pointing to a local `pg` entry file, for example:
//   $env:PG_MODULE_PATH='C:/.../node_modules/pg/lib/index.js'
//   node scripts/test-workflow-concurrency.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pgBin = process.env.PG_BIN_DIR ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const pgModulePath = process.env.PG_MODULE_PATH ?? process.argv[2];
const pgImport = pgModulePath ? pathToFileURL(path.resolve(pgModulePath)).href : "pg";
let pgModule;
try {
  pgModule = await import(pgImport);
} catch (error) {
  throw new Error(`PostgreSQL client module unavailable. Set PG_MODULE_PATH to a local pg entry file. ${error.message}`);
}
const Client = pgModule.Client ?? pgModule.default?.Client;
if (!Client) throw new Error("The selected PostgreSQL module does not export Client.");

const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;
const teamId = id(1);
const ownerId = id(11);
const memberId = id(12);
const ownerMemberId = id(21);
const ordinaryMemberId = id(22);
const songAId = id(31);
const songBId = id(32);
const eventDetails = {
  name: "Concurrency service",
  type: "service",
  event_date: "2027-01-31",
  starts_at: "09:00",
  ends_at: "11:00",
  rehearsal_date: "2027-01-30",
  rehearsal_time: "18:00",
  rehearsal_end_time: "19:00",
  recurrence_rule: "none",
  location: "Sanctuary",
};
const setlistDetails = {
  name: "Concurrency setlist",
  event_type: "service",
  setlist_date: "2027-01-31",
  call_time: "08:00",
  rehearsal_time: "08:30",
  service_times: ["09:00"],
  notes: "Original notes",
  location: "Sanctuary",
  update_event: false,
};
const assignments = [
  { team_member_id: ownerMemberId, assignment: "Worship Leader" },
  { team_member_id: ordinaryMemberId, assignment: "Main Keys" },
];

function assertWithin(parent, child) {
  const relative = path.relative(parent, child);
  assert(relative && !relative.startsWith(`..${path.sep}`) && relative !== "..", "Temporary target must stay inside its private root");
}

function runProgram(executable, args, captureOutput = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "ignore",
    });
    let stdout = "";
    let stderr = "";
    if (captureOutput) {
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${path.basename(executable)} exited ${code}: ${stderr || stdout || "See the temporary PostgreSQL log."}`)));
  });
}

function extract(source, needle, endMarker) {
  const start = source.indexOf(needle);
  assert(start >= 0, `SQL fixture contains ${needle}`);
  const end = source.indexOf(endMarker, start);
  assert(end >= 0, `SQL fixture closes ${needle}`);
  return source.slice(start, end + endMarker.length);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await freePort();
const initdb = path.join(pgBin, "initdb.exe");
const pgCtl = path.join(pgBin, "pg_ctl.exe");
let pgRoot;
let dataDir;
let serverStarted = false;
let admin;

async function connect(applicationName) {
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: "postgres",
    application_name: applicationName,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  return client;
}

async function authenticate(client, profileId) {
  await client.query("SET ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [profileId]);
}

async function asUser(profileId, sql, parameters = [], applicationName = "workflow-setup") {
  const client = await connect(applicationName);
  try {
    await authenticate(client, profileId);
    return await client.query(sql, parameters);
  } finally {
    await client.end();
  }
}

async function waitForLock(applicationName, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await admin.query(
      "select wait_event_type from pg_stat_activity where application_name = $1 and state = 'active'",
      [applicationName],
    );
    if (result.rows.some((row) => row.wait_event_type === "Lock")) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Client ${applicationName} did not block on a PostgreSQL row lock`);
}

async function setupFixture() {
  await admin.query(`create role anon; create role authenticated;
    create schema auth; create schema private;
    grant usage on schema public, auth, private to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users(id uuid primary key);`);

  const readMigration = (name) => readFile(path.join(repoRoot, "supabase", "migrations", name), "utf8");
  const baseline = await readMigration("20260630010000_anointed_worship_mvp.sql");
  for (const name of ["team_role", "member_status", "event_type", "song_edit_status", "attendance_status"]) {
    await admin.query(extract(baseline, `create type public.${name} `, ";"));
  }
  for (const name of ["profiles", "teams", "team_members", "events", "event_assignments", "songs", "setlists", "setlist_songs", "attendance", "song_edit_requests", "announcements", "notifications", "dance_notes"]) {
    await admin.query(extract(baseline, `create table public.${name} (`, "\n);"));
  }
  for (const name of ["is_approved_member", "has_team_role"]) {
    await admin.query(extract(baseline, `create or replace function private.${name}(`, "$$;"));
  }

  for (const [migration, tableName] of [
    ["20260630030000_interaction_mvp_persistence.sql", "song_favorites"],
    ["20260702030000_service_templates_conflicts_setlist_history.sql", "setlist_change_log"],
    ["20260724000000_feature_24_32_39.sql", "setlist_templates"],
    ["20260724000000_feature_24_32_39.sql", "custom_roles"],
  ]) {
    const source = await readMigration(migration);
    await admin.query(extract(source, `create table if not exists public.${tableName} (`, "\n);"));
  }

  await admin.query(`alter table public.team_members add column custom_role_id uuid references public.custom_roles(id);
    alter type public.event_type add value 'service_rehearsal';
    alter table public.events add column approval_status text not null default 'approved', add column rehearsal_date date,
      add column rehearsal_end_time time, add column recurrence_rule text, add column recurrence_parent_id uuid references public.events(id),
      add column deleted_at timestamptz;
    alter table public.songs alter column bpm drop not null;
    alter table public.songs add column deleted_at timestamptz;
    alter table public.setlists add column deleted_at timestamptz, add column presentation_settings jsonb not null default '{}';
    alter table public.setlist_songs add column arrangement text, add column band_notes text, add column slide_settings jsonb, add column youtube_url text;`);

  await admin.query(`insert into auth.users values ('${ownerId}'), ('${memberId}');
    insert into public.profiles(id) values ('${ownerId}'), ('${memberId}');
    insert into public.teams(id,name,code,owner_id) values ('${teamId}','Native workflow test','NW-12345','${ownerId}');
    insert into public.team_members(id,team_id,profile_id,role,status) values
      ('${ownerMemberId}','${teamId}','${ownerId}','owner','active'),
      ('${ordinaryMemberId}','${teamId}','${memberId}','member','active');
    insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by) values
      ('${songAId}','${teamId}','Opening','Test artist','D','Verse','${ownerId}'),
      ('${songBId}','${teamId}','Response','Test artist','G','Chorus','${ownerId}');`);

  await admin.query(`alter table public.songs add column image_url text, add column album text, add column seed_source text,
      add column sync_revision bigint not null default 0;
    alter table public.events add column sync_revision bigint not null default 0;
    alter table public.setlists add column sync_revision bigint not null default 0;
    alter table public.setlist_songs add column deleted_at timestamptz, add column updated_at timestamptz not null default now(),
      add column sync_revision bigint not null default 0;
    alter table public.announcements add column target_role public.team_role, add column target_profile_id uuid,
      add column priority text default 'normal', add column is_pinned boolean default false;
    alter table public.notifications add column target_path text, add column acknowledged_at timestamptz,
      add column priority text default 'normal', add column event_id uuid, add column scheduled_for timestamptz default now(),
      add column recurrence_rule text default 'none', add column recurrence_index int default 0, add column recurrence_total int default 1,
      add column notice_group_id uuid, add column created_by uuid, add column target_role public.team_role,
      add column target_profile_id uuid, add column target_label text;
    alter table public.dance_notes add column song_title text, add column song_artist text, add column song_version text, add column video_url text;`);

  const syncFoundation = await readMigration("20260726000000_desktop_offline_sync_foundation.sql");
  for (const tableName of ["worship_sync_changes", "worship_sync_receipts"]) {
    await admin.query(extract(syncFoundation, `create table if not exists public.${tableName} (`, "\n);"));
  }
  await admin.query(`alter table public.worship_sync_changes enable row level security;
    alter table public.worship_sync_receipts enable row level security;
    grant select,insert on public.worship_sync_receipts to authenticated;
    grant select on public.worship_sync_changes to authenticated;`);
  await admin.query(await readMigration("20260726000001_offline_sync_rls_policies.sql"));

  await admin.query("grant all on public.events,public.setlists,public.event_assignments,public.setlist_songs,public.songs,public.worship_sync_receipts to authenticated,anon");
  for (const migration of [
    "20261006010000_atomic_event_setlist_workflows.sql",
    "20261006020000_shared_edit_requests_song_ownership.sql",
    "20261006040000_shared_preparation_service_order.sql",
    "20261006050000_shared_edit_workflow_adapters.sql",
    "20261006080000_setlist_aggregate_revisions.sql",
    "20261006090000_sync_snapshot_visibility.sql",
  ]) {
    await admin.query(await readMigration(migration));
  }

  await admin.query(`alter table public.songs enable row level security;
    grant select,insert,update on public.songs to authenticated;
    create policy fixture_song_reads on public.songs for select to authenticated using (private.is_approved_member(team_id));
    grant select on public.team_members,public.custom_roles to authenticated;`);

  const event = await asUser(ownerId,
    "select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) as id",
    [teamId, JSON.stringify(eventDetails), JSON.stringify(assignments)]);
  const eventId = event.rows[0].id;
  const setlist = await asUser(ownerId,
    "select public.save_setlist_workspace($1,null,$2,$3::jsonb,$4::uuid[],null) as id",
    [teamId, eventId, JSON.stringify(setlistDetails), [songAId]]);
  return { eventId, setlistId: setlist.rows[0].id };
}

async function concurrentCas({ label, sql, parameters, verify }) {
  const firstName = `workflow-${label}-first`;
  const secondName = `workflow-${label}-second`;
  const first = await connect(firstName);
  const second = await connect(secondName);
  try {
    await authenticate(first, ownerId);
    await authenticate(second, ownerId);
    await first.query("begin");
    await first.query(sql, parameters.first);
    await second.query("begin");
    const waitingWrite = second.query(sql, parameters.second).then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    await waitForLock(secondName);
    await first.query("commit");
    const writeResult = await waitingWrite;
    assert.equal(writeResult.error?.code, "40001", "stale concurrent writer returns a serialization conflict");
    await second.query("rollback");
    await verify();
    console.log(`PASS two-client ${label} CAS: second writer waited, then received serialization conflict`);
  } catch (error) {
    await first.query("rollback").catch(() => {});
    await second.query("rollback").catch(() => {});
    throw error;
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
}

async function testWorkspaceCas({ eventId, setlistId }) {
  const eventRevision = Number((await admin.query("select sync_revision from public.events where id=$1", [eventId])).rows[0].sync_revision);
  await concurrentCas({
    label: "event-workspace",
    sql: "select public.save_event_workspace($1,$2,$3::jsonb,$4::jsonb,null,$5::bigint)",
    parameters: {
      first: [teamId, eventId, JSON.stringify({ ...eventDetails, name: "Winner event" }), JSON.stringify(assignments), eventRevision],
      second: [teamId, eventId, JSON.stringify({ ...eventDetails, name: "Stale event" }), JSON.stringify(assignments), eventRevision],
    },
    verify: async () => assert.equal((await admin.query("select name from public.events where id=$1", [eventId])).rows[0].name, "Winner event"),
  });

  const setlistRevision = Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlistId])).rows[0].sync_revision);
  await concurrentCas({
    label: "setlist-workspace",
    sql: "select public.save_setlist_workspace($1,$2,null,$3::jsonb,$4::uuid[],null,$5::bigint)",
    parameters: {
      first: [teamId, setlistId, JSON.stringify({ ...setlistDetails, name: "Winner setlist" }), [songAId, songBId], setlistRevision],
      second: [teamId, setlistId, JSON.stringify({ ...setlistDetails, name: "Stale setlist" }), [songAId], setlistRevision],
    },
    verify: async () => {
      assert.equal((await admin.query("select name from public.setlists where id=$1", [setlistId])).rows[0].name, "Winner setlist");
      assert.deepEqual((await admin.query("select song_id from public.setlist_songs where setlist_id=$1 order by song_order", [setlistId])).rows.map((row) => row.song_id), [songAId, songBId]);
    },
  });
}

async function testConcurrentSlotChangeVersusApproval(setlistId) {
  const revision = Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlistId])).rows[0].sync_revision);
  const request = await asUser(memberId,
    "select public.submit_shared_edit_request('setlist',$1,$2,$3::jsonb,'Change song list', $4) as id",
    [setlistId, revision, JSON.stringify({ song_ids: [songAId], notes: "Proposal must stay unapplied" }), id(71)]);
  const requestId = request.rows[0].id;
  const slotId = (await admin.query("select id from public.setlist_songs where setlist_id=$1 and song_id=$2", [setlistId, songBId])).rows[0].id;

  const slotEditor = await connect("workflow-slot-editor");
  const reviewer = await connect("workflow-slot-reviewer");
  try {
    await authenticate(slotEditor, ownerId);
    await authenticate(reviewer, ownerId);
    await slotEditor.query("begin");
    await slotEditor.query("select public.mutate_setlist_slot($1,$2,'update',$3::jsonb)", [setlistId, slotId, JSON.stringify({ band_notes: "Saved while review waits" })]);
    await reviewer.query("begin");
    const waitingReview = reviewer.query("select public.review_shared_edit_request($1,'approved','') as status", [requestId]).then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    await waitForLock("workflow-slot-reviewer");
    await slotEditor.query("commit");
    const reviewResult = await waitingReview;
    assert.equal(reviewResult.error, undefined, reviewResult.error?.message);
    await reviewer.query("commit");
    assert.equal(reviewResult.result.rows[0].status, "needs_revision");
    assert.equal((await admin.query("select status from public.shared_edit_requests where id=$1", [requestId])).rows[0].status, "needs_revision");
    assert.equal((await admin.query("select notes from public.setlists where id=$1", [setlistId])).rows[0].notes, "Original notes");
    assert.equal((await admin.query("select band_notes from public.setlist_songs where id=$1", [slotId])).rows[0].band_notes, "Saved while review waits");
    assert.deepEqual((await admin.query("select song_id from public.setlist_songs where setlist_id=$1 order by song_order", [setlistId])).rows.map((row) => row.song_id), [songAId, songBId]);
    console.log("PASS concurrent slot update versus approval: parent lock serialized writers; approval marked stale and preserved both drafts");
  } catch (error) {
    await slotEditor.query("rollback").catch(() => {});
    await reviewer.query("rollback").catch(() => {});
    throw error;
  } finally {
    await Promise.all([slotEditor.end(), reviewer.end()]);
  }
}

async function testApprovalRollback() {
  const revision = Number((await admin.query("select sync_revision from public.songs where id=$1", [songAId])).rows[0].sync_revision);
  const request = await asUser(memberId,
    "select public.submit_shared_edit_request('song',$1,$2,$3::jsonb,'Inject failure', $4) as id",
    [songAId, revision, JSON.stringify({ title: "Must roll back" }), id(72)]);
  const requestId = request.rows[0].id;
  const before = {
    title: (await admin.query("select title from public.songs where id=$1", [songAId])).rows[0].title,
    syncRows: Number((await admin.query("select count(*)::int n from public.worship_sync_changes where entity_id=$1", [songAId])).rows[0].n),
    notifications: Number((await admin.query("select count(*)::int n from public.notifications where profile_id=$1", [memberId])).rows[0].n),
  };
  await admin.query(`create function public.workflow_test_reject_song() returns trigger language plpgsql as $$
    begin if new.title='Must roll back' then raise exception 'Injected approval failure'; end if; return new; end
    $$;
    create trigger workflow_test_reject_song before update on public.songs for each row execute function public.workflow_test_reject_song();`);
  try {
    await assert.rejects(asUser(ownerId,
      "select public.review_shared_edit_request($1,'approved','')",
      [requestId]), (error) => error.message.includes("Injected approval failure"));
    assert.equal((await admin.query("select title from public.songs where id=$1", [songAId])).rows[0].title, before.title);
    assert.equal((await admin.query("select status from public.shared_edit_requests where id=$1", [requestId])).rows[0].status, "pending");
    assert.equal(Number((await admin.query("select count(*)::int n from public.worship_sync_changes where entity_id=$1", [songAId])).rows[0].n), before.syncRows);
    assert.equal(Number((await admin.query("select count(*)::int n from public.notifications where profile_id=$1", [memberId])).rows[0].n), before.notifications);
    console.log("PASS approval rollback: failed target update rolled back content, request decision, sync change, and notification");
  } finally {
    await admin.query("drop trigger workflow_test_reject_song on public.songs; drop function public.workflow_test_reject_song();");
  }
}

async function memberDeletionRace({ label, parentTable, parentId, profileId = ownerId, sql, parameters }) {
  const blocker = await connect(`workflow-${label}-blocker`);
  const writer = await connect(`workflow-${label}-writer`);
  const remover = await connect(`workflow-${label}-remover`);
  try {
    await authenticate(writer, profileId);
    await authenticate(remover, ownerId);
    await blocker.query("begin");
    await blocker.query(`select 1 from public.${parentTable} where id=$1 for update`, [parentId]);
    await writer.query("begin");
    const writing = writer.query(sql, parameters).then(result => ({ result }), error => ({ error }));
    await waitForLock(`workflow-${label}-writer`);
    await remover.query("begin");
    const deleting = remover.query("delete from public.team_members where id=$1", [ordinaryMemberId])
      .then(result => ({ result }), error => ({ error }));
    await waitForLock(`workflow-${label}-remover`);
    await blocker.query("commit");
    const writeResult = await writing;
    await writer.query(writeResult.error ? "rollback" : "commit");
    const deleteResult = await deleting;
    await remover.query("rollback");
    assert.equal(writeResult.error, undefined, `${label}: ${writeResult.error?.code} ${writeResult.error?.message}`);
    assert.equal(deleteResult.error, undefined, `${label}: ${deleteResult.error?.code} ${deleteResult.error?.message}`);
    assert.equal(deleteResult.result.rowCount, 1);
    console.log(`PASS member deletion versus ${label}: member lock preceded parent; both sessions completed without deadlock`);
  } finally {
    await Promise.all([blocker, writer, remover].map(async client => {
      await client.query("rollback").catch(() => {});
      await client.end();
    }));
  }
}

async function testMemberDeletionOrder({ eventId, setlistId }) {
  // Parent SELECT/RLS is scoped to this fixture; production access denials are
  // checked by the shared-request and preparation harnesses.
  await admin.query("grant select on public.events,public.setlists,public.setlist_songs to authenticated; grant select,delete on public.team_members to authenticated");
  const eventRevision = Number((await admin.query("select sync_revision from public.events where id=$1", [eventId])).rows[0].sync_revision);
  await memberDeletionRace({ label: "event-save", parentTable: "events", parentId: eventId,
    sql: "select public.save_event_workspace($1,$2,$3::jsonb,$4::jsonb,null,$5)",
    parameters: [teamId, eventId, JSON.stringify(eventDetails), JSON.stringify(assignments), eventRevision] });
  const slotId = (await admin.query("select id from public.setlist_songs where setlist_id=$1 order by song_order limit 1", [setlistId])).rows[0].id;
  await admin.query("update public.setlist_songs set lead_member_id=$1 where id=$2", [ordinaryMemberId, slotId]);
  await memberDeletionRace({ label: "slot-edit", parentTable: "setlists", parentId: setlistId,
    sql: "select public.mutate_setlist_slot($1,$2,'update',$3::jsonb)",
    parameters: [setlistId, slotId, JSON.stringify({ lead_member_id: ordinaryMemberId, band_notes: "Safe member reference" })] });
  await memberDeletionRace({ label: "unchanged-slot-lead", parentTable: "setlists", parentId: setlistId,
    sql: "select public.mutate_setlist_slot($1,$2,'update',$3::jsonb)",
    parameters: [setlistId, slotId, JSON.stringify({ notes: "Retain the existing lead" })] });
  const setlistRevision = Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlistId])).rows[0].sync_revision);
  await memberDeletionRace({ label: "setlist-save-existing-lead", parentTable: "setlists", parentId: setlistId,
    sql: "select public.save_setlist_workspace($1,$2,null,$3::jsonb,$4::uuid[],null,$5)",
    parameters: [teamId, setlistId, JSON.stringify(setlistDetails), [songAId, songBId], setlistRevision] });
  const assignmentId = (await admin.query("select id from public.event_assignments where event_id=$1 and team_member_id=$2", [eventId, ordinaryMemberId])).rows[0].id;
  await memberDeletionRace({ label: "assignment-response", parentTable: "events", parentId: eventId, profileId: memberId,
    sql: "select public.respond_assignment($1,'confirmed','Ready')", parameters: [assignmentId] });
  await memberDeletionRace({ label: "song-readiness", parentTable: "setlists", parentId: setlistId, profileId: memberId,
    sql: "select public.respond_song_readiness($1,'ready','Prepared')", parameters: [slotId] });
  await memberDeletionRace({ label: "readiness-other-member-lead", parentTable: "setlists", parentId: setlistId,
    sql: "select public.respond_song_readiness($1,'ready','Prepared by owner')", parameters: [slotId] });
  const requestRevision = Number((await admin.query("select sync_revision from public.events where id=$1", [eventId])).rows[0].sync_revision);
  const requestId = (await asUser(memberId, "select public.submit_shared_edit_request('event',$1,$2,$3::jsonb,'Ready for review',$4) id",
    [eventId, requestRevision, JSON.stringify({ name: "Safe reviewed event" }), id(901)])).rows[0].id;
  await memberDeletionRace({ label: "shared-review", parentTable: "events", parentId: eventId,
    sql: "select public.review_shared_edit_request($1,'approved','')", parameters: [requestId] });
  assert.equal((await admin.query("select status from public.shared_edit_requests where id=$1", [requestId])).rows[0].status, "approved");
  const pendingId = (await asUser(memberId, "select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) id",
    [teamId, JSON.stringify(eventDetails), JSON.stringify(assignments)])).rows[0].id;
  await memberDeletionRace({ label: "pending-event-review", parentTable: "events", parentId: pendingId,
    sql: "select public.review_event_request($1,'approved')", parameters: [pendingId] });
  await memberDeletionRace({ label: "remove-slot-existing-lead", parentTable: "setlists", parentId: setlistId,
    sql: "select public.mutate_setlist_slot($1,$2,'remove','{}'::jsonb)", parameters: [setlistId, slotId] });
  const droppedAssignmentRevision = Number((await admin.query("select sync_revision from public.events where id=$1", [eventId])).rows[0].sync_revision);
  await memberDeletionRace({ label: "drop-existing-event-assignment", parentTable: "events", parentId: eventId,
    sql: "select public.save_event_workspace($1,$2,$3::jsonb,$4::jsonb,null,$5)",
    parameters: [teamId, eventId, JSON.stringify(eventDetails), JSON.stringify([assignments[0]]), droppedAssignmentRevision] });
}

async function testPermissionRevocation({ eventId, setlistId }) {
  async function revokeDuringWait({ label, user = ownerId, revokeSql, revokeParameters, sql, parameters, verify }) {
    const revoker = await connect(`workflow-${label}-revoker`), writer = await connect(`workflow-${label}-writer`);
    try {
      await revoker.query("begin");
      await revoker.query(revokeSql, revokeParameters);
      await authenticate(writer, user);
      const writing = writer.query(sql, parameters).then(result => ({ result }), error => ({ error }));
      await waitForLock(`workflow-${label}-writer`);
      await revoker.query("commit");
      await verify(await writing);
      console.log(`PASS ${label}: permissions reflect revocation committed during the member/role lock wait`);
    } finally {
      await revoker.query("rollback").catch(() => {});
      await Promise.all([revoker.end(), writer.end()]);
      await admin.query("update public.team_members set role='owner' where id=$1", [ownerMemberId]);
    }
  }
  const demote = { revokeSql: "update public.team_members set role='member' where id=$1", revokeParameters: [ownerMemberId] };
  await revokeDuringWait({ ...demote, label: "demoted-event-create",
    sql: "select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) id",
    parameters: [teamId, JSON.stringify(eventDetails), JSON.stringify(assignments)],
    verify: async ({ result, error }) => {
      assert.equal(error, undefined, error?.message);
      assert.equal((await admin.query("select approval_status from public.events where id=$1", [result.rows[0].id])).rows[0].approval_status, "pending");
    } });
  const currentRevision = Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlistId])).rows[0].sync_revision);
  await revokeDuringWait({ ...demote, label: "demoted-setlist-save",
    sql: "select public.save_setlist_workspace($1,$2,null,$3::jsonb,$4::uuid[],null,$5)",
    parameters: [teamId, setlistId, JSON.stringify(setlistDetails), [songBId], currentRevision],
    verify: async ({ error }) => { assert.equal(error?.code, "42501"); assert.equal(Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlistId])).rows[0].sync_revision), currentRevision); } });
  const slotId = (await admin.query("select id from public.setlist_songs where setlist_id=$1 limit 1", [setlistId])).rows[0].id;
  await revokeDuringWait({ ...demote, label: "demoted-slot-edit",
    sql: "select public.mutate_setlist_slot($1,$2,'update',$3::jsonb)",
    parameters: [setlistId, slotId, JSON.stringify({ notes: "Must remain unapplied" })],
    verify: async ({ error }) => assert.equal(error?.code, "42501") });
  const eventRevision = Number((await admin.query("select sync_revision from public.events where id=$1", [eventId])).rows[0].sync_revision);
  const requestId = (await asUser(memberId, "select public.submit_shared_edit_request('event',$1,$2,$3::jsonb,'Revocation test',$4) id",
    [eventId, eventRevision, JSON.stringify({ name: "Must remain unapproved" }), id(950)])).rows[0].id;
  await revokeDuringWait({ ...demote, label: "demoted-shared-review",
    sql: "select public.review_shared_edit_request($1,'approved','')", parameters: [requestId],
    verify: async ({ error }) => { assert.equal(error?.code, "42501"); assert.equal((await admin.query("select status from public.shared_edit_requests where id=$1", [requestId])).rows[0].status, "pending"); } });
  const customRoleId = id(951);
  await admin.query("insert into public.custom_roles(id,team_id,name,permissions) values($1,$2,'Temporary reviewer',array['setlists.manage']);", [customRoleId, teamId]);
  await admin.query("update public.team_members set custom_role_id=$1 where id=$2", [customRoleId, ordinaryMemberId]);
  try {
    await revokeDuringWait({ label: "revoked-custom-role", user: memberId,
      revokeSql: "update public.custom_roles set permissions='{}'::text[] where id=$1", revokeParameters: [customRoleId],
      sql: "select public.mutate_setlist_slot($1,$2,'update',$3::jsonb)",
      parameters: [setlistId, slotId, JSON.stringify({ notes: "Must remain unapplied" })],
      verify: async ({ error }) => assert.equal(error?.code, "42501") });
  } finally { await admin.query("update public.team_members set custom_role_id=null where id=$1", [ordinaryMemberId]); }
}

async function testPreparationDeletion({ eventId }) {
  const setlistId = id(1500), taskKey = "Tune instruments and check cables";
  const taskKeys = [taskKey, "Check monitors and click levels", "Agree intros, endings and transitions", "Warm up and check comfortable keys", "Confirm lead vocals and harmonies", "Agree cues and microphone handoffs", "Confirm roles, call time and attendance", "Verify lyrics and slide order", "Check microphones and backing tracks", "Confirm prayer, media and dance cues"];
  await admin.query("insert into public.setlists(id,team_id,event_id,name,setlist_date,created_by) values($1,$2,$3,'Deletion response test','2027-01-31',$4)", [setlistId, teamId, eventId, ownerId]);
  await asUser(ownerId, "select public.save_rehearsal_plan($1,0,'[]'::jsonb,$2::jsonb)", [setlistId, JSON.stringify(taskKeys.map(key => ({ key, assignee_member_id: ownerMemberId })))]);
  const remover = await connect("workflow-preparation-remover"), responder = await connect("workflow-preparation-responder");
  try {
    await authenticate(responder, ownerId);
    await remover.query("begin");
    await remover.query("update public.setlists set deleted_at=now() where id=$1", [setlistId]);
    const waiting = responder.query("select public.respond_preparation_task($1,$2,true)", [setlistId, taskKey])
      .then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-preparation-responder");
    await remover.query("commit");
    assert.equal((await waiting).error?.code, "42501");
    assert.equal((await admin.query("select count(*)::int n from public.rehearsal_task_responses where setlist_id=$1", [setlistId])).rows[0].n, 0);
    console.log("PASS preparation response after concurrent deletion: parent lock wait rechecks tombstone and saves no check");
    await admin.query("update public.setlists set deleted_at=null where id=$1", [setlistId]);
    await responder.query("begin");
    await responder.query("select public.respond_preparation_task($1,$2,false)", [setlistId, taskKey]);
    const deleting = remover.query("update public.setlists set deleted_at=now() where id=$1", [setlistId])
      .then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-preparation-remover");
    await responder.query("commit");
    assert.equal((await deleting).error, undefined);
    await assert.rejects(asUser(ownerId, "select public.respond_preparation_task($1,$2,true)", [setlistId, taskKey]), error => error.code === "42501");
    assert.equal((await admin.query("select completed from public.rehearsal_task_responses where setlist_id=$1", [setlistId])).rows[0].completed, false);
    console.log("PASS preparation response before concurrent deletion: deletion waits, then later response cannot overwrite the check");
  } finally {
    await Promise.all([remover, responder].map(async client => { await client.query("rollback").catch(() => {}); await client.end(); }));
  }
}

async function testSyncMutations({ eventId, setlistId }) {
  const syncSql = "select public.apply_worship_mutation('native-device',$1,$2,$3::jsonb,$4) result";
  const revision = async (table, rowId) => Number((await admin.query(`select sync_revision from public.${table} where id=$1`, [rowId])).rows[0]?.sync_revision ?? 0);
  let mutationNumber = 930;
  async function syncRace(command, table, rowId, payload, winnerField, winnerValue) {
    const baseRevision = await revision(table, rowId);
    const first = await connect(`workflow-${command}-first`), second = await connect(`workflow-${command}-second`);
    try {
      await authenticate(first, ownerId); await authenticate(second, ownerId);
      await first.query("begin"); await second.query("begin");
      const winner = await first.query(syncSql, [id(mutationNumber++), command, JSON.stringify(payload), baseRevision]);
      const waiting = second.query(syncSql, [id(mutationNumber++), command, JSON.stringify({ ...payload, [winnerField]: "Stale sync draft" }), baseRevision])
        .then(result => ({ result }), error => ({ error }));
      await waitForLock(`workflow-${command}-second`);
      await first.query("commit");
      const loser = await waiting; await second.query("commit");
      assert.equal(winner.rows[0].result.status, "applied");
      assert.equal(loser.error, undefined, loser.error?.message);
      assert.equal(loser.result.rows[0].result.status, "conflict");
      assert.equal((await admin.query(`select ${winnerField} value from public.${table} where id=$1`, [rowId])).rows[0].value, winnerValue);
      console.log(`PASS native ${command} sync CAS: stale writer waited and returned conflict without overwriting`);
    } finally {
      await Promise.all([first, second].map(async client => { await client.query("rollback").catch(() => {}); await client.end(); }));
    }
  }
  await syncRace("song.update", "songs", songAId,
    { teamId, id: songAId, title: "Winner sync song", artist: "Test artist", originalKey: "D", lyricsChords: "Verse" }, "title", "Winner sync song");
  await syncRace("song.create", "songs", id(919),
    { teamId, id: id(919), title: "Winner new song", artist: "Test artist", originalKey: "C", lyricsChords: "Verse" }, "title", "Winner new song");
  await syncRace("setlist.create", "setlists", id(920),
    { teamId, id: id(920), eventId: id(921), name: "Winner new setlist", date: "2027-01-31", eventType: "service", callTime: "08:00", rehearsalTime: "08:30", serviceTimes: [] }, "name", "Winner new setlist");
  const eventFirst = await connect("workflow-shared-event-first"), eventSecond = await connect("workflow-shared-event-second");
  try {
    await authenticate(eventFirst, ownerId); await authenticate(eventSecond, ownerId);
    await eventFirst.query("begin"); await eventSecond.query("begin");
    const sharedEvent = { teamId, eventId: id(1402), date: "2027-01-31", eventType: "service", callTime: "08:00", rehearsalTime: "08:30", serviceTimes: [] };
    const winner = await eventFirst.query(syncSql, [id(1403), "setlist.create", JSON.stringify({ ...sharedEvent, id: id(1400), name: "Winner shared event" }), 0]);
    const waiting = eventSecond.query(syncSql, [id(1404), "setlist.create", JSON.stringify({ ...sharedEvent, id: id(1401), name: "Stale shared event" }), 0])
      .then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-shared-event-second");
    await eventFirst.query("commit");
    const loser = await waiting; await eventSecond.query("commit");
    assert.equal(winner.rows[0].result.status, "applied");
    assert.equal(loser.error, undefined, loser.error?.message);
    assert.equal(loser.result.rows[0].result.status, "conflict");
    assert.equal((await admin.query("select name from public.events where id=$1", [id(1402)])).rows[0].name, "Winner shared event");
    assert.deepEqual((await admin.query("select id from public.setlists where id=any($1::uuid[]) order by id", [[id(1400), id(1401)]])).rows.map(row => row.id), [id(1400)]);
    console.log("PASS distinct new setlists sharing an absent event: stale writer waited, returned conflict and created no parent");
  } finally {
    await Promise.all([eventFirst, eventSecond].map(async client => { await client.query("rollback").catch(() => {}); await client.end(); }));
  }
  const replayFirst = await connect("workflow-sync-replay-first"), replaySecond = await connect("workflow-sync-replay-second");
  try {
    await authenticate(replayFirst, ownerId); await authenticate(replaySecond, ownerId);
    await replayFirst.query("begin"); await replaySecond.query("begin");
    const beforeChanges = (await admin.query("select count(*)::int n from public.worship_sync_changes where entity_id=$1", [songAId])).rows[0].n;
    const replayArgs = [id(940), "song.update", JSON.stringify({ teamId, id: songAId, title: "One retryable save", artist: "Test artist", originalKey: "D", lyricsChords: "Verse" }), await revision("songs", songAId)];
    const firstResult = await replayFirst.query(syncSql, replayArgs);
    const replayWaiting = replaySecond.query(syncSql, replayArgs).then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-sync-replay-second");
    await replayFirst.query("commit");
    const secondResult = await replayWaiting; await replaySecond.query("commit");
    assert.equal(firstResult.rows[0].result.status, "applied");
    assert.equal(secondResult.error, undefined, secondResult.error?.message);
    assert.deepEqual(secondResult.result.rows[0].result, firstResult.rows[0].result);
    assert.equal(await revision("songs", songAId), Number(firstResult.rows[0].result.revision));
    assert.equal((await admin.query("select count(*)::int n from public.worship_sync_changes where entity_id=$1", [songAId])).rows[0].n, beforeChanges + 1);
    console.log("PASS simultaneous same-identity sync retry: both clients receive original applied result with one change");
  } finally {
    await Promise.all([replayFirst, replaySecond].map(async client => { await client.query("rollback").catch(() => {}); await client.end(); }));
  }
  const eventRevision = await revision("events", eventId);
  const payload = { teamId, id: setlistId, eventId, name: "Winner sync setlist", date: "2027-01-31", eventType: "service", callTime: "08:00", rehearsalTime: "08:30", serviceTimes: ["09:00"] };
  const beforeSetlistRevision = await revision("setlists", setlistId);
  for (const eventPayload of [payload, { ...payload, eventRevision: eventRevision - 1 }]) {
    const result = await asUser(ownerId, syncSql, [id(915), "setlist.update", JSON.stringify(eventPayload), beforeSetlistRevision]);
    assert.equal(result.rows[0].result.status, "conflict");
    assert.equal(await revision("setlists", setlistId), beforeSetlistRevision);
    assert.equal(await revision("events", eventId), eventRevision);
  }
  console.log("PASS legacy/mismatched linked-event sync revision: conflict leaves event and setlist unchanged");
  await syncRace("setlist.update", "setlists", setlistId, { ...payload, eventRevision }, "name", "Winner sync setlist");
  const base = await revision("setlists", setlistId);
  const deletePayload = JSON.stringify({ teamId, id: setlistId });
  const stale = await asUser(ownerId, syncSql, [id(916), "setlist.delete", deletePayload, base - 1]);
  assert.equal(stale.rows[0].result.status, "conflict");
  assert.equal((await admin.query("select count(*)::int n from public.setlist_songs where setlist_id=$1 and deleted_at is not null", [setlistId])).rows[0].n, 0);
  await admin.query(`create function public.reject_sync_child_delete() returns trigger language plpgsql as $$
    begin if new.deleted_at is not null then raise exception 'Injected child deletion failure'; end if; return new; end $$;
    create trigger reject_sync_child_delete before update on public.setlist_songs for each row execute function public.reject_sync_child_delete();`);
  try {
    await assert.rejects(asUser(ownerId, syncSql, [id(917), "setlist.delete", deletePayload, base]), error => error.message.includes("Injected child deletion failure"));
    assert.equal(await revision("setlists", setlistId), base);
    assert.equal((await admin.query("select deleted_at from public.setlists where id=$1", [setlistId])).rows[0].deleted_at, null);
  } finally { await admin.query("drop trigger reject_sync_child_delete on public.setlist_songs; drop function public.reject_sync_child_delete()"); }
  const deleted = await asUser(ownerId, syncSql, [id(918), "setlist.delete", deletePayload, base]);
  assert.equal(deleted.rows[0].result.status, "applied");
  const state = (await admin.query("select sl.deleted_at parent_deleted,ss.deleted_at child_deleted from public.setlists sl join public.setlist_songs ss on ss.setlist_id=sl.id where sl.id=$1", [setlistId])).rows;
  assert(state.length > 0 && state.every(row => row.parent_deleted !== null && row.child_deleted !== null));
  const replay = await asUser(ownerId, syncSql, [id(918), "setlist.delete", deletePayload, base]);
  assert.deepEqual(replay.rows[0].result, deleted.rows[0].result);
  assert.equal(await revision("setlists", setlistId), Number(deleted.rows[0].result.revision));
  console.log("PASS sync setlist deletion: stale denial, injected rollback, atomic parent/children delete and idempotent replay");
  const tombstone = await revision("setlists", setlistId);
  const restoreAttempt = await asUser(ownerId, syncSql, [id(941), "setlist.update", JSON.stringify({ ...payload, eventRevision: await revision("events", eventId) }), tombstone]);
  assert.equal(restoreAttempt.rows[0].result.status, "conflict");
  assert.equal(await revision("setlists", setlistId), tombstone);
  assert.deepEqual((await admin.query("select sl.deleted_at parent_deleted,ss.deleted_at child_deleted from public.setlists sl join public.setlist_songs ss on ss.setlist_id=sl.id where sl.id=$1", [setlistId])).rows, state);
  console.log("PASS sync setlist tombstone revision: update cannot restore parent or children");
}

async function testWriteBoundaries({ eventId, setlistId }) {
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["events", "setlists", "event_assignments", "setlist_songs", "worship_sync_receipts"]) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        assert.equal((await admin.query("select has_table_privilege($1,$2,$3) allowed", [role, `public.${table}`, privilege])).rows[0].allowed, false);
      }
      const column = table === "worship_sync_receipts" ? "mutation_id" : "id";
      for (const sql of [`insert into public.${table} default values`, `update public.${table} set ${column}=${column}`, `delete from public.${table}`, `truncate public.${table} cascade`]) {
        const client = await connect("workflow-raw-denial");
        try {
          await client.query(`set role ${role}`);
          await client.query("select set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
          await assert.rejects(client.query(sql), error => error.code === "42501");
        } finally { await client.end(); }
      }
    }
    for (const privilege of ["DELETE", "TRUNCATE"]) {
      assert.equal((await admin.query("select has_table_privilege($1,'public.songs',$2) allowed", [role, privilege])).rows[0].allowed, false);
    }
  }
  console.log("PASS protected raw writes and receipts: anon/authenticated I/U/D/TRUNCATE/REFERENCES/TRIGGER denied; song raw deletion denied");
  const otherTeam = id(1600), foreign = id(1601), inactive = id(1602), foreignSong = id(1603), foreignEvent = id(1604), foreignSetlist = id(1605);
  await admin.query("insert into auth.users values($1),($2)", [foreign, inactive]);
  await admin.query("insert into public.profiles(id) values($1),($2)", [foreign, inactive]);
  await admin.query("insert into public.teams(id,name,code,owner_id) values($1,'Foreign','FF-12345',$2)", [otherTeam, foreign]);
  await admin.query("insert into public.team_members(team_id,profile_id,role,status) values($1,$2,'owner','active'),($3,$4,'member','inactive')", [otherTeam, foreign, teamId, inactive]);
  await admin.query("insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by) values($1,$2,'Foreign','Artist','C','Verse',$3)", [foreignSong, otherTeam, foreign]);
  await admin.query("insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values($1,$2,'Foreign','service','2027-01-31','09:00',$3)", [foreignEvent, otherTeam, foreign]);
  await admin.query("insert into public.setlists(id,team_id,event_id,name,setlist_date,created_by) values($1,$2,$3,'Foreign','2027-01-31',$4)", [foreignSetlist, otherTeam, foreignEvent, foreign]);
  const syncSql = "select public.apply_worship_mutation('boundary-device',$1,$2,$3::jsonb,$4) result";
  let nonce = 1700;
  const denied = async (user, command, payload, base = 0) => assert.rejects(asUser(user, syncSql, [id(nonce++), command, JSON.stringify(payload), base]), error => ["42501", "28000"].includes(error.code));
  const setlistPayload = { teamId, id: id(1610), eventId: id(1611), name: "Denied draft", date: "2027-01-31", eventType: "service", callTime: "08:00" };
  for (const user of [memberId, foreign, inactive, null]) {
    for (const command of ["setlist.create", "setlist.update", "setlist.delete", "setlist.presentation.update"]) {
      await denied(user, command, { ...setlistPayload, presentationSettings: {} });
    }
    for (const command of ["song.delete", "song.restore"]) await denied(user, command, { teamId, id: songAId });
  }
  await denied(memberId, "song.update", { teamId, id: songAId, title: "Unowned" });
  for (const command of ["song.create", "song.update", "song.delete", "song.restore"]) await denied(ownerId, command, { teamId, id: foreignSong });
  for (const command of ["setlist.create", "setlist.update", "setlist.delete", "setlist.presentation.update"]) await denied(ownerId, command, { ...setlistPayload, id: foreignSetlist });
  await denied(ownerId, "setlist.create", { ...setlistPayload, eventId: foreignEvent });
  for (const [offset, status] of [[0, "pending"], [1, "rejected"]]) {
    const unpublished = id(1650 + offset);
    await admin.query("insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status) values($1,$2,'Private draft','Artist','C','Private unpublished lyrics',$3,$4)", [unpublished, teamId, ownerId, status]);
    await denied(memberId, "song.create", { teamId, id: unpublished, title: "Probe" });
  }
  const ownSong = id(1612), receipt = id(1613), songPayload = { teamId, id: ownSong, title: "Member creation", artist: "Artist", originalKey: "C", lyricsChords: "Verse" };
  const created = await asUser(memberId, syncSql, [receipt, "song.create", JSON.stringify(songPayload), 0]);
  assert.equal(created.rows[0].result.status, "applied");
  assert.equal((await admin.query("select created_by from public.songs where id=$1", [ownSong])).rows[0].created_by, memberId);
  assert.deepEqual((await asUser(memberId, syncSql, [receipt, "song.create", JSON.stringify(songPayload), 0])).rows[0].result, created.rows[0].result);
  const deletedOwnSong = await asUser(ownerId, syncSql, [id(nonce++), "song.delete", JSON.stringify({ teamId, id: ownSong }), Number(created.rows[0].result.revision)]);
  assert.equal(deletedOwnSong.rows[0].result.status, "applied");
  await assert.rejects(asUser(memberId, syncSql, [id(nonce++), "song.update", JSON.stringify(songPayload), Number(deletedOwnSong.rows[0].result.revision)]), error => error.code === "42501");
  assert.notEqual((await admin.query("select deleted_at from public.songs where id=$1", [ownSong])).rows[0].deleted_at, null);
  const restoredOwnSong = await asUser(ownerId, syncSql, [id(nonce++), "song.restore", JSON.stringify({ teamId, id: ownSong }), Number(deletedOwnSong.rows[0].result.revision)]);
  assert.equal(restoredOwnSong.rows[0].result.status, "applied");
  assert.equal((await admin.query("select deleted_at from public.songs where id=$1", [ownSong])).rows[0].deleted_at, null);
  console.log("PASS creator cannot restore a tombstoned song through update; authorized explicit restore preserves the contract");
  await assert.rejects(asUser(foreign, syncSql, [receipt, "song.create", JSON.stringify({ ...songPayload, teamId: otherTeam, id: id(1614) }), 0]), error => error.code === "42501");
  await assert.rejects(asUser(memberId, syncSql, [receipt, "song.create", JSON.stringify({ ...songPayload, teamId: otherTeam }), 0]), error => error.code === "28000");
  await assert.rejects(asUser(memberId, syncSql, [receipt, "unsupported", JSON.stringify(songPayload), 0]), error => error.code === "22023");
  await assert.rejects(asUser(memberId, syncSql, [id(nonce++), "song.update", JSON.stringify(songPayload), null]), error => error.code === "22023");
  const client = await connect("workflow-anon-sync");
  try { await client.query("set role anon"); await assert.rejects(client.query(syncSql, [id(nonce++), "song.create", JSON.stringify(songPayload), 0]), error => error.code === "42501"); }
  finally { await client.end(); }
  console.log("PASS checked sync permissions: ordinary/foreign/inactive/anonymous denials, cross-team IDs/receipts, creator-owned creation and replay");
  const revision = Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlistId])).rows[0].sync_revision);
  const saved = await asUser(ownerId, "select public.save_setlist_presentation_settings($1,$2,$3::jsonb) revision", [teamId, setlistId, JSON.stringify({ theme: "dark" })]);
  assert(Number(saved.rows[0].revision) > revision);
  for (const user of [memberId, foreign, inactive, null]) await assert.rejects(asUser(user, "select public.save_setlist_presentation_settings($1,$2,'{}'::jsonb)", [teamId, setlistId]), error => error.code === "42501");
  await assert.rejects(asUser(ownerId, "select public.save_setlist_presentation_settings($1,$2,'{}'::jsonb)", [teamId, foreignSetlist]), error => error.code === "42501");
  await assert.rejects(asUser(ownerId, "select public.save_setlist_presentation_settings($1,$2,'[]'::jsonb)", [teamId, setlistId]), error => error.code === "22023");
  console.log("PASS presenter field RPC: serialized revision, bounded object, team scope and setlists.manage denials");
  await asUser(ownerId, "select public.save_setlist_presentation_settings($1,$2,$3::jsonb)", [teamId, setlistId, JSON.stringify({ legacyDraft: "x".repeat(100001) })]);
  await assert.rejects(asUser(ownerId, "select public.save_setlist_presentation_settings($1,$2,$3::jsonb)", [teamId, setlistId, JSON.stringify({ oversized: "x".repeat(2097152) })]), error => error.code === "22023");
  for (const user of [foreign, inactive, null]) {
    await assert.rejects(asUser(user, "select public.delete_event_cascade($1)", [eventId]), error => error.code === "42501");
    await assert.rejects(asUser(user, "select public.delete_setlist_cascade($1)", [setlistId]), error => error.code === "42501");
    await assert.rejects(asUser(user, "select public.delete_song_cascade($1)", [songAId]), error => error.code === "42501");
  }
  assert.equal((await admin.query("select name from public.events where id=$1", [eventId])).rows.length, 1);
}

async function raceCommands(label, firstSql, firstArgs, secondSql, secondArgs, expectedError) {
  const first = await connect(`workflow-${label}-first`), second = await connect(`workflow-${label}-second`);
  try {
    await authenticate(first, ownerId); await authenticate(second, ownerId);
    await first.query("begin"); await second.query("begin");
    await first.query(firstSql, firstArgs);
    const waiting = second.query(secondSql, secondArgs).then(result => ({ result }), error => ({ error }));
    await waitForLock(`workflow-${label}-second`);
    await first.query("commit");
    const outcome = await waiting;
    assert.equal(outcome.error?.code, expectedError, outcome.error?.message);
    await second.query(expectedError ? "rollback" : "commit");
    console.log(`PASS ${label}: concurrent public RPC waited and ${expectedError ? `denied ${expectedError}` : "completed without deadlock"}`);
  } finally { await Promise.all([first, second].map(async client => { await client.query("rollback").catch(() => {}); await client.end(); })); }
}

async function testCascadeRaces() {
  let next = 1800;
  async function fixture() {
    const eventId = (await asUser(ownerId, "select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) id", [teamId, JSON.stringify(eventDetails), JSON.stringify(assignments)])).rows[0].id;
    const setlists = [];
    for (let i = 0; i < 2; i++) setlists.push((await asUser(ownerId, "select public.save_setlist_workspace($1,null,$2,$3::jsonb,$4::uuid[],null) id", [teamId, eventId, JSON.stringify(setlistDetails), [songBId]])).rows[0].id);
    return { eventId, setlists };
  }
  const saveSql = "select public.save_setlist_workspace($1,$2,null,$3::jsonb,$4::uuid[],null,$5)";
  const saveArgs = async setlist => [teamId, setlist, JSON.stringify(setlistDetails), [songBId], Number((await admin.query("select sync_revision from public.setlists where id=$1", [setlist])).rows[0].sync_revision)];
  let f = await fixture();
  await raceCommands("event-cascade-versus-sibling-save", saveSql, await saveArgs(f.setlists[1]), "select public.delete_event_cascade($1)", [f.eventId]);
  assert.equal((await admin.query("select count(*)::int n from public.setlists where event_id=$1", [f.eventId])).rows[0].n, 0);
  f = await fixture();
  await raceCommands("setlist-cascade-versus-sibling-save", saveSql, await saveArgs(f.setlists[1]), "select public.delete_setlist_cascade($1)", [f.setlists[0]]);
  assert.equal((await admin.query("select event_id from public.setlists where id=$1", [f.setlists[1]])).rows[0].event_id, null);
  f = await fixture();
  await raceCommands("new-link-before-event-cascade", "select public.save_setlist_workspace($1,null,$2,$3::jsonb,$4::uuid[],null)", [teamId, f.eventId, JSON.stringify(setlistDetails), [songBId]], "select public.delete_event_cascade($1)", [f.eventId]);
  assert.equal((await admin.query("select count(*)::int n from public.setlists where event_id=$1", [f.eventId])).rows[0].n, 0);
  f = await fixture();
  await raceCommands("event-cascade-before-new-link", "select public.delete_event_cascade($1)", [f.eventId], "select public.save_setlist_workspace($1,null,$2,$3::jsonb,$4::uuid[],null)", [teamId, f.eventId, JSON.stringify(setlistDetails), [songBId]], "42501");
  f = await fixture();
  await memberDeletionRace({ label: "public-event-cascade", parentTable: "events", parentId: f.eventId, sql: "select public.delete_event_cascade($1)", parameters: [f.eventId] });
  f = await fixture();
  await memberDeletionRace({ label: "public-setlist-cascade", parentTable: "setlists", parentId: f.setlists[0], sql: "select public.delete_setlist_cascade($1)", parameters: [f.setlists[0]] });
  f = await fixture();
  const slot = (await admin.query("select id from public.setlist_songs where setlist_id=$1", [f.setlists[0]])).rows[0].id;
  await admin.query("update public.setlist_songs set lead_member_id=$1 where id=$2", [ordinaryMemberId, slot]);
  await memberDeletionRace({ label: "legacy-reorder-existing-lead", parentTable: "setlists", parentId: f.setlists[0], sql: "select public.reorder_setlist_songs($1,$2::jsonb)", parameters: [f.setlists[0], JSON.stringify([{ id: slot, song_order: 1 }])] });
  await memberDeletionRace({ label: "legacy-add-existing-lead", parentTable: "setlists", parentId: f.setlists[0], sql: "select public.add_setlist_songs($1,$2::jsonb)", parameters: [f.setlists[0], JSON.stringify([{ song_id: songBId, assigned_key: "G", type: "None" }])] });
  const song = id(next++);
  await admin.query("insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by) values($1,$2,'Delete race','Artist','C','Verse',$3)", [song, teamId, ownerId]);
  await raceCommands("slot-add-before-song-cascade", "select public.mutate_setlist_slot($1,null,'add',$2::jsonb)", [f.setlists[0], JSON.stringify({ song_id: song, assigned_key: "C" })], "select public.delete_song_cascade($1)", [song]);
  assert.equal((await admin.query("select count(*)::int n from public.setlist_songs where song_id=$1", [song])).rows[0].n, 0);
  const song2 = id(next++);
  await admin.query("insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by) values($1,$2,'Delete race','Artist','C','Verse',$3)", [song2, teamId, ownerId]);
  await raceCommands("song-cascade-before-slot-add", "select public.delete_song_cascade($1)", [song2], "select public.mutate_setlist_slot($1,null,'add',$2::jsonb)", [f.setlists[0], JSON.stringify({ song_id: song2, assigned_key: "C" })], "22023");
  for (const sql of ["select public.delete_event_cascade($1)", "select public.delete_setlist_cascade($1)", "select public.delete_song_cascade($1)"]) {
    const target = sql.includes("event") ? f.eventId : sql.includes("setlist") ? f.setlists[0] : songBId;
    await assert.rejects(asUser(memberId, sql, [target]), error => error.code === "42501");
  }
  const custom = id(next++);
  await admin.query("insert into public.custom_roles(id,team_id,name,permissions) values($1,$2,'Cascade manager',array['events.manage','setlists.manage'])", [custom, teamId]);
  await admin.query("update public.team_members set custom_role_id=$1 where id=$2", [custom, ordinaryMemberId]);
  try {
    const pending = (await asUser(memberId, "select public.save_event_workspace($1,null,$2::jsonb,'[]'::jsonb,null) id", [teamId, JSON.stringify(eventDetails)])).rows[0].id;
    await admin.query("update public.events set approval_status='pending' where id=$1", [pending]);
    await assert.rejects(asUser(memberId, "select public.delete_event_cascade($1)", [pending]), error => error.code === "42501");
    await asUser(memberId, "select public.delete_setlist_cascade($1)", [f.setlists[0]]);
    f = await fixture();
    await asUser(memberId, "select public.delete_event_cascade($1)", [f.eventId]);
  } finally { await admin.query("update public.team_members set custom_role_id=null where id=$1", [ordinaryMemberId]); }
  console.log("PASS physical cascade contracts: siblings unlinked, custom grants retained, ordinary/pending-event deletion denied");
}

async function testReadinessEligibilityRaces() {
  const eventId = (await asUser(ownerId, "select public.save_event_workspace($1,null,$2::jsonb,$3::jsonb,null) id", [teamId, JSON.stringify(eventDetails), JSON.stringify(assignments)])).rows[0].id;
  const setlistId = (await asUser(ownerId, "select public.save_setlist_workspace($1,null,$2,$3::jsonb,$4::uuid[],null) id", [teamId, eventId, JSON.stringify(setlistDetails), [songBId]])).rows[0].id;
  const slotId = (await admin.query("select id from public.setlist_songs where setlist_id=$1", [setlistId])).rows[0].id;
  const responseSql = "select public.respond_song_readiness($1,'ready','Eligibility race')";
  const remover = await connect("workflow-readiness-remover"), responder = await connect("workflow-readiness-responder");
  try {
    await authenticate(responder, ownerId);
    await responder.query("begin"); await responder.query(responseSql, [slotId]);
    const removing = remover.query("delete from public.event_assignments where event_id=$1 and team_member_id=$2", [eventId, ownerMemberId]).then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-readiness-remover"); await responder.query("commit");
    assert.equal((await removing).error, undefined);
    await assert.rejects(responder.query(responseSql, [slotId]), error => error.code === "42501");
    console.log("PASS readiness before assignment removal: removal waits, later response denied");
    await admin.query("insert into public.event_assignments(event_id,team_member_id,assignment) values($1,$2,'Worship Leader')", [eventId, ownerMemberId]);
    await remover.query("begin");
    await remover.query("delete from public.event_assignments where event_id=$1 and team_member_id=$2", [eventId, ownerMemberId]);
    let waiting = responder.query(responseSql, [slotId]).then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-readiness-responder"); await remover.query("commit");
    assert.equal((await waiting).error?.code, "42501");
    console.log("PASS assignment removal before readiness: committed removal rechecked after event lock wait");
    await admin.query("insert into public.event_assignments(event_id,team_member_id,assignment) values($1,$2,'Worship Leader')", [eventId, ownerMemberId]);
    await remover.query("begin"); await remover.query("update public.events set deleted_at=now() where id=$1", [eventId]);
    waiting = responder.query(responseSql, [slotId]).then(result => ({ result }), error => ({ error }));
    await waitForLock("workflow-readiness-responder"); await remover.query("commit");
    assert.equal((await waiting).error?.code, "42501");
    console.log("PASS event tombstone before readiness: committed tombstone denied after event lock wait");
  } finally { await Promise.all([remover, responder].map(async client => { await client.query("rollback").catch(() => {}); await client.end(); })); }
}

try {
  pgRoot = await mkdtemp(path.join(os.tmpdir(), "codex-workflow-pg-"));
  dataDir = path.join(pgRoot, "data");
  assertWithin(os.tmpdir(), pgRoot);
  assertWithin(pgRoot, dataDir);
  await runProgram(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"]);
  await runProgram(pgCtl, ["-D", dataDir, "-l", path.join(pgRoot, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], false);
  serverStarted = true;
  admin = await connect("workflow-test-admin");
  const ids = await setupFixture();
  await testWorkspaceCas(ids);
  await testConcurrentSlotChangeVersusApproval(ids.setlistId);
  await testApprovalRollback();
  await testMemberDeletionOrder(ids);
  await testPermissionRevocation(ids);
  await testPreparationDeletion(ids);
  await testWriteBoundaries(ids);
  await testCascadeRaces();
  await testReadinessEligibilityRaces();
  await testSyncMutations(ids);
  console.log("PASS native PostgreSQL workflow concurrency suite (migrations 010/020/040/050/080/090)");
} finally {
  if (admin) await admin.end().catch(() => {});
  if (serverStarted) await runProgram(pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch((error) => console.error(error.message));
  if (pgRoot) {
    assertWithin(os.tmpdir(), pgRoot);
    await rm(pgRoot, { recursive: true, force: true });
  }
}
