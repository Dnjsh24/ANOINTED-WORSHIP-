import { z } from 'zod';
import { readinessStateSchema, rehearsalPlanInputSchema } from '../../domain/team-workflows';
import { jsonEqual } from '../json-equal';
import { sharedEditRequestInputSchema, sharedEditRequestRowSchema } from '../../domain/shared-edit-requests';
import { mobileWorkflowIdentitySchema } from './workflow-commands';
import { mobileRehearsalPlanSchema, mobileRehearsalCheckSchema, mobileRehearsalReadinessSchema, mobileRehearsalWorkspaceSchema,
  rehearsalParentSchema, rehearsalParent, rehearsalTaskKeySchema, type MobileRehearsalCache } from './rehearsal-state';

const common = { commandId: z.uuid(), setlistId: z.uuid(), baseParent: rehearsalParentSchema, dependsOn: z.array(z.uuid()).max(25) };
export const rehearsalPlanValueSchema = z.object({ allocations: rehearsalPlanInputSchema.shape.allocations, tasks: rehearsalPlanInputSchema.shape.tasks }).strict()
  .superRefine((value, context) => {
    if (!rehearsalPlanInputSchema.safeParse({ ...value, setlistId: '00000000-0000-4000-8000-000000000000', revision: 0 }).success) {
      context.addIssue({ code: 'custom', message: 'Keep distinct allocations and every preparation task once.' });
    }
  });
export const mobileRehearsalCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('rehearsal.plan.save'), baseValue: mobileRehearsalPlanSchema.nullable(), value: rehearsalPlanValueSchema }).strict(),
  z.object({ ...common, type: z.literal('rehearsal.plan.request'), baseValue: mobileRehearsalPlanSchema.nullable(), value: rehearsalPlanValueSchema,
    reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...common, type: z.literal('rehearsal.task.respond'), taskKey: rehearsalTaskKeySchema,
    basePlan: mobileRehearsalPlanSchema, baseValue: mobileRehearsalCheckSchema.nullable(), completed: z.boolean() }).strict(),
  z.object({ ...common, type: z.literal('rehearsal.readiness.respond'), slotId: z.uuid(), baseValue: mobileRehearsalReadinessSchema.nullable(),
    state: readinessStateSchema, note: z.string().max(500) }).strict(),
]);
export type MobileRehearsalCommand = z.infer<typeof mobileRehearsalCommandSchema>;
export const MOBILE_REHEARSAL_MAX_BYTES = 512 * 1024;
export const mobileRehearsalCommandsRequestSchema = z.object({ version: z.literal(2), commands: z.array(mobileRehearsalCommandSchema).min(1).max(10) }).strict()
  .superRefine((request, context) => {
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MOBILE_REHEARSAL_MAX_BYTES) context.addIssue({ code: 'custom', message: 'Rehearsal batch exceeds transfer limits.' });
    const indexes = new Map(request.commands.map((command, index) => [command.commandId, index]));
    if (indexes.size !== request.commands.length) context.addIssue({ code: 'custom', message: 'Keep distinct command IDs.' });
    request.commands.forEach((command, index) => {
      if (command.setlistId !== command.baseParent.setlistId || new Set(command.dependsOn).size !== command.dependsOn.length
        || command.dependsOn.some(id => (indexes.get(id) ?? -1) >= index)) context.addIssue({ code: 'custom', message: 'Keep matching parent and earlier dependencies.' });
      if (command.type === 'rehearsal.plan.request' && !sharedEditRequestInputSchema.safeParse({ targetType: 'rehearsal_plan', targetId: command.setlistId,
        revision: command.baseValue?.revision ?? 0, changes: command.value, reason: command.reason, requestNonce: command.commandId }).success) context.addIssue({ code: 'custom', message: 'The rehearsal proposal does not meet the website request rules.' });
    });
  });
const receipt = { commandId: z.uuid(), setlistId: z.uuid(), type: z.enum(['rehearsal.plan.save', 'rehearsal.plan.request', 'rehearsal.task.respond', 'rehearsal.readiness.respond']), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) };
export const mobileRehearsalResultSchema = z.discriminatedUnion('status', [
  z.object({ ...receipt, status: z.literal('applied'), workspace: mobileRehearsalWorkspaceSchema, request: sharedEditRequestRowSchema.strict().optional() }).strict(),
  z.object({ ...receipt, status: z.literal('conflict'), workspace: mobileRehearsalWorkspaceSchema, original: mobileRehearsalCommandSchema }).strict(),
  z.object({ ...receipt, status: z.literal('rejected'), code: z.enum(['permission', 'unavailable', 'invalid', 'command_id_conflict']), message: z.string().max(250) }).strict(),
  z.object({ ...receipt, status: z.literal('blocked'), code: z.literal('dependency'), message: z.string().max(250) }).strict(),
]);
export type MobileRehearsalResult = z.infer<typeof mobileRehearsalResultSchema>;
export const mobileRehearsalCommandsResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema, results: z.array(mobileRehearsalResultSchema).min(1).max(10) }).strict();
export type MobileRehearsalCommandsResponse = z.infer<typeof mobileRehearsalCommandsResponseSchema>;
export type RehearsalAction =
  | { type: 'rehearsal.plan.save'; allocations: z.infer<typeof rehearsalPlanValueSchema>['allocations']; tasks: z.infer<typeof rehearsalPlanValueSchema>['tasks'] }
  | { type: 'rehearsal.plan.request'; allocations: z.infer<typeof rehearsalPlanValueSchema>['allocations']; tasks: z.infer<typeof rehearsalPlanValueSchema>['tasks']; reason: string }
  | { type: 'rehearsal.task.respond'; taskKey: string; completed: boolean }
  | { type: 'rehearsal.readiness.respond'; slotId: string; state: z.infer<typeof readinessStateSchema>; note: string };

export function createRehearsalCommand(cache: MobileRehearsalCache, action: RehearsalAction, commandId: string = crypto.randomUUID()): MobileRehearsalCommand {
  const { workspace, identity } = cache;
  const shared = { commandId, setlistId: workspace.setlistId, baseParent: rehearsalParent(workspace), dependsOn: [] };
  if (action.type === 'rehearsal.plan.save' || action.type === 'rehearsal.plan.request') return mobileRehearsalCommandSchema.parse({ ...shared, type: action.type, baseValue: workspace.plan,
    value: { allocations: action.allocations, tasks: action.tasks }, ...(action.type === 'rehearsal.plan.request' ? { reason: action.reason } : {}) });
  if (action.type === 'rehearsal.task.respond') return mobileRehearsalCommandSchema.parse({ ...shared, ...action, basePlan: workspace.plan,
    baseValue: workspace.checks.find(row => row.task_key === action.taskKey && row.team_member_id === identity.memberId) ?? null });
  return mobileRehearsalCommandSchema.parse({ ...shared, ...action, baseValue: workspace.readiness.find(row => row.slot_id === action.slotId && row.team_member_id === identity.memberId) ?? null });
}
export function assertRehearsalCommandScope(command: MobileRehearsalCommand, identity: z.infer<typeof mobileWorkflowIdentitySchema>) {
  if (command.baseParent.teamId !== identity.teamId || command.baseParent.setlistId !== command.setlistId
    || ((command.type === 'rehearsal.plan.save' || command.type === 'rehearsal.plan.request') && command.baseValue && (command.baseValue.team_id !== identity.teamId || command.baseValue.setlist_id !== command.setlistId))
    || (command.type === 'rehearsal.task.respond' && (command.basePlan.team_id !== identity.teamId || command.basePlan.setlist_id !== command.setlistId
      || (command.baseValue && (command.baseValue.setlist_id !== command.setlistId || command.baseValue.task_key !== command.taskKey || command.baseValue.team_member_id !== identity.memberId))))
    || (command.type === 'rehearsal.readiness.respond' && (!command.baseParent.eventId || !command.baseParent.slots.some(slot => slot.id === command.slotId)
      || (command.baseValue && (command.baseValue.event_id !== command.baseParent.eventId || command.baseValue.slot_id !== command.slotId || command.baseValue.team_member_id !== identity.memberId))))) {
    throw new Error('Rehearsal command belongs to another parent or membership.');
  }
}
export function assertMobileRehearsalResult(command: MobileRehearsalCommand, identity: z.infer<typeof mobileWorkflowIdentitySchema>, input: unknown): MobileRehearsalResult {
  const result = mobileRehearsalResultSchema.parse(input);
  if (result.commandId !== command.commandId || result.setlistId !== command.setlistId || result.type !== command.type) throw new Error('Rehearsal receipt does not match its saved intent.');
  if (result.status === 'applied' || result.status === 'conflict') {
    const workspace = result.workspace;
    if (workspace.setlistId !== command.setlistId || workspace.teamId !== identity.teamId || !workspace.members.some(member => member.id === identity.memberId)) throw new Error('Rehearsal receipt belongs to another workspace.');
    if (result.status === 'conflict' && !jsonEqual(result.original, command)) throw new Error('Rehearsal conflict changed the saved base or intent.');
    if (result.status === 'applied') {
      if (command.type === 'rehearsal.plan.request') {
        const request = result.request;
        if (!request || request.team_id !== identity.teamId || request.requested_by !== identity.userId || request.target_type !== 'rehearsal_plan'
          || request.target_id !== command.setlistId || request.request_nonce !== command.commandId || request.base_revision !== (command.baseValue?.revision ?? 0)
          || request.reason !== command.reason || !jsonEqual(request.changes, command.value)) throw new Error('Rehearsal receipt does not confirm your exact proposal submission.');
        // A submission, including needs_revision, is never confirmation that the shared plan changed.
        return result;
      }
      if (result.request) throw new Error('A plan or response receipt cannot substitute a proposal submission.');
      if (!jsonEqual(rehearsalParent(workspace), command.baseParent)) throw new Error('Rehearsal receipt changed the confirmed parent.');
      if (command.type === 'rehearsal.plan.save' && (!workspace.plan || workspace.plan.revision !== (command.baseValue?.revision ?? 0) + 1
        || workspace.plan.updated_by !== identity.userId || !jsonEqual(workspace.plan.allocations, command.value.allocations) || !jsonEqual(workspace.plan.tasks, command.value.tasks))) throw new Error('Rehearsal receipt does not confirm the saved plan.');
      if (command.type === 'rehearsal.task.respond' && !workspace.checks.some(row => row.task_key === command.taskKey && row.team_member_id === identity.memberId && row.completed === command.completed)) throw new Error('Rehearsal receipt does not confirm your check.');
      if (command.type === 'rehearsal.readiness.respond' && !workspace.readiness.some(row => row.slot_id === command.slotId && row.team_member_id === identity.memberId && row.state === command.state && row.note === command.note)) throw new Error('Rehearsal receipt does not confirm your readiness.');
    }
  }
  return result;
}
