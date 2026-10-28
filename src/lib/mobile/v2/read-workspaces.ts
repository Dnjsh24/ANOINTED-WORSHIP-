import { z } from "zod";
import { canForTeam, editablePermissions, resolvePermissionOverrides } from "@/lib/domain/permission-overrides";
import { permissionValues } from "@/lib/domain/wooly-permissions";
import { teamRoles } from "@/lib/types";
import {
  MOBILE_V2_PAGE_SIZE, mobileSelectedWorkspaceSchema, mobileWorkspacesRequestSchema, mobileWorkspacesResponseSchema,
  type MobileWorkspace, type MobileWorkspacesRequest, type MobileWorkspacesResponse,
} from "@/lib/mobile/v2/workspaces";
import { MobileApiError } from "../errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
export type WorkspaceReadContext = { client: SupabaseClient<Database>; userId: string };

const membershipSelect = "id,team_id,profile_id,role,status,custom_role_id,custom_roles(id,team_id,permissions),teams(name)";
const membershipSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), role: z.enum(teamRoles), status: z.literal("active"),
  custom_role_id: z.uuid().nullable(),
  custom_roles: z.object({ id: z.uuid(), team_id: z.uuid(), permissions: z.array(z.enum(permissionValues)).nullable() }).nullable(),
  teams: z.object({ name: z.string().min(1).max(160) }),
});
type Membership = z.infer<typeof membershipSchema>;
const overrideSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), role: z.enum(teamRoles).nullable(), member_id: z.uuid().nullable(),
  permission: z.enum(editablePermissions), allowed: z.boolean(),
}).refine(row => (row.role === null) !== (row.member_id === null));
const unavailable = () => new MobileApiError(503, "unavailable", "Workspaces are unavailable. Try again later.");

async function projectMemberships({ client, userId }: WorkspaceReadContext, members: Membership[]): Promise<MobileWorkspace[]> {
  for (const member of members) {
    if (member.profile_id !== userId) throw unavailable();
    if (member.custom_role_id && (member.custom_roles?.id !== member.custom_role_id || member.custom_roles.team_id !== member.team_id)) {
      throw new MobileApiError(403, "membership", "This workspace membership is unavailable.");
    }
  }
  const teamIds = members.filter(member => member.role !== "owner").map(member => member.team_id);
  let overrides: z.infer<typeof overrideSchema>[] = [];
  if (teamIds.length) {
    // Share the website's resolver; v2 must surface read failures instead of claiming empty permissions.
    const roles = [...new Set(members.map(member => member.role))];
    const targets = `role.in.(${roles.join(",")}),member_id.in.(${members.map(member => member.id).join(",")})`;
    let after: string | undefined;
    // Page overrides too: a PostgREST row cap must never silently hide a deny.
    for (;;) {
      let query = client.from("team_permission_overrides").select("id,team_id,role,member_id,permission,allowed")
        .in("team_id", teamIds).or(targets).order("id", { ascending: true }).limit(MOBILE_V2_PAGE_SIZE + 1);
      if (after) query = query.gt("id", after);
      const result = await query;
      const parsed = z.array(overrideSchema).max(MOBILE_V2_PAGE_SIZE + 1).safeParse(result.data);
      if (result.error || !parsed.success || parsed.data.some((row, index) => !teamIds.includes(row.team_id)
        || (after && row.id <= after) || (index > 0 && row.id <= parsed.data[index - 1].id))) throw unavailable();
      overrides = overrides.concat(parsed.data);
      // A PostgREST cap may be lower than the requested limit. Only an empty page proves exhaustion.
      if (!parsed.data.length) break;
      after = parsed.data.at(-1)?.id;
    }
  }
  return members.map(member => {
    const context = {
      role: member.role,
      customPermissions: member.custom_role_id ? member.custom_roles?.permissions ?? [] : [],
      permissionOverrides: resolvePermissionOverrides(overrides.filter(row => row.team_id === member.team_id), member.role, member.id),
    };
    return {
      teamId: member.team_id, memberId: member.id, teamName: member.teams.name, role: member.role,
      permissions: permissionValues.filter(permission => canForTeam(context, permission)),
    };
  });
}

export async function readMobileWorkspaces({ input, ...context }: WorkspaceReadContext & { input: MobileWorkspacesRequest }): Promise<MobileWorkspacesResponse> {
  z.uuid().parse(context.userId);
  input = mobileWorkspacesRequestSchema.parse(input);
  const readMembershipPage = async () => {
    const rows: Membership[] = [];
    let after = input.after;
    while (rows.length < MOBILE_V2_PAGE_SIZE + 1) {
      const remaining = MOBILE_V2_PAGE_SIZE + 1 - rows.length;
      let query = context.client.from("team_members").select(membershipSelect)
        .eq("profile_id", context.userId).eq("status", "active").order("team_id", { ascending: true }).limit(remaining);
      if (after) query = query.gt("team_id", after);
      const result = await query;
      const parsed = z.array(membershipSchema).max(remaining).safeParse(result.data);
      if (result.error || !parsed.success || parsed.data.some((member, index) => member.profile_id !== context.userId
        || (after && member.team_id <= after) || (index > 0 && member.team_id <= parsed.data[index - 1].team_id))) throw unavailable();
      if (!parsed.data.length) break;
      rows.push(...parsed.data);
      after = parsed.data.at(-1)?.team_id;
    }
    return rows;
  };
  const [memberRows, pendingResult] = await Promise.all([
    readMembershipPage(),
    context.client.from("join_requests").select("id").eq("profile_id", context.userId).eq("status", "pending").limit(1),
  ]);
  const pending = z.array(z.object({ id: z.uuid() })).max(1).safeParse(pendingResult.data);
  if (pendingResult.error || !pending.success) throw unavailable();
  const memberships = await projectMemberships(context, memberRows.slice(0, MOBILE_V2_PAGE_SIZE));
  const response = mobileWorkspacesResponseSchema.safeParse({
    version: 2, userId: context.userId, memberships,
    nextId: memberRows.length > MOBILE_V2_PAGE_SIZE ? memberships.at(-1)?.teamId : null,
    pendingJoin: pending.data.length > 0,
  });
  if (!response.success) throw unavailable();
  return response.data;
}

export async function readSelectedWorkspace({ teamId, ...context }: WorkspaceReadContext & { teamId: string }): Promise<MobileWorkspace> {
  z.uuid().parse(context.userId);
  mobileSelectedWorkspaceSchema.parse({ version: 2, teamId });
  const result = await context.client.from("team_members").select(membershipSelect)
    .eq("profile_id", context.userId).eq("status", "active").eq("team_id", teamId).limit(1).maybeSingle();
  if (result.error) throw unavailable();
  if (!result.data) throw new MobileApiError(403, "membership", "Active membership in this workspace is required.");
  const member = membershipSchema.safeParse(result.data);
  if (!member.success || member.data.team_id !== teamId) throw unavailable();
  const [workspace] = await projectMemberships(context, [member.data]);
  return workspace;
}
