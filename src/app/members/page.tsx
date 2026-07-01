import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MembersClient } from "@/components/members-client";
import {
  members as sampleMembers,
  pendingRequests as samplePendingRequests,
  teamCode as sampleTeamCode,
} from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import type { TeamMember, TeamRole } from "@/lib/types";

export default async function MembersPage() {
  const teamContext = await getCurrentTeamContext();

  if (teamContext.userId && !teamContext.canManageMembers) {
    redirect("/dashboard");
  }

  // When Supabase is configured and user has a team, fetch real data
  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch pending join requests for this team
    const { data: dbPendingRequests } = await supabase
      .from("join_requests")
      .select("id, profile_id, requested_role")
      .eq("team_id", teamContext.teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Collect profile IDs from join requests to fetch their names
    const pendingProfileIds = (dbPendingRequests ?? []).map((jr) => jr.profile_id);

    // Fetch profiles of pending requesters (separate query to avoid RLS join issues)
    let pendingProfilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (pendingProfileIds.length > 0) {
      const { data: pendingProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", pendingProfileIds);

      pendingProfilesMap = Object.fromEntries(
        (pendingProfiles ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
      );
    }

    const pendingRequests = (dbPendingRequests ?? []).map((jr) => {
      const profile = pendingProfilesMap[jr.profile_id];
      const name = profile?.full_name ?? profile?.email ?? "Unknown";
      const initials = name
        .split(" ")
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);
      return {
        id: jr.id,
        initials,
        name,
        ministry: jr.requested_role?.replace("_", " ") ?? "Member",
      };
    });

    // Fetch active team members
    const { data: dbMembers } = await supabase
      .from("team_members")
      .select("id, profile_id, role, status, ministry")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true });

    // Collect profile IDs from team members
    const memberProfileIds = (dbMembers ?? []).map((tm) => tm.profile_id);

    // Fetch profiles for all team members
    let memberProfilesMap: Record<string, { id: string; full_name: string | null; email: string | null; avatar_url: string | null }> = {};
    if (memberProfileIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", memberProfileIds);

      memberProfilesMap = Object.fromEntries(
        (memberProfiles ?? []).map((p) => [p.id, { id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url }])
      );
    }

    const members: TeamMember[] = (dbMembers ?? []).map((tm) => {
      const profile = memberProfilesMap[tm.profile_id];
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
