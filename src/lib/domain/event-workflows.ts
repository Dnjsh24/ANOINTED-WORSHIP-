import { z } from "zod";

import type { eventInputSchema, setlistInputSchema } from "@/lib/domain/validators";
import type { EventWindow } from "@/lib/domain/setlist-readiness";

export interface EventAssignments {
  worshipLeader?: string;
  acousticGuitar?: string;
  electricGuitar?: string;
  bass?: string;
  drums?: string;
  mainKeys?: string;
  secondKeys?: string;
  extraBandMembers?: string[];
  backupSingers?: string[];
  media?: string;
  dancers?: string[];
}

const assignmentLabels = ["Worship Leader", "Acoustic Guitar", "Electric Guitar", "Bass", "Drums", "Main Keys", "Second Keys", "Band Member", "Backup Singer", "Media", "Dancers"] as const;
export const eventConflictResponseSchema = z.object({
  conflicts: z.array(z.object({ memberName: z.string(), eventName: z.string() })),
});
export const eventAssignmentsSchema = z.array(z.object({
  team_member_id: z.uuid(), assignment: z.enum(assignmentLabels),
})).max(100).superRefine((rows, context) => {
  if (new Set(rows.map((row) => `${row.team_member_id}:${row.assignment}`)).size !== rows.length) {
    context.addIssue({ code: "custom", message: "Assign a member to each role only once." });
  }
});

const roleFields = [
  ["worshipLeader", "Worship Leader"], ["acousticGuitar", "Acoustic Guitar"], ["electricGuitar", "Electric Guitar"],
  ["bass", "Bass"], ["drums", "Drums"], ["mainKeys", "Main Keys"], ["secondKeys", "Second Keys"], ["media", "Media"],
  ["extraBandMembers", "Band Member"], ["backupSingers", "Backup Singer"], ["dancers", "Dancers"],
] as const satisfies ReadonlyArray<readonly [keyof EventAssignments, typeof assignmentLabels[number]]>;

export function buildEventAssignments(data: z.infer<typeof eventInputSchema>) {
  return roleFields.flatMap(([field, assignment]) => {
    const value = data[field];
    const ids = Array.isArray(value) ? value : value ? [value] : [];
    return ids.map((team_member_id) => ({ team_member_id, assignment }));
  });
}

export function buildEventDetails(data: z.infer<typeof eventInputSchema>) {
  return {
    name: data.title, type: data.eventType, event_date: data.date, starts_at: data.startTime,
    ends_at: data.endTime || null, location: data.location, description: data.notes || data.assignedTeams || null,
    rehearsal_date: data.rehearsalDate || null, rehearsal_time: data.rehearsalStartTime || null,
    rehearsal_end_time: data.rehearsalEndTime || null, recurrence_rule: data.recurrence,
  };
}

export function buildSetlistDetails(data: z.infer<typeof setlistInputSchema>, serviceTimes: string[]) {
  return {
    name: data.title, event_type: data.eventType, setlist_date: data.serviceDate,
    location: data.location, call_time: data.callTime, rehearsal_time: data.rehearsalTime,
    service_times: serviceTimes, notes: data.notes || null,
    ...(data.worshipLeader !== undefined ? { leader_member_id: data.worshipLeader || null } : {}),
  };
}

export function mapEventAssignments(rows: Array<{ team_member_id: string; assignment: string }>): EventAssignments {
  const result: EventAssignments = {};
  for (const [field, label] of roleFields) {
    const memberIds = rows.filter((row) => row.assignment === label).map((row) => row.team_member_id);
    if (field === "extraBandMembers" || field === "backupSingers" || field === "dancers") result[field] = memberIds;
    else result[field] = memberIds[0] ?? "";
  }
  return result;
}

export function eventScheduleWindows(event: {
  id: string; name: string; event_date: string; starts_at?: string | null; ends_at?: string | null;
  rehearsal_date?: string | null; rehearsal_time?: string | null; rehearsal_end_time?: string | null;
}): EventWindow[] {
  const windows: EventWindow[] = [{ id: event.id, name: event.name, date: event.event_date, startsAt: event.starts_at, endsAt: event.ends_at }];
  if (event.rehearsal_date && event.rehearsal_time) windows.push({
    id: event.id, name: `${event.name} (rehearsal)`, date: event.rehearsal_date,
    startsAt: event.rehearsal_time, endsAt: event.rehearsal_end_time,
  });
  return windows;
}
