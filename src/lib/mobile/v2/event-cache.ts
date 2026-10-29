import { z } from 'zod';
import { mobileIdentitySchema } from '../contracts';
import { isServiceResponseStateConsistent, mobileServiceAssignmentStateSchema } from './service-response-state';
import { isEventOwnAttendanceStateConsistent, mobileEventOwnAttendanceStateSchema, mobileEventRowSchema, mobileEventAssignmentSchema, mobileEventAttendanceSchema, mobileEventServiceOrderSchema, mobileEventAssignmentResponseSchema, type MobileEventReadModel } from './event-read-models';

const count = z.number().int().nonnegative();
export const mobileEventReadModelSchema: z.ZodType<MobileEventReadModel> = z.object({
  id: z.uuid(), name: z.string(), type: mobileEventRowSchema.shape.type, date: z.iso.date(), time: z.string(),
  rehearsalDate: z.iso.date().nullable().optional(), rehearsalStart: z.string().nullable().optional(),
  location: z.string(), assignedTeams: z.array(z.string()), confirmed: count, pending: count,
  approvalStatus: mobileEventRowSchema.shape.approval_status.optional(), createdByMe: z.boolean().optional(), setlistId: z.uuid().optional(),
  myStatus: z.enum(['available','maybe','unavailable','pending','no_response']).optional(), notes: z.string().nullable().optional(),
  record: mobileEventRowSchema, permissions: z.object({ canManage: z.boolean(), canReview: z.boolean(), canRequest: z.boolean(), canConfirmAttendance: z.boolean(), canManageSetlists: z.boolean() }).strict(),
  totalMembers: count, recurrenceRule: z.string().nullable(), setlistIds: z.array(z.uuid()),
  assignments: z.array(mobileEventAssignmentSchema), attendance: z.array(mobileEventAttendanceSchema), ownAttendanceState: mobileEventOwnAttendanceStateSchema.nullable(),
  roster: z.array(z.object({status:z.string(),profileId:z.uuid(),fullName:z.string(),avatarUrl:z.string().nullable()}).strict()),
  detail: z.object({confirmed:count,pending:count,assignedTeams:z.array(z.string())}).strict(),
  servicePlanning: z.object({
    order: mobileEventServiceOrderSchema.nullable(), assignments:z.array(z.object({id:z.uuid(),team_member_id:z.uuid(),assignment:z.string()}).strict()),
    responses:z.array(mobileEventAssignmentResponseSchema), members:z.array(z.object({id:z.uuid(),name:z.string()}).strict()),
    ownResponseStates:z.array(mobileServiceAssignmentStateSchema).optional(),
    templates:z.array(z.object({id:z.uuid(),name:z.string(),default_roles:z.json()}).strict()),
  }).strict().nullable(), orderSongs:z.array(z.object({id:z.uuid(),title:z.string()}).strict()),
}).strict().refine(event => event.ownAttendanceState === null || isEventOwnAttendanceStateConsistent(event.ownAttendanceState, event.attendance, {
  userId: event.ownAttendanceState.actorId, teamId: event.record.team_id, memberId: event.ownAttendanceState.memberId,
}, event.id), 'Event attendance state does not match its saved row.');
export const mobileEventCacheSchema = z.object({ version:z.literal(2), identity:mobileIdentitySchema, events:z.array(mobileEventReadModelSchema) }).strict()
  .refine(snapshot=>snapshot.events.every(event=>event.record.team_id===snapshot.identity.teamId&&event.id===event.record.id
    && isEventOwnAttendanceStateConsistent(event.ownAttendanceState,event.attendance,snapshot.identity,event.id)
    && isServiceResponseStateConsistent(event,snapshot.identity)), 'Event cache identity, attendance or service response base does not match.');
export type MobileEventCache = z.infer<typeof mobileEventCacheSchema>;
