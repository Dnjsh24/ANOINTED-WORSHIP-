import { z } from "zod";
import { can, type Permission } from "@/lib/domain/rbac";
import { teamRoles } from "@/lib/types";

export const editablePermissions = ["setlists.manage", "songs.create", "songs.edit", "files.upload", "members.manage", "events.manage", "team.manage"] as const satisfies readonly Permission[];
export type EditablePermission = typeof editablePermissions[number];
export type PermissionOverrides = Partial<Record<Permission, boolean>>;
export const permissionOverrideInputSchema = z.object({
  teamId: z.uuid(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("role"), role: z.enum(teamRoles).refine(role => role !== "owner", "Owner access is protected.") }),
    z.object({ kind: z.literal("person"), memberId: z.uuid() }),
  ]),
  permission: z.enum(editablePermissions),
  value: z.enum(["inherit", "allow", "deny"]),
});
export type PermissionOverrideRow = {
  role: string | null;
  member_id: string | null;
  permission: string;
  allowed: boolean;
};

export function resolvePermissionOverrides(rows: PermissionOverrideRow[], role: string, memberId?: string): PermissionOverrides {
  const result: PermissionOverrides = {};
  if (role === "owner") return result;
  for (const row of rows) {
    if (row.role === role && editablePermissions.some(permission => permission === row.permission)) {
      result[row.permission as EditablePermission] = row.allowed;
    }
  }
  for (const row of rows) {
    if (row.member_id === memberId && editablePermissions.some(permission => permission === row.permission)) {
      result[row.permission as EditablePermission] = row.allowed;
    }
  }
  return result;
}

export function canForTeam(context: { role: string; customPermissions?: Permission[]; permissionOverrides?: PermissionOverrides }, permission: Permission) {
  if (context.role === "owner") return true;
  const override = permission === "join_requests.review" ? context.permissionOverrides?.["members.manage"] : context.permissionOverrides?.[permission];
  return override ?? can(context.role, permission, context.customPermissions);
}
