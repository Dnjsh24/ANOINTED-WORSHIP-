import type { SupabaseClient } from "@supabase/supabase-js";
import { can, assertRole } from "@/lib/domain/rbac";
import { resolvePostLoginPath, type PostLoginPath } from "@/lib/domain/post-login";
import { appName, teamCode } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { TeamRole } from "@/lib/types";

export interface TeamContext {
  userId: string | null;
  teamId: string | null;
  memberId: string | null;
  teamName: string;
  teamCode: string | null;
  role: TeamRole;
  canManageMembers: boolean;
  hasPendingJoinRequest: boolean;
}

export const demoTeamContext: TeamContext = {
  userId: null,
  teamId: "demo-team",
  memberId: "demo-member",
  teamName: appName,
  teamCode,
  role: "owner",
  canManageMembers: true,
  hasPendingJoinRequest: false,
};

export const unauthenticatedTeamContext: TeamContext = {
  userId: null,
  teamId: null,
  memberId: null,
  teamName: appName,
  teamCode: null,
  role: "member",
  canManageMembers: false,
  hasPendingJoinRequest: false,
};

export async function getCurrentTeamContext(): Promise<TeamContext> {
  if (!hasSupabaseEnv()) {
    return demoTeamContext;
  }

  const supabase = await createClient();
  return getCurrentTeamContextForClient(supabase);
}

export async function getCurrentTeamContextForClient(supabase: SupabaseClient<Database>): Promise<TeamContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthenticatedTeamContext;
  }

  const [membershipResult, pendingRequestResult] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, team_id, role, status, teams (id, name, code)")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("join_requests")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle(),
  ]);

  const membership = membershipResult.data as any;
  const pendingRequest = pendingRequestResult.data;

  if (membership && membership.teams) {
    const role = assertRole(membership.role);
    return {
      userId: user.id,
      teamId: membership.team_id,
      memberId: membership.id,
      teamName: membership.teams.name,
      teamCode: membership.teams.code ?? null,
      role,
      canManageMembers: can(role, "members.manage"),
      hasPendingJoinRequest: false,
    };
  }

  return {
    userId: user.id,
    teamId: null,
    memberId: null,
    teamName: appName,
    teamCode: null,
    role: "member",
    canManageMembers: false,
    hasPendingJoinRequest: Boolean(pendingRequest),
  };
}

export async function getPostLoginRedirectPath(supabase: SupabaseClient<Database>): Promise<PostLoginPath> {
  const context = await getCurrentTeamContextForClient(supabase);

  return resolvePostLoginPath({
    hasActiveMembership: Boolean(context.teamId),
    hasPendingJoinRequest: context.hasPendingJoinRequest,
  });
}
