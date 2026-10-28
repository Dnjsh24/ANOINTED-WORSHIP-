import { z } from 'zod';
import { assignmentStateSchema, serviceOrderInputSchema } from '@/lib/domain/team-workflows';
import { sharedEditRequestInputSchema } from '@/lib/domain/shared-edit-requests';
import { mobileEventServiceOrderSchema } from './event-read-models';

// Match the current bound native JSON transport. Larger saved drafts need resumable transfer.
export const MOBILE_SERVICE_COMMAND_MAX_BYTES = 1024 * 1024;
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const serviceAssignmentBaseSchema = z.object({ id: z.uuid(), eventId: z.uuid(), memberId: z.uuid(), assignment: z.string().max(160) }).strict();
export const serviceResponseBaseSchema = z.object({ state: assignmentStateSchema, note: z.string().max(500) }).strict();
export const serviceResponseVersionSchema = z.object({ assignmentId: z.uuid(), memberId: z.uuid(), revision, deleted: z.boolean() }).strict()
  .refine(state => state.revision > 0 || state.deleted, 'An unobserved response has revision zero and no live value.');
const orderValueSchema = z.object({ entries: serviceOrderInputSchema.shape.entries, requiredRoles: serviceOrderInputSchema.shape.requiredRoles }).strict();
const common = { commandId: z.uuid(), eventId: z.uuid(), baseEventRevision: revision, dependsOn: z.array(z.uuid()).max(25) };
export const mobileServiceCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('service.order.save'), baseOrder: mobileEventServiceOrderSchema.nullable(), value: orderValueSchema }).strict(),
  z.object({ ...common, type: z.literal('service.order.request'), baseOrder: mobileEventServiceOrderSchema.nullable(), value: orderValueSchema,
    reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...common, type: z.literal('service.assignment.respond'), baseAssignment: serviceAssignmentBaseSchema,
    baseResponse: serviceResponseBaseSchema.nullable(), responseVersion: serviceResponseVersionSchema,
    value: serviceResponseBaseSchema }).strict(),
]).superRefine((command, validation) => {
  if (command.type === 'service.assignment.respond') {
    if (command.baseAssignment.eventId !== command.eventId
      || command.responseVersion.assignmentId !== command.baseAssignment.id || command.responseVersion.memberId !== command.baseAssignment.memberId
      || command.responseVersion.deleted !== (command.baseResponse === null)) {
      validation.addIssue({ code: 'custom', message: 'Capture the matching assignment and durable response revision before queuing.' });
    }
  } else {
    if (!serviceOrderInputSchema.safeParse({ eventId: command.eventId, revision: command.baseOrder?.revision ?? 0, ...command.value }).success) {
      validation.addIssue({ code: 'custom', message: 'The service order does not meet the website validation rules.' });
    }
    if (command.baseOrder && command.baseOrder.event_id !== command.eventId) validation.addIssue({ code: 'custom', message: 'The saved order belongs to another event.' });
    if (command.type === 'service.order.request') {
      const request = sharedEditRequestInputSchema.safeParse({ targetType: 'service_order', targetId: command.eventId,
        revision: command.baseOrder?.revision ?? 0, changes: { entries: command.value.entries, required_roles: command.value.requiredRoles },
        reason: command.reason, requestNonce: command.commandId });
      if (!request.success) validation.addIssue({ code: 'custom', message: 'The service proposal does not meet the website request rules.' });
    }
  }
  if (new Set(command.dependsOn).size !== command.dependsOn.length || command.dependsOn.includes(command.commandId)) {
    validation.addIssue({ code: 'custom', message: 'Dependencies must be unique earlier commands.' });
  }
});
export type MobileServiceCommand = z.infer<typeof mobileServiceCommandSchema>;
export const mobileServiceCommandsRequestSchema = z.object({ version: z.literal(2), commands: z.array(mobileServiceCommandSchema).min(1).max(25) }).strict()
  .superRefine((request, validation) => {
    const positions = new Map(request.commands.map((command, index) => [command.commandId, index]));
    if (positions.size !== request.commands.length || request.commands.some((command, index) => command.dependsOn.some(id => (positions.get(id) ?? -1) >= index))) {
      validation.addIssue({ code: 'custom', message: 'Command IDs must be unique and dependencies must precede their command.' });
    }
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MOBILE_SERVICE_COMMAND_MAX_BYTES) {
      validation.addIssue({ code: 'custom', message: 'This saved service draft requires resumable transfer. Keep its local copy.' });
    }
  });
