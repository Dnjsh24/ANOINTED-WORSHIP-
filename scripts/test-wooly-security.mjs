import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// Reads the local CLI status only. Never applies migrations, resets, or accepts a remote URL.
const status = JSON.parse(execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" }));
const url = new URL(status.API_URL);
assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Refusing non-local Supabase");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url.href, status.SERVICE_ROLE_KEY, options);
const anonymous = createClient(url.href, status.ANON_KEY, options);
const created = [];
const runId = crypto.randomUUID();
const password = `Wooly-local-${runId}!Aa1`;
const table = "wooly_tutorial_progress";
async function allowed(operation) {
  const result = await operation;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
async function denied(operation) {
  const result = await operation;
  assert(result.error || (Array.isArray(result.data) && result.data.length === 0), "Unauthorized operation succeeded");
}
try {
  const clients = [];
  for (const label of ["a", "b"]) {
    const email = `wooly-${label}-${runId}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Wooly ${label}` } });
    assert.equal(error, null);
    created.push(data.user.id);
    const client = createClient(url.href, status.ANON_KEY, options);
    await allowed(client.auth.signInWithPassword({ email, password }));
    clients.push(client);
  }
  const [a, b] = clients;
  const base = { profile_id: created[0], tour_id: "joining", version: 1, status: "in_progress", next_step: "code" };
  // Newly created users have no team: their own onboarding checkpoint must still work.
  assert.deepEqual(await allowed(a.from("team_members").select("id").eq("profile_id", created[0])), []);
  await allowed(a.from(table).insert(base).select());
  await allowed(b.from(table).insert({ ...base, profile_id: created[1] }).select());
  await denied(anonymous.from(table).select());
  await denied(anonymous.from(table).insert(base).select());
  await denied(anonymous.from(table).update({ status: "paused" }).eq("profile_id", created[0]).select());
  await denied(anonymous.from(table).delete().eq("profile_id", created[0]).select());
  await denied(b.from(table).select().eq("profile_id", created[0]));
  await denied(b.from(table).insert({ ...base, tour_id: "creating", next_step: "details" }).select());
  await denied(b.from(table).update({ status: "paused" }).eq("profile_id", created[0]).select());
  await denied(a.from(table).update({ profile_id: created[1] }).eq("profile_id", created[0]).select());
  await denied(a.from(table).delete().eq("profile_id", created[0]).select());
  await denied(a.from(table).insert({ ...base, version: 2 }).select());
  await denied(a.from(table).update({ next_step: "bogus" }).eq("profile_id", created[0]).select());
  await allowed(a.from(table).update({ status: "paused", next_step: "role" }).eq("profile_id", created[0]).select());
  let rows = await allowed(a.from(table).upsert({ ...base, status: "offered", next_step: "welcome" }).select());
  assert.equal(rows[0].status, "paused");
  assert.equal(rows[0].next_step, "role");
  await allowed(a.from(table).update({ status: "completed", next_step: "request" }).eq("profile_id", created[0]).select());
  // Concurrent stale writes are serialized by PostgreSQL and cannot undo completion.
  const responses = await Promise.all(["offered", "in_progress", "paused", "skipped"].map((state) => allowed(a.from(table).upsert({ ...base, status: state }).select())));
  for (const response of responses) {
    assert.equal(response[0].status, "completed");
    assert.equal(response[0].next_step, "request");
  }
  await allowed(b.from(table).update({ status: "skipped" }).eq("profile_id", created[1]).select());
  rows = await allowed(b.from(table).upsert({ ...base, profile_id: created[1], status: "completed" }).select());
  assert.equal(rows[0].status, "skipped");
  console.log("Wooly local security checks passed: two accounts, pre-team, anonymous, ownership, deletion, terminal and invitation races.");
} finally {
  // Auth deletion cascades only the disposable profiles/checkpoints created by this run.
  const cleanupErrors = [];
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) cleanupErrors.push(`Could not clean up disposable local user ${id}: ${error.message}`);
  }
  if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '));
}
