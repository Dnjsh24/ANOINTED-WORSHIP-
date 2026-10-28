import { z } from "zod";
import { eventAssignmentsSchema } from "@/lib/domain/event-workflows";
import { assignmentStateSchema, serviceOrderEntrySchema } from "@/lib/domain/team-workflows";
import type { Event } from "@/lib/types";
import type { MobileServiceAssignmentState } from './service-response-state';

const timestamp = z.iso.datetime({ offset: true });
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const mobileEventRowSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), name: z.string(), type: z.enum(["service", "rehearsal", "meeting", "special_event", "service_rehearsal"]),
  event_date: z.iso.date(), starts_at: clock, ends_at: clock.nullable(), call_time: clock.nullable(), location: z.string().nullable(),
  description: z.string().nullable(), rehearsal_date: z.iso.date().nullable(), rehearsal_time: clock.nullable(), rehearsal_end_time: clock.nullable(),
  recurrence_rule: z.string().nullable(), recurrence_parent_id: z.uuid().nullable(), approval_status: z.enum(["pending", "approved", "rejected"]),
  requested_assignments: z.array(eventAssignmentsSchema.element.strict()).max(100)
    .refine(rows => new Set(rows.map(row => `${row.team_member_id}:${row.assignment}`)).size === rows.length),
  created_by: z.uuid(), created_at: timestamp, updated_at: timestamp,
  deleted_at: timestamp.nullable(), sync_revision: revision,
}).strict();
export type MobileEventRow = z.infer<typeof mobileEventRowSchema>;

export const mobileEventMemberSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), status: z.enum(["active", "inactive"]),
  profiles: z.object({ id: z.uuid(), full_name: z.string().nullable(), avatar_url: z.string().nullable() }).strict().nullable(),
}).strict();
export const mobileEventAssignmentSchema = z.object({ id: z.uuid(), event_id: z.uuid(), team_member_id: z.uuid(), assignment: z.string(), created_at: timestamp }).strict();
export const mobileEventAttendanceSchema = z.object({
  id: z.uuid(), event_id: z.uuid(), team_member_id: z.uuid(), status: z.enum(["available", "maybe", "unavailable", "pending"]),
  note: z.string().nullable(), responded_at: timestamp.nullable(), created_at: timestamp, updated_at: timestamp, sync_revision: revision.positive(),
}).strict();
export const mobileEventOwnAttendanceStateRowSchema = z.object({
  actor_id: z.uuid(), team_id: z.uuid(), event_id: z.uuid(), member_id: z.uuid(), attendance_id: z.uuid(),
  revision: revision.positive(), deleted: z.boolean(), changed_at: timestamp,
}).strict();
export const mobileEventOwnAttendanceStateSchema = z.object({
  actorId: z.uuid(), teamId: z.uuid(), eventId: z.uuid(), memberId: z.uuid(), attendanceId: z.uuid(),
  revision: revision.positive(), deleted: z.boolean(), changedAt: timestamp,
}).strict();
export type MobileEventOwnAttendanceState = z.infer<typeof mobileEventOwnAttendanceStateSchema>;

/** A live RSVP and its durable revision must agree before either can become an offline edit base. */
export function isEventOwnAttendanceStateConsistent(
  state: MobileEventOwnAttendanceState | null,
  attendance: readonly z.infer<typeof mobileEventAttendanceSchema>[],
  identity: { userId: string; teamId: string; memberId: string }, eventId: string,
): boolean {
  const own = attendance.filter(row => row.team_member_id === identity.memberId);
  if (own.some(row => row.event_id !== eventId) || own.length > 1) return false;
  if (state === null) return own.length === 0;
  if (state.actorId !== identity.userId || state.teamId !== identity.teamId || state.memberId !== identity.memberId || state.eventId !== eventId) return false;
  return state.deleted ? own.length === 0 : own.length === 1 && own[0].id === state.attendanceId && own[0].sync_revision === state.revision;
}
export const mobileEventSetlistSchema = z.object({ id: z.uuid(), team_id: z.uuid(), event_id: z.uuid(), deleted_at: timestamp.nullable() }).strict();
export const mobileEventServiceOrderSchema = z.object({
  event_id: z.uuid(), team_id: z.uuid(), revision: revision.positive(), entries: z.array(serviceOrderEntrySchema).max(200),
  required_roles: z.array(z.string()).max(30), updated_by: z.uuid(), updated_at: timestamp,
}).strict().refine(row => new Set(row.entries.map(entry => entry.id)).size === row.entries.length && new Set(row.required_roles).size === row.required_roles.length);
export const mobileEventAssignmentResponseSchema = z.object({
  assignment_id: z.uuid(), team_member_id: z.uuid(), state: assignmentStateSchema, note: z.string().max(500), updated_at: timestamp,
  sync_revision: revision.positive().optional(),
}).strict();
export const mobileEventServiceTemplateSchema = z.object({ id: z.uuid(), team_id: z.uuid(), name: z.string(), default_roles: z.json() }).strict();
export const mobileEventOrderSongSchema = z.object({
  id: z.uuid(), setlist_id: z.uuid(), song_order: z.number().int(), deleted_at: timestamp.nullable(),
  song: z.object({ id: z.uuid(), title: z.string(), team_id: z.uuid() }).strict().nullable(),
}).strict();

export type MobileEventPermissions = { canManage: boolean; canReview: boolean; canRequest: boolean; canConfirmAttendance: boolean; canManageSetlists: boolean };
export type MobileEventGraph = {
  members: z.infer<typeof mobileEventMemberSchema>[];
  assignments: z.infer<typeof mobileEventAssignmentSchema>[];
  attendance: z.infer<typeof mobileEventAttendanceSchema>[];
  ownAttendanceStates: z.infer<typeof mobileEventOwnAttendanceStateRowSchema>[];
  setlists: z.infer<typeof mobileEventSetlistSchema>[];
  orders: z.infer<typeof mobileEventServiceOrderSchema>[];
  responses: z.infer<typeof mobileEventAssignmentResponseSchema>[];
  ownServiceResponseStates?: MobileServiceAssignmentState[];
  templates: z.infer<typeof mobileEventServiceTemplateSchema>[];
  orderSongs: z.infer<typeof mobileEventOrderSongSchema>[];
};
export type MobileEventReadModel = Event & {
  record: MobileEventRow;
  permissions: MobileEventPermissions;
  totalMembers: number;
  recurrenceRule: string | null;
  setlistIds: string[];
  assignments: MobileEventGraph["assignments"];
  attendance: MobileEventGraph["attendance"];
  ownAttendanceState: MobileEventOwnAttendanceState | null;
  roster: { status: string; profileId: string; fullName: string; avatarUrl: string | null }[];
  detail: { confirmed: number; pending: number; assignedTeams: string[] };
  servicePlanning: null | {
    order: MobileEventGraph["orders"][number] | null;
    assignments: { id: string; team_member_id: string; assignment: string }[];
    responses: MobileEventGraph["responses"];
    ownResponseStates?: MobileServiceAssignmentState[];
    members: { id: string; name: string }[];
    templates: { id: string; name: string; default_roles: MobileEventGraph["templates"][number]["default_roles"] }[];
  };
  orderSongs: { id: string; title: string }[];
};

/** search_events excludes deleted rows, and events/page.tsx additionally excludes rejected requests. */
export function getEventTimelineEvents(events: readonly MobileEventReadModel[]): MobileEventReadModel[] {
  return events.filter(event => event.record.deleted_at === null && event.approvalStatus !== "rejected");
}

/** Mirrors events/page.tsx and events/[id]/page.tsx without demo records or invented history. */
export function getEventReadModel(row: MobileEventRow, graph: MobileEventGraph, actor: { userId: string; memberId: string }, permissions: MobileEventPermissions): MobileEventReadModel {
  const record = mobileEventRowSchema.parse(row);
  const assignments = graph.assignments.filter(assignment => assignment.event_id === record.id);
  const attendance = graph.attendance.filter(response => response.event_id === record.id);
  const ownState = graph.ownAttendanceStates.find(state => state.event_id === record.id && state.team_id === record.team_id
    && state.actor_id === actor.userId && state.member_id === actor.memberId);
  const ownAttendanceState: MobileEventOwnAttendanceState | null = ownState ? {
    actorId: ownState.actor_id, teamId: ownState.team_id, eventId: ownState.event_id, memberId: ownState.member_id,
    attendanceId: ownState.attendance_id, revision: ownState.revision, deleted: ownState.deleted, changedAt: ownState.changed_at,
  } : null;
  const activeMembers = graph.members.filter(member => member.status === "active");
  const activeById = new Map(activeMembers.map(member => [member.id, member]));
  const activeAttendance = attendance.filter(response => activeById.has(response.team_member_id));
  const assignedTeams = [...new Set(assignments.map(assignment => assignment.assignment))];
  const detailAssignments = assignments.map(assignment => assignment.assignment);
  const descriptionAssignments = record.description?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  const setlistIds = graph.setlists.filter(setlist => setlist.event_id === record.id).map(setlist => setlist.id).sort();
  const setlistIdsSet = new Set(setlistIds);
  const assignmentIds = new Set(assignments.map(assignment => assignment.id));
  const serviceTime = record.starts_at.slice(0, 5) + (record.ends_at ? ` - ${record.ends_at.slice(0, 5)}` : "");
  const rehearsalTime = (record.rehearsal_time?.slice(0, 5) ?? "") + (record.rehearsal_end_time ? ` - ${record.rehearsal_end_time.slice(0, 5)}` : "");
  const counts = (responses: MobileEventGraph["attendance"]) => ({
    confirmed: responses.filter(response => response.status === "available").length,
    pending: responses.filter(response => response.status === "maybe").length + Math.max(0, activeMembers.length - responses.length),
  });
  return {
    id: record.id, name: record.name, type: record.type, date: record.event_date,
    time: record.type === "service_rehearsal" ? `Rehearsal: ${rehearsalTime} | Service: ${serviceTime}` : serviceTime,
    rehearsalDate: record.rehearsal_date, rehearsalStart: record.rehearsal_time?.slice(0, 5) ?? null,
    location: record.location ?? "Main Sanctuary", assignedTeams, ...counts(attendance),
    approvalStatus: record.approval_status, createdByMe: record.created_by === actor.userId,
    setlistId: setlistIds[0], myStatus: attendance.find(response => response.team_member_id === actor.memberId)?.status ?? "no_response",
    notes: record.description, record, permissions, totalMembers: activeMembers.length, recurrenceRule: record.recurrence_rule,
    setlistIds, assignments, attendance, ownAttendanceState,
    roster: activeAttendance.map(response => {
      const member = activeById.get(response.team_member_id)!;
      return { status: response.status, profileId: member.profile_id, fullName: member.profiles?.full_name ?? "Unknown", avatarUrl: member.profiles?.avatar_url ?? null };
    }),
    detail: { ...counts(activeAttendance), assignedTeams: detailAssignments.length ? detailAssignments : descriptionAssignments.length ? descriptionAssignments : ["Worship Team"] },
    servicePlanning: record.approval_status !== "approved" ? null : {
      order: graph.orders.find(order => order.event_id === record.id) ?? null,
      assignments: assignments.map(({ id, team_member_id, assignment }) => ({ id, team_member_id, assignment })),
      responses: graph.responses.filter(response => assignmentIds.has(response.assignment_id)),
      // Response versions are keyed by assignment/member, including a tombstone
      // recorded before that same assignment moved from a former event.
      ...(graph.ownServiceResponseStates === undefined ? {} : { ownResponseStates: graph.ownServiceResponseStates.filter(state => state.event_id === record.id
        || assignments.some(assignment => assignment.id === state.assignment_id && assignment.team_member_id === actor.memberId)) }),
      members: activeMembers.map(member => ({ id: member.id, name: member.profiles?.full_name || "Team member" })),
      templates: graph.templates.map(({ id, name, default_roles }) => ({ id, name, default_roles })),
    },
    orderSongs: record.approval_status !== "approved" ? [] : graph.orderSongs.filter(slot => setlistIdsSet.has(slot.setlist_id))
      .sort((left, right) => left.song_order - right.song_order || left.id.localeCompare(right.id))
      .flatMap(slot => slot.song ? [{ id: slot.id, title: slot.song.title }] : []),
  };
}
