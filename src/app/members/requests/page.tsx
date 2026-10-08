import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { JoinRequestsClient } from "@/components/join-requests-client";
import { ButtonLink } from "@/components/ui/button";
import {
  joinRequestWithRequesterProfileSelect,
  normalizeJoinRequest,
  type RawJoinRequest,
} from "@/lib/domain/join-requests";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { JoinRequestSummary } from "@/lib/types";

export default async function MemberRequestsPage() {
  const teamContext = await getRequiredTeamContext();

  if (teamContext.userId && !teamContext.canManageMembers) {
    redirect("/dashboard");
  }

  let pendingRequests: JoinRequestSummary[] = [];
  let requestsError: string | undefined;

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("join_requests")
      .select(joinRequestWithRequesterProfileSelect)
      .eq("team_id", teamContext.teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    pendingRequests = (data ?? []).map((request) => normalizeJoinRequest(request as RawJoinRequest));
    if (error) requestsError = "Pending requests could not be loaded. Retry when connected.";
  }

  return (
    <AppShell active="Team Management" teamContext={teamContext}>
      <div className="mb-5">
        <ButtonLink href="/members" variant="secondary" className="h-9 rounded-lg px-3 text-xs">
          Back to Team
        </ButtonLink>
      </div>
      <JoinRequestsClient initialRequests={pendingRequests} teamId={teamContext.teamId} initialError={requestsError} canAssignRoles={teamContext.role === "owner" || teamContext.role === "admin"} />
    </AppShell>
  );
}
