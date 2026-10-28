import { z } from "zod";
import { permissionValues } from "@/lib/domain/wooly-permissions";

export const MOBILE_V2_PAGE_SIZE = 50;
export const mobileWorkspaceSchema = z.object({
  teamId: z.uuid(),
  memberId: z.uuid(),
  teamName: z.string().min(1).max(160),
  role: z.string().min(1).max(80),
  permissions: z.array(z.enum(permissionValues)).max(permissionValues.length)
    .refine(values => new Set(values).size === values.length, "Permissions must be unique."),
}).strict();
export type MobileWorkspace = z.infer<typeof mobileWorkspaceSchema>;
export const mobileWorkspacesRequestSchema = z.object({ version: z.literal(2), after: z.uuid().optional() }).strict();
export type MobileWorkspacesRequest = z.infer<typeof mobileWorkspacesRequestSchema>;
export const mobileSelectedWorkspaceSchema = z.object({ version: z.literal(2), teamId: z.uuid() }).strict();
export const mobileWorkspacesResponseSchema = z.object({
  version: z.literal(2),
  userId: z.uuid(),
  memberships: z.array(mobileWorkspaceSchema).max(MOBILE_V2_PAGE_SIZE),
  nextId: z.uuid().nullable(),
  pendingJoin: z.boolean(),
}).strict().superRefine((value, context) => {
  if (new Set(value.memberships.map(member => member.teamId)).size !== value.memberships.length) {
    context.addIssue({ code: "custom", path: ["memberships"], message: "Workspace IDs must be unique." });
  }
  if (value.memberships.some((member, index) => index > 0 && member.teamId <= value.memberships[index - 1].teamId)) {
    context.addIssue({ code: "custom", path: ["memberships"], message: "Workspaces must use ascending team IDs." });
  }
  if (value.nextId !== null && (value.memberships.length !== MOBILE_V2_PAGE_SIZE || value.nextId !== value.memberships.at(-1)?.teamId)) {
    context.addIssue({ code: "custom", path: ["nextId"], message: "Cursor must identify the last workspace in a full page." });
  }
});
export type MobileWorkspacesResponse = z.infer<typeof mobileWorkspacesResponseSchema>;
