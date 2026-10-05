// This harness runs real Postgres SQL in an isolated, in-memory PGlite instance.
// It has no network client and cannot connect to a remote database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite();
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;
const teamA = id(1), teamB = id(2);
const ownerA = id(11), memberA = id(12), adminB = id(13), inactiveA = id(14);
const memberIds = { owner: id(21), member: id(22), admin: id(23), inactive: id(24) };

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    grant usage on schema public, auth, private to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create type public.team_role as enum ('owner', 'admin', 'member');
    create table public.team_members (
      id uuid primary key, team_id uuid not null, profile_id uuid not null,
      role public.team_role not null, status text not null, unique(team_id, profile_id)
    );
    insert into public.team_members values
      ('${memberIds.owner}', '${teamA}', '${ownerA}', 'owner', 'active'),
      ('${memberIds.member}', '${teamA}', '${memberA}', 'member', 'active'),
      ('${memberIds.admin}', '${teamB}', '${adminB}', 'admin', 'active'),
      ('${memberIds.inactive}', '${teamA}', '${inactiveA}', 'member', 'inactive');
  `);
  // Use the repository's actual authorization helper instead of a permissive mock.
  const baseline = readFileSync(new URL("../supabase/migrations/20260630010000_anointed_worship_mvp.sql", import.meta.url), "utf8");
  const helperStart = baseline.indexOf("create or replace function private.has_team_role(");
  const helperEnd = baseline.indexOf("$$;", helperStart) + 3;
  assert(helperStart >= 0 && helperEnd > helperStart, "Repository authorization helper is present");
  await db.exec(baseline.slice(helperStart, helperEnd));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261005010000_member_usage_tracking.sql", import.meta.url), "utf8"));

  async function asUser(profile, sql, role = "authenticated") {
    await db.exec(`reset role; set request.jwt.claim.sub = '${profile ?? ""}'; set role ${role};`);
    try { return await db.query(sql); }
    finally { await db.exec("reset role;"); }
  }
  async function denied(profile, sql, message, role) {
    await assert.rejects(asUser(profile, sql, role), (error) => error.code === "42501", message);
  }
  const heartbeatA = `select public.record_member_usage('${teamA}')`;
  await denied(null, heartbeatA, "Anonymous heartbeat denied", "anon");
  await denied(null, heartbeatA, "Missing identity denied even under authenticated role");
  await denied(adminB, heartbeatA, "Other-team heartbeat denied");
  await denied(inactiveA, heartbeatA, "Inactive membership heartbeat denied");

  await asUser(memberA, heartbeatA);
  await asUser(memberA, heartbeatA);
  await asUser(memberA, heartbeatA);
  let daily = (await db.query(`select * from public.member_usage_daily where member_id = '${memberIds.member}'`)).rows;
  assert.equal(daily.length, 1);
  assert.equal(daily[0].active_minutes, 1, "Repeated tabs credit only one server minute");
  assert.equal(daily[0].sessions, 1, "Repeated requests do not invent sessions");
  const today = (await db.query("select (clock_timestamp() at time zone 'UTC')::date::text as today")).rows[0].today;
  assert.equal(daily[0].usage_date.toISOString().slice(0, 10), today, "UTC date comes from the database clock");

  await db.exec(`update public.member_usage_state set last_seen_at = clock_timestamp() - interval '2 minutes', last_credited_minute = date_trunc('minute', clock_timestamp()) - interval '1 minute' where member_id = '${memberIds.member}'`);
  await asUser(memberA, heartbeatA);
  daily = (await db.query(`select * from public.member_usage_daily where member_id = '${memberIds.member}'`)).rows;
  assert.equal(daily[0].active_minutes, 2, "Next minute credits one unit without filling the two-minute gap");
  assert.equal(daily[0].sessions, 1, "Short gap retains the session");

  await db.exec(`update public.member_usage_state set last_seen_at = clock_timestamp() - interval '5 minutes', last_credited_minute = date_trunc('minute', clock_timestamp()) - interval '5 minutes' where member_id = '${memberIds.member}'`);
  await asUser(memberA, heartbeatA);
  daily = (await db.query(`select * from public.member_usage_daily where member_id = '${memberIds.member}'`)).rows;
  assert.equal(daily[0].active_minutes, 3, "Five-minute gap credits only the current minute");
  assert.equal(daily[0].sessions, 2, "Five-minute inactivity starts another session");

  await db.exec(`update public.member_usage_state set last_seen_at = clock_timestamp() - interval '1 day', last_credited_minute = date_trunc('minute', clock_timestamp()) - interval '1 day' where member_id = '${memberIds.member}'`);
  await asUser(memberA, heartbeatA);
  await asUser(adminB, `select public.record_member_usage('${teamB}')`);
  for (const table of ["member_usage_state", "member_usage_daily"]) {
    const own = await asUser(ownerA, `select * from public.${table}`);
    assert.equal(own.rows.length, 1, "Owner sees only own-team data");
    assert.equal(own.rows[0].team_id, teamA);
    const foreign = await asUser(ownerA, `select * from public.${table} where team_id = '${teamB}'`);
    assert.equal(foreign.rows.length, 0, "Owner cannot read other-team usage");
    const ordinary = await asUser(memberA, `select * from public.${table}`);
    assert.equal(ordinary.rows.length, 0, "Ordinary members cannot read analytics, including their own");
    const inactive = await asUser(inactiveA, `select * from public.${table}`);
    assert.equal(inactive.rows.length, 0, "Inactive member reads denied");
    const otherAdmin = await asUser(adminB, `select * from public.${table}`);
    assert.equal(otherAdmin.rows.length, 1, "Admin sees only own team");
    assert.equal(otherAdmin.rows[0].team_id, teamB);
    await denied(null, `select * from public.${table}`, "Anonymous table read denied", "anon");
    await denied(ownerA, `update public.${table} set team_id = '${teamB}'`, "Direct UPDATE denied, including admins");
    await denied(ownerA, `delete from public.${table}`, "Direct DELETE denied, including admins");
  }
  await denied(ownerA, `insert into public.member_usage_state values ('${memberIds.owner}', '${teamA}', now(), now())`, "Direct state INSERT denied");
  await denied(ownerA, `insert into public.member_usage_daily values ('${memberIds.owner}', '${teamA}', current_date, 100, 100)`, "Direct daily INSERT denied");
  await assert.rejects(db.exec(`insert into public.member_usage_state values ('${memberIds.owner}', '${teamB}', now(), now())`), (error) => error.code === "23503", "Mismatched team/member foreign key denied");
  await db.exec(`delete from public.team_members where id = '${memberIds.member}'`);
  assert.equal((await db.query(`select * from public.member_usage_daily where member_id = '${memberIds.member}'`)).rows.length, 0, "Member deletion removes usage");
  console.log("PASS: real PostgreSQL accounting, UTC dates, deduplication, no gap credit, session threshold, anonymous/ordinary/inactive/two-tenant reads, denied direct INSERT/UPDATE/DELETE, FK and cascade checks.");
} finally {
  await db.close();
}
