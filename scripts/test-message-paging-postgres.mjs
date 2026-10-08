// Executes the real migration and repository read/send policies in local PostgreSQL.
// No network client or remote database is used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const team = id(1), otherTeam = id(2), profile = id(11), inactive = id(12), foreign = id(13);
const member = id(21), channel = id(31), empty = id(32), inaccessible = id(33), foreignChannel = id(34);
const baseline = readFileSync(new URL("../supabase/migrations/20260630010000_anointed_worship_mvp.sql", import.meta.url), "utf8");
function extract(start, ending) {
  const index = baseline.indexOf(start), end = baseline.indexOf(ending, index);
  assert(index >= 0 && end > index, `Repository SQL exists: ${start}`);
  return baseline.slice(index, end + ending.length);
}
async function asUser(who, sql, role = "authenticated") {
  await db.exec(`reset role; set request.jwt.claim.sub = '${who ?? ""}'; set role ${role};`);
  try { return await db.query(sql); } finally { await db.exec("reset role;"); }
}
async function rejected(who, sql, code = "42501", role) {
  await assert.rejects(asUser(who, sql, role), (error) => error.code === code);
}
const send = (nonce, body = "Hello", target = channel, file = null, parent = null) =>
  `select * from public.send_message_once('${target}', '${id(nonce)}', '${body}', ${file ? `'${file}'` : "null"}, null, ${parent ? `'${parent}'` : "null"})`;

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    grant usage on schema public, auth, private to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.team_members(id uuid primary key, team_id uuid not null, profile_id uuid not null, status text not null);
    create table public.message_channels(id uuid primary key, team_id uuid not null);
    create table public.message_channel_members(channel_id uuid not null, team_member_id uuid not null, primary key(channel_id, team_member_id));
    create table public.practice_files(id uuid primary key, team_id uuid not null);
    create table public.messages(
      id uuid primary key default gen_random_uuid(), channel_id uuid not null,
      sender_member_id uuid not null, body text not null, attachment_file_id uuid,
      scheduled_for timestamptz, is_delivered boolean not null default true,
      parent_message_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    insert into public.team_members values
      ('${member}', '${team}', '${profile}', 'active'),
      ('${id(22)}', '${team}', '${inactive}', 'inactive'),
      ('${id(23)}', '${otherTeam}', '${foreign}', 'active');
    insert into public.message_channels values
      ('${channel}', '${team}'), ('${empty}', '${team}'), ('${inaccessible}', '${team}'), ('${foreignChannel}', '${otherTeam}');
    insert into public.message_channel_members values
      ('${channel}', '${member}'), ('${empty}', '${member}'), ('${channel}', '${id(22)}'), ('${foreignChannel}', '${id(23)}');
    insert into public.practice_files values ('${id(41)}', '${team}'), ('${id(42)}', '${otherTeam}');
    grant select on public.team_members, public.message_channels, public.message_channel_members, public.practice_files, public.messages to authenticated;
    grant insert on public.messages to authenticated;
    alter table public.team_members enable row level security;
    alter table public.message_channels enable row level security;
    alter table public.message_channel_members enable row level security;
    alter table public.practice_files enable row level security;
    alter table public.messages enable row level security;
  `);
  await db.exec(extract("create or replace function private.is_approved_member(", "$$;"));
  for (const name of ["Members can view team member rows", "Members can read channels", "Members can read channel membership", "Members can read practice files", "Channel members can read messages", "Channel members can send messages"]) {
    await db.exec(extract(`create policy "${name}"`, ";"));
  }
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006030000_message_paging_retry.sql", import.meta.url), "utf8"));
  const previews = `select * from public.get_message_previews(array['${channel}', '${empty}', '${inaccessible}', '${foreignChannel}']::uuid[])`;
  await rejected(null, previews, "42501", "anon");
  await rejected(null, previews);
  assert.equal((await asUser(inactive, previews)).rows.length, 0);
  assert.equal((await asUser(foreign, `select * from public.get_message_previews(array['${channel}']::uuid[])`)).rows.length, 0);
  const first = (await asUser(profile, previews)).rows;
  assert.equal(first.length, 2, "Only active channel membership is returned");
  assert(first.every((row) => row.message === null), "Empty channels have null previews");
  await rejected(profile, `select * from public.get_message_previews(array_fill('${channel}'::uuid, array[51]))`, "22023");
  for (const who of [null, inactive, foreign]) await rejected(who, send(100));
  await rejected(profile, send(100, "Hello", inaccessible));
  await rejected(profile, send(100, "Hello", foreignChannel));
  await rejected(profile, send(100, "Hello", channel, id(42)));
  await rejected(profile, send(100, "   "), "22023");
  const sent = (await asUser(profile, send(100))).rows[0];
  assert.equal((await asUser(profile, send(100))).rows[0].id, sent.id, "Retry returns original identity");
  assert.equal((await db.query("select count(*)::int as count from public.messages")).rows[0].count, 1);
  await rejected(profile, send(100, "Changed"), "22023");
  await rejected(profile, send(100, "Hello", empty), "22023");
  await rejected(profile, `insert into public.messages(channel_id,sender_member_id,body) values ('${channel}','${id(23)}','forged')`);
  await db.exec(`insert into public.messages(id,channel_id,sender_member_id,body) values ('${id(101)}','${empty}','${member}','Other channel')`);
  await rejected(profile, send(102, "Reply", channel, null, id(101)));
  await asUser(profile, send(102, "Reply", channel, id(41), sent.id));
  const scheduledSql = `select * from public.send_message_once('${channel}','${id(103)}','Scheduled',null,'2030-01-01T00:00:00Z',null)`;
  const scheduled = (await asUser(profile, scheduledSql)).rows[0];
  await db.exec(`update public.messages set is_delivered=true where id='${scheduled.id}'`);
  assert.equal((await asUser(profile, scheduledSql)).rows[0].id, scheduled.id, "Retry after delivery retains identity");

  // Controlled large-history fixture. Report database timings separately from browser navigation.
  await db.exec(`
    insert into public.team_members select ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
      '${team}', ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'active' from generate_series(1,47) n;
    insert into public.message_channels select ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, '${team}' from generate_series(1,20) n;
    insert into public.message_channel_members select id, '${member}' from public.message_channels where id::text like '30000000%';
    insert into public.messages(id,channel_id,sender_member_id,body,created_at)
      select ('40000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
        ('30000000-0000-0000-0000-' || lpad(((n-1)%20+1)::text,12,'0'))::uuid,
        '${member}', repeat('Rehearsal notes ',20), '2026-10-01T00:00:00Z'::timestamptz + (n/40)*interval '1 second'
      from generate_series(1,10000) n;
    analyze public.messages; analyze public.message_channel_members; analyze public.team_members;
  `);
  const fixtureChannel = '30000000-0000-0000-0000-000000000001';
  const fixtureChannels = `array(select id from public.message_channels where id::text like '30000000%')`;
  const whole = `select * from public.messages where channel_id = any(${fixtureChannels}) order by created_at, id`;
  const bounded = `select * from public.get_message_previews(${fixtureChannels})`;
  const page = `select * from public.messages where channel_id='${fixtureChannel}' order by created_at desc,id desc limit 50`;
  const newest = (await asUser(profile, page)).rows;
  assert.equal(newest.length, 50);
  const cursor = newest.at(-1);
  const older = (await asUser(profile, `select * from public.messages where channel_id='${fixtureChannel}' and (created_at,id)<('${cursor.created_at.toISOString()}','${cursor.id}') order by created_at desc,id desc limit 50`)).rows;
  assert.equal(older.length, 50);
  assert(!older.some((row) => newest.some((recent) => recent.id === row.id)), "Timestamp ties do not duplicate cursor rows");
  async function measure(queries) {
    const samples = [];
    let rows = [];
    for (let trial = 0; trial < 12; trial++) {
      const start = performance.now();
      rows = (await Promise.all(queries.map((sql) => db.query(sql)))).flatMap((result) => result.rows);
      if (trial >= 2) samples.push(performance.now() - start);
    }
    samples.sort((a,b) => a-b);
    return { medianMs: Number(samples[Math.floor(samples.length/2)].toFixed(2)), rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(rows)) };
  }
  await db.exec(`set request.jwt.claim.sub='${profile}'; set role authenticated;`);
  const before = await measure([whole]);
  const after = await measure([bounded, page]);
  await db.exec("reset role;");
  console.log("PASS: real PostgreSQL migration, repository RLS, empty previews, tenant/channel/inactive/anonymous denials, sender forgery, nonce replay/mismatch, attachments, reply scope, and tie-safe cursor paging.");
  console.log(JSON.stringify({ fixture: { members: 50, messages: 10000, channels: 20 }, before, after, medianImprovementPercent: Number(((1-after.medianMs/before.medianMs)*100).toFixed(1)), scope: "Local PostgreSQL queries and serialized payload; not a live browser measurement" }, null, 2));
} finally {
  await db.close();
}
