import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { fixture, id, identity, timestamp } from './event-read-test-fixture';
import { getEventReadModel, mobileEventRowSchema, mobileEventAssignmentSchema, mobileEventAssignmentResponseSchema, mobileEventServiceOrderSchema } from './event-read-models';
import type { MobileServiceCommand } from './service-commands';
import type { MobileServiceResult } from './service-results';

export { id, timestamp };
export const serviceReceiptIdentity = identity;
export const serviceIdentity: MobileIdentity = { ...identity, teamName: 'Team', role: 'owner', permissions: ['events.manage', 'events.request', 'attendance.confirm'] };
export function serviceEvent(eventId = id(10)) {
  const tables = fixture();
  const record = mobileEventRowSchema.parse({ ...tables.events[0], id: eventId });
  const orders = z.array(mobileEventServiceOrderSchema).parse(tables.service_orders).map(order => ({ ...order, event_id: eventId }));
  const assignments = z.array(mobileEventAssignmentSchema).parse(tables.event_assignments).map(row => ({ ...row, event_id: eventId }));
  return getEventReadModel(record, { members: [], assignments, orders, responses: z.array(mobileEventAssignmentResponseSchema).parse(tables.assignment_responses),
    attendance: [], ownAttendanceStates: [], setlists: [], templates: [], orderSongs: [] }, identity,
  { canManage: true, canReview: true, canRequest: true, canConfirmAttendance: true, canManageSetlists: false });
}
export function serviceOrder(commandId = id(80), eventId = id(10)): Extract<MobileServiceCommand, { type: 'service.order.save' }> {
  return { commandId, eventId, type: 'service.order.save', baseEventRevision: 1, baseOrder: serviceEvent(eventId).servicePlanning!.order, dependsOn: [],
    value: { entries: [{ id: id(90), kind: 'prayer', title: 'Prayer', slot_id: null, duration_seconds: 60, responsible_member_id: null, cue: ' Opening\n' }], requiredRoles: ['Media'] } };
}
export function serviceApplied(command: MobileServiceCommand): Extract<MobileServiceResult, { status: 'applied' }> {
  const common = { commandId: command.commandId, eventId: command.eventId, type: command.type, status: 'applied' as const, payloadHash: 'a'.repeat(64) };
  if (command.type === 'service.order.save') return { ...common, outcome: { kind: 'order', order: { event_id: command.eventId, team_id: identity.teamId,
    revision: (command.baseOrder?.revision ?? 0) + 1, entries: command.value.entries, required_roles: command.value.requiredRoles, updated_by: identity.userId, updated_at: timestamp } } };
  if (command.type === 'service.order.request') return { ...common, outcome: { kind: 'request', request: { id: id(95), team_id: identity.teamId,
    target_type: 'service_order', target_id: command.eventId, base_revision: command.baseOrder?.revision ?? 0,
    changes: { entries: command.value.entries, required_roles: command.value.requiredRoles },
    before_snapshot: { entries: command.baseOrder?.entries ?? [], required_roles: command.baseOrder?.required_roles ?? [] }, after_snapshot: null,
    reason: command.reason, status: 'pending', requested_by: identity.userId, reviewed_by: null, review_reason: null,
    requested_at: timestamp, reviewed_at: null, request_nonce: command.commandId, legacy_song_request_id: null } } };
  return { ...common, outcome: { kind: 'assignment', assignment: command.baseAssignment,
    response: { assignment_id: command.baseAssignment.id, team_member_id: command.baseAssignment.memberId, ...command.value, updated_at: timestamp,
      sync_revision: command.responseVersion.revision + 1 },
    responseVersion: { ...command.responseVersion, revision: command.responseVersion.revision + 1, deleted: false } } };
}
