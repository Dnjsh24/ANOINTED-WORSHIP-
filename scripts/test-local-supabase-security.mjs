import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function assertLocalApi(url) {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Refusing to run security integration tests against non-local Supabase: ${url}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectDenied(operation, message) {
  const result = await operation();
  const changedRows = Array.isArray(result.data) ? result.data.length : null;
  assert(result.error || changedRows === 0, message);
}

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
assertLocalApi(status.API_URL);

const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const runId = crypto.randomUUID();
const codeSuffixA = String(Number.parseInt(runId.slice(0, 8), 16) % 100_000).padStart(5, "0");
const codeSuffixB = String(Number.parseInt(runId.slice(9, 17).replace("-", ""), 16) % 100_000).padStart(5, "0");
const password = `Local-only-${runId}!aA1`;
const userSpecs = ["owner", "admin", "requester"].map((role) => ({
  role,
  email: `security-${role}-${runId}@example.test`,
}));
const createdUserIds = [];
let phase = "create users";

try {
  const users = {};
  for (const spec of userSpecs) {
    const { data, error } = await service.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Security ${spec.role}` },
    });
    if (error || !data.user) throw error ?? new Error(`Could not create ${spec.role}`);
    users[spec.role] = data.user;
    createdUserIds.push(data.user.id);
  }

  phase = "sign in users";
  const sessions = {};
  for (const spec of userSpecs) {
    const client = createClient(status.API_URL, status.ANON_KEY, anonOptions);
    const { error } = await client.auth.signInWithPassword({ email: spec.email, password });
    if (error) throw error;
    sessions[spec.role] = client;
  }

  phase = "create team A";
  const { data: workspace, error: workspaceError } = await sessions.owner
    .rpc("create_team_workspace", {
      p_name: "Security Team A",
      p_code: `QA-${codeSuffixA}`,
      p_default_service_location: "Local",
      p_default_call_time: "08:00",
      p_default_rehearsal_time: "08:30",
    })
    .single();
  if (workspaceError || !workspace) throw workspaceError ?? new Error("Team A was not created");
  const teamA = workspace.team_id;
  const ownerMemberId = workspace.team_member_id;

  phase = "add admin membership";
  const { data: adminMember, error: adminMemberError } = await sessions.owner
    .from("team_members")
    .insert({
      team_id: teamA,
      profile_id: users.admin.id,
      role: "admin",
      status: "active",
    })
    .select("id")
    .single();
  if (adminMemberError || !adminMember) throw adminMemberError ?? new Error("Admin membership failed");

  phase = "owner mutation denials";
  await expectDenied(
    () => sessions.admin.from("team_members").update({ role: "owner" }).eq("id", adminMember.id).select("id"),
    "Admin was able to promote themself to owner",
  );
  await expectDenied(
    () => sessions.admin.from("team_members").update({ role: "member" }).eq("id", ownerMemberId).select("id"),
    "Admin was able to demote the owner",
  );
  await expectDenied(
    () => sessions.admin.from("team_members").delete().eq("id", ownerMemberId).select("id"),
    "Admin was able to delete the owner",
  );

  phase = "ownership transfers";
  const transferToAdmin = await sessions.owner.rpc("transfer_team_ownership", {
    p_team_id: teamA,
    p_new_owner_member_id: adminMember.id,
  });
  if (transferToAdmin.error) throw transferToAdmin.error;
  const transferBack = await sessions.admin.rpc("transfer_team_ownership", {
    p_team_id: teamA,
    p_new_owner_member_id: ownerMemberId,
  });
  if (transferBack.error) throw transferBack.error;
  const { count: ownerCount } = await sessions.owner
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamA)
    .eq("role", "owner");
  assert(ownerCount === 1, `Ownership transfer left ${ownerCount} owners`);

  phase = "join request boundaries";
  await expectDenied(
    () => sessions.requester.from("join_requests").insert({
      team_id: teamA,
      profile_id: users.requester.id,
      requested_role: "owner",
      status: "pending",
    }),
    "Requester was able to manufacture an owner join request",
  );
  const { data: joinRequest, error: joinError } = await sessions.requester
    .from("join_requests")
    .insert({
      team_id: teamA,
      profile_id: users.requester.id,
      requested_role: "member",
      status: "pending",
    })
    .select("id")
    .single();
  if (joinError || !joinRequest) throw joinError ?? new Error("Valid join request failed");
  const reviewed = await sessions.admin.rpc("review_join_request", {
    p_request_id: joinRequest.id,
    p_decision: "approved",
  });
  if (reviewed.error) throw reviewed.error;
  const { data: requesterTeamAMember } = await sessions.admin
    .from("team_members")
    .select("id")
    .eq("team_id", teamA)
    .eq("profile_id", users.requester.id)
    .single();
  assert(requesterTeamAMember, "Approved requester membership was not created");

  phase = "create team B";
  const { data: workspaceB, error: workspaceBError } = await sessions.owner
    .rpc("create_team_workspace", {
      p_name: "Security Team B",
      p_code: `QB-${codeSuffixB}`,
      p_default_service_location: "Local",
      p_default_call_time: "09:00",
      p_default_rehearsal_time: "09:30",
    })
    .single();
  if (workspaceBError || !workspaceB) throw workspaceBError ?? new Error("Team B was not created");
  const teamB = workspaceB.team_id;

  phase = "add requester to team B";
  const { data: requesterTeamBMember, error: teamBMemberError } = await sessions.owner
    .from("team_members")
    .insert({
      team_id: teamB,
      profile_id: users.requester.id,
      role: "member",
      status: "active",
    })
    .select("id")
    .single();
  if (teamBMemberError || !requesterTeamBMember) throw teamBMemberError ?? new Error("Team B member failed");

  phase = "attendance boundaries";
  const { data: eventB, error: eventError } = await sessions.owner
    .from("events")
    .insert({
      team_id: teamB,
      type: "service",
      name: "Local security event",
      event_date: "2026-08-03",
      starts_at: "09:00",
      approval_status: "approved",
      created_by: users.owner.id,
    })
    .select("id")
    .single();
  if (eventError || !eventB) throw eventError ?? new Error("Event B failed");

  await expectDenied(
    () => sessions.requester.from("attendance").insert({
      event_id: eventB.id,
      team_member_id: requesterTeamAMember.id,
      status: "available",
    }),
    "Cross-team attendance was accepted",
  );
  const validAttendance = await sessions.requester.from("attendance").insert({
    event_id: eventB.id,
    team_member_id: requesterTeamBMember.id,
    status: "available",
  });
  if (validAttendance.error) throw validAttendance.error;

  phase = "setlist relationship boundaries";
  const [{ data: songA, error: songAError }, { data: songB, error: songBError }, { data: setlistA, error: setlistError }] = await Promise.all([
    sessions.owner.from("songs").insert({
      team_id: teamA, title: "Song A", artist: "Local", original_key: "C",
      time_signature: "4/4", lyrics_chords: "C", status: "approved", created_by: users.owner.id,
    }).select("id").single(),
    sessions.owner.from("songs").insert({
      team_id: teamB, title: "Song B", artist: "Local", original_key: "D",
      time_signature: "4/4", lyrics_chords: "D", status: "approved", created_by: users.owner.id,
    }).select("id").single(),
    sessions.owner.from("setlists").insert({
      team_id: teamA, name: "Local security setlist", setlist_date: "2026-08-03",
      created_by: users.owner.id,
    }).select("id").single(),
  ]);
  if (songAError || songBError || setlistError || !songA || !songB || !setlistA) {
    throw songAError ?? songBError ?? setlistError ?? new Error("Setlist fixtures failed");
  }

  await expectDenied(
    () => sessions.admin.from("setlist_songs").insert({
      setlist_id: setlistA.id,
      song_id: songB.id,
      song_order: 1,
      assigned_key: "D",
    }),
    "Cross-team setlist song was accepted",
  );
  const validSetlistSong = await sessions.admin.from("setlist_songs").insert({
    setlist_id: setlistA.id,
    song_id: songA.id,
    song_order: 1,
    assigned_key: "C",
  });
  if (validSetlistSong.error) throw validSetlistSong.error;

  process.stdout.write(JSON.stringify({
    ok: true,
    checks: [
      "owner escalation denied",
      "owner demotion denied",
      "owner deletion denied",
      "ownership transfer atomic",
      "privileged join request denied",
      "join review atomic",
      "cross-team attendance denied",
      "same-team attendance accepted",
      "cross-team setlist song denied",
      "same-team setlist song accepted",
    ],
  }, null, 2) + "\n");
} catch (error) {
  throw new Error(`Local Supabase security test failed during: ${phase}`, { cause: error });
} finally {
  for (const userId of createdUserIds.reverse()) {
    await service.auth.admin.deleteUser(userId);
  }
}
