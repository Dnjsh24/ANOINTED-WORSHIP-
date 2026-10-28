import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { canForTeam, editablePermissions, resolvePermissionOverrides } from "@/lib/domain/permission-overrides";
import { canReviewEventRequests } from "@/lib/domain/rbac";
import { permissionValues } from "@/lib/domain/wooly-permissions";
import type { Database } from "@/lib/supabase/database.types";
import type { WorkflowDatabase } from "@/lib/supabase/workflow.types";
import { teamRoles } from "@/lib/types";
import { isServiceResponseStateConsistent, mobileServiceAssignmentStateSchema } from './service-response-state';
import { jsonEqual } from '../json-equal';
import {
  getEventReadModel, isEventOwnAttendanceStateConsistent, mobileEventAssignmentResponseSchema, mobileEventAssignmentSchema, mobileEventAttendanceSchema,
  mobileEventOwnAttendanceStateRowSchema,
  mobileEventMemberSchema, mobileEventOrderSongSchema, mobileEventRowSchema, mobileEventServiceOrderSchema,
  mobileEventServiceTemplateSchema, mobileEventSetlistSchema, type MobileEventPermissions, type MobileEventReadModel,
} from "./event-read-models";

const identitySchema = z.object({ userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid() }).strict();
export type EventReadIdentity = z.infer<typeof identitySchema>;
export type EventReadAuthorization = EventReadIdentity & { role: typeof teamRoles[number]; permissions: typeof permissionValues };
export type ReadEventsOptions = { client: SupabaseClient<Database>; identity: EventReadIdentity; accessToken?: string; signal?: AbortSignal; pageSize?: number; onVerified?: (authorization: EventReadAuthorization) => Promise<void> | void };
export class EventReadError extends Error {
  readonly category: "unauthorized" | "forbidden" | "unavailable";
  constructor(message: string, readonly status = 503) {
    super(message); this.name = "EventReadError";
    this.category = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "unavailable";
  }
}
const membershipSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), status: z.literal("active"), role: z.enum(teamRoles), custom_role_id: z.uuid().nullable(),
  custom_roles: z.object({ id: z.uuid(), team_id: z.uuid(), permissions: z.array(z.enum(permissionValues)).nullable() }).strict().nullable(),
}).strict();
const overrideSchema = z.object({ id: z.uuid(), team_id: z.uuid(), role: z.enum(teamRoles).nullable(), member_id: z.uuid().nullable(), permission: z.enum(editablePermissions), allowed: z.boolean() }).strict()
  .refine(row => (row.role === null) !== (row.member_id === null));
type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
// Additive draft schema extension. The reader is read-only and fails unavailable
// when the deployed migration is absent; it never substitutes revision zero.
type AttendanceStateDatabase = Omit<Database, "public"> & { public: Database["public"] & { Tables: Database["public"]["Tables"] & {
  mobile_workflow_attendance_state: { Row: z.infer<typeof mobileEventOwnAttendanceStateRowSchema>; Insert: never; Update: never; Relationships: [] };
  mobile_service_assignment_state: { Row: z.infer<typeof mobileServiceAssignmentStateSchema>; Insert: never; Update: never; Relationships: [] };
} } };
const eventColumns = "id,team_id,name,type,event_date,starts_at,ends_at,call_time,location,description,rehearsal_date,rehearsal_time,rehearsal_end_time,recurrence_rule,recurrence_parent_id,approval_status,requested_assignments,created_by,created_at,updated_at,deleted_at,sync_revision";

function abort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException("The event read was aborted.", "AbortError");
}
function failure(error: unknown, authentication = false): EventReadError {
  const details = error && typeof error === "object" ? error as { status?: unknown; code?: unknown; name?: unknown } : {};
  const status = authentication && (details.status === 401 || details.status === 403) ? details.status
    : ["PGRST301", "PGRST302", "PGRST303"].includes(String(details.code)) || details.name === "AuthSessionMissingError" ? 401 : 503;
  return new EventReadError("Event data could not be verified. Retry without discarding your saved data.", status);
}
async function result(query: QueryResult, signal?: AbortSignal) {
  abort(signal);
  try {
    const response = await query;
    abort(signal);
    if (response.error) throw failure(response.error);
    return response.data;
  } catch (error) {
    abort(signal);
    throw error instanceof EventReadError ? error : failure(error);
  }
}
async function pages<Schema extends z.ZodType>(schema: Schema, key: (row: z.infer<Schema>) => string, fetch: (after: string | null) => QueryResult, pageSize: number, signal?: AbortSignal): Promise<z.infer<Schema>[]> {
  const rows: z.infer<Schema>[] = [];
  let after: string | null = null;
  for (;;) {
    const parsed = z.array(schema).max(pageSize).safeParse(await result(fetch(after), signal));
    if (!parsed.success) throw new EventReadError("Event response is invalid.");
    for (const row of parsed.data) {
      const cursor = key(row);
      if (after !== null && cursor <= after) throw new EventReadError("Event pagination did not advance.");
      after = cursor;
      rows.push(row);
    }
    // Continue until an empty page: a server row cap below requested size must not truncate history.
    if (!parsed.data.length) return rows;
  }
}
function chunks(ids: readonly string[], size: number): string[][] {
  return Array.from({ length: Math.ceil(ids.length / size) }, (_, index) => ids.slice(index * size, (index + 1) * size));
}

async function verify(options: ReadEventsOptions, pageSize: number) {
  abort(options.signal);
  const parsedIdentity = identitySchema.safeParse(options.identity);
  if (!parsedIdentity.success) throw new EventReadError("The event account/workspace identity is invalid.");
  const identity = parsedIdentity.data;
  let authentication: Awaited<ReturnType<typeof options.client.auth.getUser>>;
  try { authentication = await options.client.auth.getUser(options.accessToken); }
  catch (error) { abort(options.signal); throw failure(error, true); }
  abort(options.signal);
  if (authentication.error) throw failure(authentication.error, true);
  if (authentication.data.user?.id !== identity.userId) throw new EventReadError("Sign in to the matching account to read events.", 401);
  let query = options.client.from("team_members").select("id,team_id,profile_id,status,role,custom_role_id,custom_roles(id,team_id,permissions)")
    .eq("id", identity.memberId).eq("team_id", identity.teamId).eq("profile_id", identity.userId).eq("status", "active");
  if (options.signal) query = query.abortSignal(options.signal);
  const raw = await result(query.maybeSingle(), options.signal);
  if (raw === null) throw new EventReadError("An active matching workspace membership is required.", 403);
  const parsed = membershipSchema.safeParse(raw);
  if (!parsed.success) throw new EventReadError("Workspace membership response is invalid.");
  const member = parsed.data;
  if (member.id !== identity.memberId || member.team_id !== identity.teamId || member.profile_id !== identity.userId) throw new EventReadError("Workspace membership does not match this account.", 403);
  if (member.custom_role_id && (member.custom_roles?.id !== member.custom_role_id || member.custom_roles.team_id !== identity.teamId)) throw new EventReadError("Workspace custom role is unavailable.", 403);
  const overrides = member.role === "owner" ? [] : await pages(overrideSchema, row => row.id, after => {
    let read = options.client.from("team_permission_overrides").select("id,team_id,role,member_id,permission,allowed").eq("team_id", identity.teamId)
      .or(`role.eq.${member.role},member_id.eq.${identity.memberId}`).order("id").limit(pageSize);
    if (after) read = read.gt("id", after);
    return options.signal ? read.abortSignal(options.signal) : read;
  }, pageSize, options.signal);
  if (overrides.some(row => row.team_id !== identity.teamId || !(row.role === member.role || row.member_id === identity.memberId))) throw new EventReadError("Permission response does not match this workspace.");
  const targets = overrides.map(row => `${row.role ?? row.member_id}:${row.permission}`);
  if (new Set(targets).size !== targets.length) throw new EventReadError("Permission response is ambiguous.");
  const context = { role: member.role, customPermissions: member.custom_role_id ? member.custom_roles?.permissions ?? [] : [], permissionOverrides: resolvePermissionOverrides(overrides, member.role, member.id) };
  const permissions: MobileEventPermissions = {
    canManage: canForTeam(context, "events.manage"), canReview: canReviewEventRequests(member.role), canRequest: canForTeam(context, "events.request"),
    canConfirmAttendance: canForTeam(context, "attendance.confirm"), canManageSetlists: canForTeam(context, "setlists.manage"),
  };
  const authorization = { ...identity, role: member.role, permissions: permissionValues.filter(permission => canForTeam(context, permission)) };
  await options.onVerified?.(authorization);
  abort(options.signal);
  return { identity, role: member.role, permissions, authorization, fingerprint: JSON.stringify({ member, overrides }) };
}

// The editor uses the same authenticated paging and permission checks as the timeline.
export { verify as verifyEventReadAccess, pages as readEventPages, eventColumns as eventReadColumns };

/** Complete paginated live read, not an immutable snapshot or a delta/revocation protocol. Uses the caller's injected native-fetch client. */
export async function readEventLibrary(options: ReadEventsOptions): Promise<MobileEventReadModel[]> {
  return readEvents(options);
}
export async function readEventDetail(options: ReadEventsOptions & { eventId: string }): Promise<MobileEventReadModel | null> {
  if (!z.uuid().safeParse(options.eventId).success) throw new EventReadError("The event ID is invalid.");
  return (await readEvents(options, options.eventId))[0] ?? null;
}
async function readEvents(options: ReadEventsOptions, eventId?: string): Promise<MobileEventReadModel[]> {
  const pageSize = options.pageSize ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new EventReadError("Event page size must be between 1 and 500.");
  const verified = await verify(options, pageSize);
  const { identity, role, permissions } = verified;
  const { client, signal } = options;
  const batchSize = Math.min(pageSize, 50);
  const events = await pages(mobileEventRowSchema, row => row.id, after => {
    let query = client.from("events").select(eventColumns).eq("team_id", identity.teamId).order("id").limit(pageSize);
    if (eventId) query = query.eq("id", eventId);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  }, pageSize, signal);
  if (events.some(row => row.team_id !== identity.teamId || (eventId && row.id !== eventId)
    || (row.approval_status !== "approved" && row.created_by !== identity.userId && role !== "owner" && role !== "admin"))) throw new EventReadError("Event visibility does not match this account.", 403);
  const members = await pages(mobileEventMemberSchema, row => row.id, after => {
    let query = client.from("team_members").select("id,team_id,profile_id,status,profiles(id,full_name,avatar_url)").eq("team_id", identity.teamId).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  }, pageSize, signal);
  if (members.some(member => member.team_id !== identity.teamId || (member.profiles && member.profiles.id !== member.profile_id))) throw new EventReadError("Event roster does not match this workspace.");
  const readChildren = async <Schema extends z.ZodType>(schema: Schema, ids: string[], key: (row: z.infer<Schema>) => string,
    parent: (row: z.infer<Schema>) => string, query: (batch: string[], after: string | null) => QueryResult) => {
    const children: z.infer<Schema>[] = [];
    for (const batch of chunks(ids, batchSize)) {
      const rows = await pages(schema, key, after => query(batch, after), pageSize, signal);
      if (rows.some(row => !batch.includes(parent(row)))) throw new EventReadError("Event child response has an unexpected parent.");
      children.push(...rows);
    }
    return children;
  };
  const eventIds = events.map(event => event.id);
  const assignments = await readChildren(mobileEventAssignmentSchema, eventIds, row => row.id, row => row.event_id, (batch, after) => {
    let query = client.from("event_assignments").select("id,event_id,team_member_id,assignment,created_at").in("event_id", batch).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  const attendance = await readChildren(mobileEventAttendanceSchema, eventIds, row => row.id, row => row.event_id, (batch, after) => {
    let query = client.from("attendance").select("id,event_id,team_member_id,status,note,responded_at,created_at,updated_at,sync_revision").in("event_id", batch).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  const attendanceStateClient = client as SupabaseClient<AttendanceStateDatabase>;
  const ownAttendanceStates = await readChildren(mobileEventOwnAttendanceStateRowSchema, eventIds, row => row.event_id, row => row.event_id, (batch, after) => {
    let query = attendanceStateClient.from("mobile_workflow_attendance_state").select("actor_id,team_id,event_id,member_id,attendance_id,revision,deleted,changed_at")
      .eq("actor_id", identity.userId).eq("team_id", identity.teamId).eq("member_id", identity.memberId)
      .in("event_id", batch).order("event_id").limit(pageSize);
    if (after) query = query.gt("event_id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  if (ownAttendanceStates.some(state => state.actor_id !== identity.userId || state.team_id !== identity.teamId || state.member_id !== identity.memberId)) {
    throw new EventReadError("Attendance state does not match this account and workspace.");
  }
  const setlists = await readChildren(mobileEventSetlistSchema, eventIds, row => row.id, row => row.event_id, (batch, after) => {
    let query = client.from("setlists").select("id,team_id,event_id,deleted_at").eq("team_id", identity.teamId).in("event_id", batch).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  if (setlists.some(setlist => setlist.team_id !== identity.teamId)) throw new EventReadError("Event setlist belongs to another workspace.");
  const memberIds = new Set(members.map(member => member.id));
  if ([...assignments, ...attendance].some(row => !memberIds.has(row.team_member_id))) throw new EventReadError("Event response has an unavailable roster member. Retry.");
  // Workflow tables are an existing website schema extension, not a new database/export capability.
  const workflow = client as SupabaseClient<WorkflowDatabase>;
  const approvedIds = events.filter(event => event.approval_status === "approved").map(event => event.id);
  const orders = await readChildren(mobileEventServiceOrderSchema, approvedIds, row => row.event_id, row => row.event_id, (batch, after) => {
    let query = workflow.from("service_orders").select("event_id,team_id,revision,entries,required_roles,updated_by,updated_at").eq("team_id", identity.teamId).in("event_id", batch).order("event_id").limit(pageSize);
    if (after) query = query.gt("event_id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  if (orders.some(order => order.team_id !== identity.teamId)) throw new EventReadError("Service order belongs to another workspace.");
  const approvedAssignments = assignments.filter(assignment => approvedIds.includes(assignment.event_id));
  const responses = await readChildren(mobileEventAssignmentResponseSchema.extend({ sync_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }), approvedAssignments.map(row => row.id), row => row.assignment_id, row => row.assignment_id, (batch, after) => {
    let query = workflow.from("assignment_responses").select("assignment_id,team_member_id,state,note,updated_at,sync_revision").in("assignment_id", batch).order("assignment_id").limit(pageSize);
    if (after) query = query.gt("assignment_id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  if (responses.some(response => approvedAssignments.find(assignment => assignment.id === response.assignment_id)?.team_member_id !== response.team_member_id)) throw new EventReadError("Assignment response does not match its assigned member.");
  const serviceStatesByEvent = await readChildren(mobileServiceAssignmentStateSchema, approvedIds, row => row.assignment_id, row => row.event_id, (batch, after) => {
    let query = attendanceStateClient.from('mobile_service_assignment_state').select('actor_id,team_id,event_id,assignment_id,member_id,revision,deleted,changed_at')
      .eq('actor_id', identity.userId).eq('team_id', identity.teamId).eq('member_id', identity.memberId).in('event_id', batch).order('assignment_id').limit(pageSize);
    if (after) query = query.gt('assignment_id', after);
    return signal ? query.abortSignal(signal) : query;
  });
  // A response tombstone may still name an earlier event after the assignment
  // moves. Fetch current own assignment IDs too; never turn that prior version into zero.
  const serviceStatesByAssignment = await readChildren(mobileServiceAssignmentStateSchema, approvedAssignments.filter(row => row.team_member_id === identity.memberId).map(row => row.id),
    row => row.assignment_id, row => row.assignment_id, (batch, after) => {
      let query = attendanceStateClient.from('mobile_service_assignment_state').select('actor_id,team_id,event_id,assignment_id,member_id,revision,deleted,changed_at')
        .eq('actor_id', identity.userId).eq('team_id', identity.teamId).eq('member_id', identity.memberId).in('assignment_id', batch).order('assignment_id').limit(pageSize);
      if (after) query = query.gt('assignment_id', after);
      return signal ? query.abortSignal(signal) : query;
    });
  const serviceStates = new Map<string, z.infer<typeof mobileServiceAssignmentStateSchema>>();
  for (const state of [...serviceStatesByEvent, ...serviceStatesByAssignment]) {
    const previous = serviceStates.get(state.assignment_id);
    if (previous && !jsonEqual(previous, state)) throw new EventReadError('Assignment response state changed between pages. Retry the complete read.');
    serviceStates.set(state.assignment_id, state);
  }
  const ownServiceResponseStates = [...serviceStates.values()];
  if (ownServiceResponseStates.some(state => state.actor_id !== identity.userId || state.team_id !== identity.teamId || state.member_id !== identity.memberId)) {
    throw new EventReadError('Service response state does not match this account and workspace.');
  }
  const templates = !approvedIds.length ? [] : await pages(mobileEventServiceTemplateSchema, row => row.id, after => {
    let query = client.from("service_templates").select("id,team_id,name,default_roles").eq("team_id", identity.teamId).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  }, pageSize, signal);
  if (templates.some(template => template.team_id !== identity.teamId)) throw new EventReadError("Service template belongs to another workspace.");
  const orderSongs = await readChildren(mobileEventOrderSongSchema, setlists.filter(setlist => approvedIds.includes(setlist.event_id)).map(setlist => setlist.id), row => row.id, row => row.setlist_id, (batch, after) => {
    let query = client.from("setlist_songs").select("id,setlist_id,song_order,deleted_at,song:songs(id,title,team_id)").in("setlist_id", batch).is("deleted_at", null).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    return signal ? query.abortSignal(signal) : query;
  });
  if (orderSongs.some(slot => slot.deleted_at !== null || (slot.song && slot.song.team_id !== identity.teamId))) throw new EventReadError("Service song belongs to another workspace.");
  const current = await verify(options, pageSize);
  if (current.fingerprint !== verified.fingerprint) throw new EventReadError("Workspace permissions changed during this event read. Reload this workspace.", 403);
  const models = events.map(row => getEventReadModel(row, { members, assignments, attendance, ownAttendanceStates, setlists, orders, responses, ownServiceResponseStates, templates, orderSongs }, identity, permissions));
  if (models.some(model => !isEventOwnAttendanceStateConsistent(model.ownAttendanceState, model.attendance, identity, model.id))) {
    throw new EventReadError("Attendance changed during this read. Retry before using it as a saved edit base.");
  }
  if (models.some(model => !isServiceResponseStateConsistent(model, identity))) throw new EventReadError('Assignment response changed during this read. Retry before using it as a saved edit base.');
  return models.sort((left, right) => left.date.localeCompare(right.date) || left.record.starts_at.localeCompare(right.record.starts_at) || left.id.localeCompare(right.id));
}
