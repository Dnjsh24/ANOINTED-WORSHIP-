import { redirect } from "next/navigation";
import { PendingClient } from "@/components/pending-client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { appName } from "@/lib/sample-data";

export default async function PendingPage() {
  // If Supabase is not configured, render demo/static page
  if (!hasSupabaseEnv()) {
    return <PendingClient userId="demo-user" requestId="demo-request" initialTeamName={appName} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Check if user already has an active team membership
  const { data: membership } = await supabase
    .from("team_members")
    .select("id, team_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membership?.team_id) {
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("id", membership.team_id)
      .maybeSingle();

    if (team) {
      redirect("/dashboard");
    }
  }

  // 2. Check if user has a pending join request
  const { data: request } = await supabase
    .from("join_requests")
    .select("id, team_id, requested_role, created_at")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!request) {
    // No pending request and no active membership: send to join team page
    redirect("/teams/join");
  }

  // 3. Fetch the team name
  const { data: team } = await supabase
    .from("teams")
    .select("name, code")
    .eq("id", request.team_id)
    .limit(1)
    .maybeSingle();

  const teamName = team?.name ?? appName;

  return (
    <PendingClient
      userId={user.id}
      requestId={request.id}
      initialTeamName={teamName}
      requestedRole={request.requested_role}
      requestedAt={request.created_at}
      teamCode={team?.code ?? null}
    />
  );
}
