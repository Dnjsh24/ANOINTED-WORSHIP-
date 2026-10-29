import { z } from 'zod';
import { sharedEditRequestRowSchema } from '@/lib/domain/shared-edit-requests';
import { serviceOrderInputSchema } from '@/lib/domain/team-workflows';
import { jsonEqual } from '../json-equal';
import { mobileEventAssignmentResponseSchema, mobileEventRowSchema, mobileEventServiceOrderSchema } from './event-read-models';
import { mobileServiceCommandSchema, serviceAssignmentBaseSchema, serviceResponseVersionSchema, type MobileServiceCommand } from './service-commands';
import { mobileWorkflowIdentitySchema } from './workflow-commands';

const common = { commandId: z.uuid(), eventId: z.uuid(),
  type: z.enum(['service.order.save', 'service.order.request', 'service.assignment.respond']), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) };
const outcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order'), order: mobileEventServiceOrderSchema }).strict(),
  z.object({ kind: z.literal('request'), request: sharedEditRequestRowSchema.strict() }).strict(),
  z.object({ kind: z.literal('assignment'), assignment: serviceAssignmentBaseSchema,
    response: mobileEventAssignmentResponseSchema, responseVersion: serviceResponseVersionSchema }).strict(),
]);
const remote = z.object({ event: mobileEventRowSchema.nullable(), order: mobileEventServiceOrderSchema.nullable(),
  assignment: serviceAssignmentBaseSchema.nullable(), response: mobileEventAssignmentResponseSchema.nullable(),
  responseVersion: serviceResponseVersionSchema.nullable() }).strict();
export const mobileServiceResultSchema = z.discriminatedUnion('status', [
  z.object({ ...common, status: z.literal('applied'), outcome }).strict(),
  z.object({ ...common, status: z.literal('conflict'), baseValue: z.json().nullable(), localValue: z.json(), remote }).strict(),
  z.object({ ...common, status: z.literal('rejected'), code: z.enum(['permission', 'unavailable', 'invalid', 'command_id_conflict']), message: z.string().max(250) }).strict(),
  z.object({ ...common, status: z.literal('blocked'), code: z.literal('dependency'), message: z.string().max(250) }).strict(),
]);
export type MobileServiceResult = z.infer<typeof mobileServiceResultSchema>;
export const mobileServiceCommandsResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema,
  results: z.array(mobileServiceResultSchema).min(1).max(25) }).strict();
export type MobileServiceCommandsResponse = z.infer<typeof mobileServiceCommandsResponseSchema>;

export function serviceConflictValues(command: MobileServiceCommand) {
  return { baseValue: command.type === 'service.assignment.respond'
    ? { assignment: command.baseAssignment, response: command.baseResponse, responseVersion: command.responseVersion } : command.baseOrder,
  localValue: command.type === 'service.order.request' ? { ...command.value, reason: command.reason } : command.value };
}

/** A request receipt confirms submission for review, never an applied change to the running order. */
export function assertMobileServiceResult(input: MobileServiceCommand, actorInput: z.infer<typeof mobileWorkflowIdentitySchema>, value: unknown): MobileServiceResult {
  const command = mobileServiceCommandSchema.parse(input); const actor = mobileWorkflowIdentitySchema.parse(actorInput);
  const result = mobileServiceResultSchema.parse(value);
  const invalid = () => { throw new Error('Service confirmation does not match the saved intent and workspace.'); };
  if (command.type === 'service.assignment.respond' ? command.baseAssignment.memberId !== actor.memberId
    : command.baseOrder !== null && command.baseOrder.team_id !== actor.teamId) invalid();
  if (result.commandId !== command.commandId || result.eventId !== command.eventId || result.type !== command.type) invalid();
  if (result.status === 'applied') {
    const saved = result.outcome;
    if (command.type === 'service.order.save') {
      if (saved.kind !== 'order') invalid();
      else if (saved.order.team_id !== actor.teamId || saved.order.event_id !== command.eventId || saved.order.updated_by !== actor.userId
        || saved.order.revision <= (command.baseOrder?.revision ?? 0) || !jsonEqual(saved.order.entries, command.value.entries)
        || !jsonEqual(saved.order.required_roles, command.value.requiredRoles)) invalid();
    } else if (command.type === 'service.order.request') {
      if (saved.kind !== 'request') invalid();
      else {
        const request = saved.request;
        if (request.team_id !== actor.teamId || request.target_type !== 'service_order' || request.target_id !== command.eventId
          || request.requested_by !== actor.userId || request.request_nonce !== command.commandId || request.base_revision !== (command.baseOrder?.revision ?? 0)
          || request.reason !== command.reason || !['pending', 'needs_revision'].includes(request.status) || request.reviewed_by !== null || request.reviewed_at !== null
          || request.after_snapshot !== null || request.review_reason !== null || request.legacy_song_request_id !== null
          || !jsonEqual(request.changes, { entries: command.value.entries, required_roles: command.value.requiredRoles })
          || !z.iso.datetime({ offset: true }).safeParse(request.requested_at).success
          || !serviceOrderInputSchema.safeParse({ eventId: command.eventId, revision: request.base_revision,
            entries: request.before_snapshot.entries, requiredRoles: request.before_snapshot.required_roles }).success
          || Object.keys(request.before_snapshot).some(key => !['entries', 'required_roles'].includes(key))
          || (request.status === 'pending' && !jsonEqual(request.before_snapshot, {
            entries: command.baseOrder?.entries ?? [], required_roles: command.baseOrder?.required_roles ?? [] }))) invalid();
      }
    } else {
      if (saved.kind !== 'assignment') invalid();
      else if (!jsonEqual(saved.assignment, command.baseAssignment) || saved.responseVersion.assignmentId !== command.baseAssignment.id
        || saved.responseVersion.memberId !== actor.memberId || saved.responseVersion.deleted || saved.responseVersion.revision <= command.responseVersion.revision
        || saved.response.assignment_id !== command.baseAssignment.id || saved.response.team_member_id !== actor.memberId
        || saved.response.state !== command.value.state || saved.response.note !== command.value.note
        || (saved.response.sync_revision !== undefined && saved.response.sync_revision !== saved.responseVersion.revision)) invalid();
    }
  } else if (result.status === 'conflict') {
    const expected = serviceConflictValues(command); const current = result.remote;
    if (!jsonEqual(result.baseValue, expected.baseValue) || !jsonEqual(result.localValue, expected.localValue)
      || (current.event && (current.event.id !== command.eventId || current.event.team_id !== actor.teamId))
      || (!current.event && (current.order || current.assignment || current.response || current.responseVersion))) invalid();
    if (command.type !== 'service.assignment.respond') {
      if (current.assignment || current.response || current.responseVersion || (current.order && (current.order.event_id !== command.eventId || current.order.team_id !== actor.teamId))) invalid();
    } else {
      if (current.order || (current.assignment && (current.assignment.id !== command.baseAssignment.id || current.assignment.eventId !== command.eventId || current.assignment.memberId !== actor.memberId))
        || (current.responseVersion && (current.responseVersion.assignmentId !== command.baseAssignment.id || current.responseVersion.memberId !== actor.memberId
          || current.responseVersion.deleted !== (current.response === null)))
        || (current.response && (!current.assignment || !current.responseVersion || current.response.assignment_id !== command.baseAssignment.id || current.response.team_member_id !== actor.memberId
          || (current.response.sync_revision !== undefined && current.response.sync_revision !== current.responseVersion.revision)))) invalid();
    }
  }
  return result;
}
