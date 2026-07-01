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
  teamName: string;
  teamCode: string | null;
  role: TeamRole;
  canManageMembers: boolean;
  hasPendingJoinRequest: boolean;
}

export const demoTeamContext: TeamContext = {
  userId: null,
  teamId: "demo-team",
  teamName: appName,
  teamCode,
  role: "owner",
  canManageMembers: true,
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
    return demoTeamContext;
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id, role, status")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membership) {
    const role = assertRole(membership.role);
    const { data: team } = await supabase.from("teams").select("id, name, code").eq("id", membership.team_id).maybeSingle();

    if (team) {
      return {
        userId: user.id,
        teamId: membership.team_id,
        teamName: team.name,
        teamCode: team.code ?? null,
        role,
        canManageMembers: can(role, "members.manage"),
        hasPendingJoinRequest: false,
      };
    }
  }

  const { data: pendingRequest } = await supabase
    .from("join_requests")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  return {
    userId: user.id,
    teamId: null,
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
