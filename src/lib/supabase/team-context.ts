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
  role: TeamRole | string;
  customPermissions?: Permission[];
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return unauthenticatedTeamContext;
  }

  const { data: member } = await supabase
    .from("team_members")
    .select(`
      id,
      team_id,
      role,
      status,
      custom_role_id,
      teams (
        name,
        code
      )
    `)
    .eq("profile_id", session.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pendingRequest } = await supabase
    .from("join_requests")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (!member) {
    return {
      ...unauthenticatedTeamContext,
      userId: session.user.id,
      hasPendingJoinRequest: Boolean(pendingRequest),
    };
  }

  let customPermissions: Permission[] = [];
  if (member.custom_role_id) {
    const { data: customRole } = await supabase
      .from("custom_roles")
      .select("permissions")
      .eq("id", member.custom_role_id)
      .single();
    if (customRole) {
      customPermissions = (customRole.permissions as Permission[]) || [];
    }
  }

  return {
    userId: session.user.id,
    teamId: member.team_id,
    memberId: member.id,
    teamName: member.teams?.name ?? appName,
    teamCode: member.teams?.code ?? null,
    role: member.role,
    customPermissions,
    canManageMembers: can(member.role, "members.manage", customPermissions),
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
