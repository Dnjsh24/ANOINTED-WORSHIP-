import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { preparationTaskKeys, readinessStateSchema, rehearsalPlanInputSchema } from '../../domain/team-workflows';
import { jsonEqual } from '../json-equal';

export const rehearsalRevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
export const rehearsalTaskKeySchema = z.string().refine(value => preparationTaskKeys.includes(value));
export const mobileRehearsalPlanSchema = z.object({
  setlist_id: z.uuid(), team_id: z.uuid(), revision: rehearsalRevisionSchema.positive(),
  allocations: rehearsalPlanInputSchema.shape.allocations, tasks: rehearsalPlanInputSchema.shape.tasks,
  updated_by: z.uuid(), updated_at: timestamp,
}).strict().superRefine((plan, context) => {
  if (!rehearsalPlanInputSchema.safeParse({ setlistId: plan.setlist_id, revision: plan.revision, allocations: plan.allocations, tasks: plan.tasks }).success) {
    context.addIssue({ code: 'custom', message: 'Keep one allocation per slot and distinct preparation tasks.' });
  }
});
export const mobileRehearsalCheckSchema = z.object({
  setlist_id: z.uuid(), task_key: rehearsalTaskKeySchema, team_member_id: z.uuid(), completed: z.boolean(), updated_at: timestamp,
}).strict();
export const mobileRehearsalReadinessSchema = z.object({
  event_id: z.uuid(), slot_id: z.uuid(), team_member_id: z.uuid(), state: readinessStateSchema, note: z.string().max(500), updated_at: timestamp,
}).strict();
export const rehearsalParentSchema = z.object({
  // Existing records start at revision zero before their first synchronized edit.
  setlistId: z.uuid(), teamId: z.uuid(), eventId: z.uuid().nullable(), eventRevision: rehearsalRevisionSchema.nullable(),
  setlistRevision: rehearsalRevisionSchema, slots: z.array(z.object({ id: z.uuid(), songId: z.uuid(), revision: rehearsalRevisionSchema }).strict()).max(200),
}).strict();
export const mobileRehearsalWorkspaceSchema = rehearsalParentSchema.extend({
  plan: mobileRehearsalPlanSchema.nullable(), checks: z.array(mobileRehearsalCheckSchema).max(20000),
  readiness: z.array(mobileRehearsalReadinessSchema).max(40000), members: z.array(z.object({ id: z.uuid(), name: z.string().max(1000) }).strict()).max(2000),
  assignedMemberIds: z.array(z.uuid()).max(2000),
}).strict().superRefine((workspace, context) => {
  const slots = new Set(workspace.slots.map(slot => slot.id));
  const members = new Set(workspace.members.map(member => member.id));
  if (slots.size !== workspace.slots.length || members.size !== workspace.members.length
    || new Set(workspace.assignedMemberIds).size !== workspace.assignedMemberIds.length || workspace.assignedMemberIds.some(id => !members.has(id))
    || (workspace.eventId === null) !== (workspace.eventRevision === null)
    || (workspace.plan && (workspace.plan.setlist_id !== workspace.setlistId || workspace.plan.team_id !== workspace.teamId))
    || workspace.checks.some(row => row.setlist_id !== workspace.setlistId)
    || workspace.readiness.some(row => row.event_id !== workspace.eventId || !slots.has(row.slot_id))
    || new Set(workspace.checks.map(row => `${row.task_key}:${row.team_member_id}`)).size !== workspace.checks.length
    || new Set(workspace.readiness.map(row => `${row.slot_id}:${row.team_member_id}`)).size !== workspace.readiness.length) {
    context.addIssue({ code: 'custom', message: 'Rehearsal snapshot identities are inconsistent.' });
  }
});
export type MobileRehearsalWorkspace = z.infer<typeof mobileRehearsalWorkspaceSchema>;
export const mobileRehearsalCacheSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, workspace: mobileRehearsalWorkspaceSchema }).strict()
  .refine(cache => cache.workspace.teamId === cache.identity.teamId && cache.workspace.members.some(member => member.id === cache.identity.memberId), 'Keep the verified rehearsal membership.');
export type MobileRehearsalCache = z.infer<typeof mobileRehearsalCacheSchema>;
export function assertRehearsalIdentity(identity: MobileIdentity, cache: MobileRehearsalCache) {
  if (identity.userId !== cache.identity.userId || identity.teamId !== cache.identity.teamId || identity.memberId !== cache.identity.memberId
    || identity.role !== cache.identity.role || !jsonEqual([...new Set(identity.permissions)].sort(), [...new Set(cache.identity.permissions)].sort())) {
    throw new Error('Refresh this team’s rehearsal permissions before opening saved work.');
  }
}
export function rehearsalParent({ setlistId, teamId, eventId, eventRevision, setlistRevision, slots }: MobileRehearsalWorkspace) {
  return { setlistId, teamId, eventId, eventRevision, setlistRevision, slots };
}
