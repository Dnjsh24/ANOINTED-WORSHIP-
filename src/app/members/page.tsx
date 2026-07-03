import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MembersClient } from "@/components/members-client";
import {
  joinRequestWithRequesterProfileSelect,
  normalizeJoinRequest,
  type RawJoinRequest,
} from "@/lib/domain/join-requests";
import {
  members as sampleMembers,
  pendingRequests as samplePendingRequests,
  teamCode as sampleTeamCode,
} from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { TeamMember, TeamRole } from "@/lib/types";

export default async function MembersPage() {
  const teamContext = await getRequiredTeamContext();

  if (teamContext.userId && !teamContext.canManageMembers) {
    redirect("/dashboard");
  }

  // When Supabase is configured and user has a team, fetch real data
  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const [{ data: dbPendingRequests }, { data: dbMembers }] = await Promise.all([
      supabase
        .from("join_requests")
        .select(joinRequestWithRequesterProfileSelect)
        .eq("team_id", teamContext.teamId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("team_members")
        .select(`
          id,
          profile_id,
          role,
          status,
          ministry,
          profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `)
        .eq("team_id", teamContext.teamId)
        .order("created_at", { ascending: true }),
    ]);

    const pendingRequests = (dbPendingRequests ?? []).map((request) => normalizeJoinRequest(request as RawJoinRequest));

    const members: TeamMember[] = (dbMembers ?? []).map((tm: any) => {
      const profile = tm.profiles;
      return {
        id: tm.id,
        profile: {
          id: profile?.id ?? tm.profile_id,
          fullName: profile?.full_name ?? "Unknown",
          email: profile?.email ?? "",
          avatarUrl: profile?.avatar_url ?? undefined,
        },
        role: (tm.role as TeamRole) ?? "member",
        status: (tm.status as "active" | "inactive") ?? "active",
        attendanceRate: 0,
        ministry: tm.ministry ?? "",
      };
    });

    return (
      <AppShell active="Team Management" teamContext={teamContext}>
        <MembersClient
          members={members}
          pendingRequests={pendingRequests}
          teamCode={teamContext.teamCode ?? sampleTeamCode}
          teamId={teamContext.teamId}
        />
      </AppShell>
    );
  }

  // Fallback to sample data when Supabase is not configured (demo mode)
  return (
    <AppShell active="Team Management" teamContext={teamContext}>
      <MembersClient
        members={sampleMembers}
        pendingRequests={samplePendingRequests}
        teamCode={teamContext.teamCode ?? sampleTeamCode}
        teamId={null}
      />
    </AppShell>
  );
}
