import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// Local disposable users only. Never applies migrations or accepts a remote URL.
const status = JSON.parse(execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" }));
const url = new URL(status.API_URL);
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Refusing non-local Supabase");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url.href, status.SERVICE_ROLE_KEY, options);
const anonymous = createClient(url.href, status.ANON_KEY, options);
const createdUsers = [];
const createdTeams = [];
const createdArticles = [];
const run = crypto.randomUUID();
const password = `Wooly-support-${run}!Aa1`;
async function allowed(operation) { const result = await operation; assert.equal(result.error, null, result.error?.message); return result.data; }
async function denied(operation) { const result = await operation; assert(result.error || (Array.isArray(result.data) && result.data.length === 0), "Unauthorized operation succeeded"); }
try {
  const clients = [];
  for (const label of ["a", "b", "support"]) {
    const email = `wooly-support-${label}-${run}@example.test`;
    const data = await allowed(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Wooly ${label}` } }));
    createdUsers.push(data.user.id);
    const client = createClient(url.href, status.ANON_KEY, options);
    await allowed(client.auth.signInWithPassword({ email, password })); clients.push(client);
  }
  const [a, b, support] = clients;
  // A pre-team account can ask for help; owner/admin roles never grant support.
  const requestId = crypto.randomUUID();
  const submission = { p_id: requestId, p_question: "How can I join?", p_details: "Only reviewed details", p_page_path: "/pending", p_team_id: null };
  await Promise.all([allowed(a.rpc("create_wooly_support_request", submission)), allowed(a.rpc("create_wooly_support_request", submission))]);
  assert.equal((await allowed(a.from("wooly_support_requests").select("id"))).length, 1);
  await denied(b.from("wooly_support_requests").select("*").eq("id", requestId));
  await denied(b.rpc("create_wooly_support_request", submission));
  await denied(anonymous.from("wooly_support_requests").select("*"));
  await denied(anonymous.rpc("create_wooly_support_request", submission));
  await denied(a.from("wooly_support_accounts").insert({ profile_id: createdUsers[0] }).select());
  await denied(a.from("wooly_support_accounts").select());
  await denied(a.from("wooly_support_requests").update({ profile_id: createdUsers[1] }).eq("id", requestId).select());
  await denied(a.from("wooly_support_requests").delete().eq("id", requestId).select());
  await denied(b.rpc("reply_wooly_support", { p_request_id: requestId, p_id: crypto.randomUUID(), p_body: "Forged", p_as_support: true }));
  await denied(b.rpc("reply_wooly_support", { p_request_id: requestId, p_id: crypto.randomUUID(), p_body: "Forged", p_as_support: false }));
  assert.equal(await allowed(a.rpc("is_wooly_support")), false);
  // This grants only a disposable LOCAL test account, never a real support profile.
  await allowed(admin.from("wooly_support_accounts").insert({ profile_id: createdUsers[2] }));
  assert.equal(await allowed(support.rpc("is_wooly_support")), true);
  assert.equal((await allowed(support.from("wooly_support_requests").select("id").eq("id", requestId))).length, 1);
  const replyId = crypto.randomUUID();
  const reply = { p_request_id: requestId, p_id: replyId, p_body: "Private answer", p_as_support: true };
  await Promise.all([allowed(support.rpc("reply_wooly_support", reply)), allowed(support.rpc("reply_wooly_support", reply))]);
  assert.equal((await allowed(a.from("wooly_support_messages").select("*").eq("request_id", requestId))).length, 1);
  await denied(b.from("wooly_support_messages").select("*").eq("request_id", requestId));
  assert.equal(await allowed(a.rpc("wooly_unread_count")), 1);
  assert.equal(await allowed(b.rpc("wooly_unread_count")), 0);
  const snapshot = (await allowed(a.from("wooly_support_requests").select("support_updated_at").eq("id", requestId).single())).support_updated_at;
  await allowed(support.rpc("reply_wooly_support", { ...reply, p_id: crypto.randomUUID(), p_body: "Newer private answer" }));
  await allowed(a.rpc("read_wooly_support_request", { p_id: requestId, p_read_until: snapshot }));
  assert.equal(await allowed(a.rpc("wooly_unread_count")), 1, "Concurrent newer reply was incorrectly marked read");
  await allowed(support.rpc("set_wooly_support_status", { p_id: requestId, p_status: "closed" }));
  await allowed(a.rpc("reply_wooly_support", { p_request_id: requestId, p_id: crypto.randomUUID(), p_body: "Follow-up", p_as_support: false }));
  assert.equal((await allowed(a.from("wooly_support_requests").select("status").eq("id", requestId).single())).status, "open");
  await denied(b.rpc("set_wooly_support_status", { p_id: requestId, p_status: "closed" }));
  const article = { p_id: crypto.randomUUID(), p_title: "General joining help", p_keywords: "joining code", p_answer: "Ask your leader for a code", p_audience: "everyone", p_route: "/teams/join", p_published: false };
  createdArticles.push(article.p_id);
  await denied(a.rpc("save_wooly_help_article", article));
  await allowed(support.rpc("save_wooly_help_article", article));
  await denied(a.from("wooly_help_articles").select("*").eq("id", article.p_id));
  await denied(anonymous.from("wooly_help_articles").select("*").eq("id", article.p_id));
  await allowed(support.rpc("save_wooly_help_article", { ...article, p_published: true }));
  assert.equal((await allowed(anonymous.from("wooly_help_articles").select("id").eq("id", article.p_id))).length, 1);
  await allowed(support.rpc("save_wooly_help_article", { ...article, p_published: false }));
  await denied(a.from("wooly_help_articles").select("*").eq("id", article.p_id));
  await allowed(admin.from("wooly_help_articles").delete().eq("id", article.p_id));
  for (const [index, client] of [a, b].entries()) {
    const code = `WY-${String(parseInt(run.slice(0, 8), 16) % 10_000).padStart(4, "0")}${index}`;
    const workspace = await allowed(client.rpc("create_team_workspace", { p_name: `Wooly local ${index}`, p_code: code, p_default_service_location: "Local", p_default_call_time: "08:00", p_default_rehearsal_time: "08:30" }).single());
    createdTeams.push(workspace.team_id);
    await allowed(admin.from("songs").insert({ team_id: workspace.team_id, title: `Private team ${index}`, artist: "Local test", original_key: "C", bpm: 72, lyrics_chords: "Test only", created_by: createdUsers[index] }));
  }
  for (const client of [b, support, anonymous]) await denied(client.from("songs").select("id,title").eq("team_id", createdTeams[0]));
  await denied(a.from("songs").select("id,title").eq("team_id", createdTeams[1]));
  assert.equal(await allowed(a.rpc("is_wooly_support")), false, "Team owner gained support role");
  await denied(a.rpc("create_wooly_support_request", { ...submission, p_id: crypto.randomUUID(), p_team_id: createdTeams[1] }));
  console.log("Wooly support isolation passed: anonymous, pre-team, two teams, role escalation, retries, private/published help, unread races and follow-ups.");
} finally {
  const errors = [];
  // Delete only IDs created in this run. Preserve all existing local fixtures.
  for (const id of createdArticles) { const result = await admin.from("wooly_help_articles").delete().eq("id", id); if (result.error) errors.push(result.error.message); }
  for (const id of createdTeams) { const result = await admin.from("teams").delete().eq("id", id); if (result.error) errors.push(result.error.message); }
  for (const id of createdUsers) { const result = await admin.auth.admin.deleteUser(id); if (result.error) errors.push(result.error.message); }
  if (errors.length) throw new Error(`Local cleanup failed: ${errors.join("; ")}`);
}
