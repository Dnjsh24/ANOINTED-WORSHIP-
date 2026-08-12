import type { SupabaseClient } from "@supabase/supabase-js";
import { can, type Permission } from "@/lib/domain/rbac";
import { resolvePostLoginPath, type PostLoginPath } from "@/lib/domain/post-login";
import { appName, teamCode } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { getDesktopTeamContext, saveDesktopTeamContext } from "@/lib/desktop/workspace";
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
  rolePermissions?: Permission[];
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

  if (isDesktopRuntime()) {
    const localContext = getDesktopTeamContext();
    if (localContext) {
      return localContext;
    }

    // First desktop sign-in needs the cloud once so the local workspace can be bootstrapped.
    try {
      const supabase = await createClient();
      const cloudContext = await getCurrentTeamContextForClient(supabase);
      if (cloudContext.userId && cloudContext.teamId && cloudContext.memberId) {
        saveDesktopTeamContext(cloudContext);
        // DesktopSyncStatus performs the first content download immediately
        // after this cached context is available. Keeping that work out of the
        // auth guard lets an offline restart remain entirely local.
      }
      return cloudContext;
    } catch {
      return unauthenticatedTeamContext;
    }
  }

  const supabase = await createClient();
  return getCurrentTeamContextForClient(supabase);
}

export async function getCurrentTeamContextForClient(supabase: SupabaseClient<Database>): Promise<TeamContext> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id) {
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
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pendingRequest } = await supabase
    .from("join_requests")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (!member) {
    return {
      ...unauthenticatedTeamContext,
      userId: user.id,
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

  const { data: rolePermissionPolicy } = await supabase
    .from("team_role_permissions")
    .select("permissions")
    .eq("team_id", member.team_id)
    .eq("role", member.role)
    .maybeSingle();
  const rolePermissions = rolePermissionPolicy
    ? (rolePermissionPolicy.permissions as Permission[])
    : undefined;

  const team = Array.isArray(member.teams) ? member.teams[0] : member.teams;

  return {
    userId: user.id,
    teamId: member.team_id,
    memberId: member.id,
    teamName: team?.name ?? appName,
    teamCode: team?.code ?? null,
    role: member.role,
    customPermissions,
    rolePermissions,
    canManageMembers: can(member.role, "members.manage", customPermissions, rolePermissions),
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
