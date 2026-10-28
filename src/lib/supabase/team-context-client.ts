import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { PERMISSION_LABELS, type Permission } from '@/lib/domain/rbac';
import { appName } from '@/lib/sample-data';
import type { TeamRole } from '@/lib/types';
import { canForTeam, type PermissionOverrides } from '@/lib/domain/permission-overrides';
import { loadTeamPermissionOverrides } from '@/lib/server/team-permissions';

export interface TeamContext {
  userId: string | null;
  teamId: string | null;
  memberId: string | null;
  teamName: string;
  teamCode: string | null;
  role: TeamRole | string;
  customPermissions?: Permission[];
  permissionOverrides?: PermissionOverrides;
  canManageMembers: boolean;
  hasPendingJoinRequest: boolean;
}

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

export class TeamContextReadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function getCurrentTeamContextForClient(supabase: SupabaseClient<Database>, options: { throwOnReadError?: boolean; teamId?: string; accessToken?: string } = {}): Promise<TeamContext> {
  const { data: { user }, error: userError } = await supabase.auth.getUser(options.accessToken);
  if (userError || !user?.id) {
    if (options.throwOnReadError && userError) {
      throw new TeamContextReadError(isAuthRetryableFetchError(userError) && !userError.status ? 0 : (userError.status ?? 401), 'Account verification failed.');
    }
    return unauthenticatedTeamContext;
  }

  let membershipQuery = supabase
    .from("team_members")
    .select(`
      id,
      team_id,
      role,
      status,
      custom_role_id,
      custom_roles (
        team_id,
        permissions
      ),
      teams (
        name,
        code
      )
    `)
    .eq("profile_id", user.id)
    .eq("status", "active");
  if (options.teamId) membershipQuery = membershipQuery.eq('team_id', options.teamId);
  const [memberResult, pendingRequestResult] = await Promise.all([
    membershipQuery.order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
    .from("join_requests")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle(),
  ]);
  if (options.throwOnReadError) {
    if (memberResult.error) throw new TeamContextReadError(memberResult.status, 'Team membership could not be loaded.');
    if (pendingRequestResult.error) throw new TeamContextReadError(pendingRequestResult.status, 'Membership request could not be loaded.');
  }
  const member = memberResult.data;
  const pendingRequest = pendingRequestResult.data;

  if (!member) {
    return {
      ...unauthenticatedTeamContext,
      userId: user.id,
      hasPendingJoinRequest: Boolean(pendingRequest),
    };
  }

  const customRole = member.custom_roles;
  const customPermissions = customRole?.team_id === member.team_id
    ? (customRole.permissions ?? []).filter((permission): permission is Permission => Object.hasOwn(PERMISSION_LABELS, permission))
    : [];

  const permissionOverrides = await loadTeamPermissionOverrides(supabase, member.team_id, member.role, member.id);

  const team = Array.isArray(member.teams) ? member.teams[0] : member.teams;

  return {
    userId: user.id,
    teamId: member.team_id,
    memberId: member.id,
    teamName: team?.name ?? appName,
    teamCode: team?.code ?? null,
    role: member.role,
    customPermissions,
    permissionOverrides,
    canManageMembers: canForTeam({ role: member.role, customPermissions, permissionOverrides }, "members.manage"),
    hasPendingJoinRequest: Boolean(pendingRequest),
  };
}

