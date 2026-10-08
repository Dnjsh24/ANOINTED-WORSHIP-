import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { eventWindowsOverlap } from "@/lib/domain/setlist-readiness";
import { eventScheduleWindows } from "@/lib/domain/event-workflows";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const conflictRequestSchema = z.object({
  date: z.iso.date(), memberIds: z.array(z.uuid()).max(50), excludeEventId: z.uuid().optional(),
  startTime: time.optional(), endTime: time.optional(), rehearsalDate: z.iso.date().optional(),
  rehearsalStartTime: time.optional(), rehearsalEndTime: time.optional(),
}).strict();

export async function POST(req: Request) {
  try {
    const { teamId } = await getRequiredTeamContext();
    if (!teamId) return NextResponse.json({ error: "Missing team" }, { status: 400 });
    const parsed = conflictRequestSchema.safeParse(await readBoundedJson(req, 16_384));
    if (!parsed.success) return NextResponse.json({ error: "Invalid conflict request" }, { status: 400 });
    const { date, memberIds, excludeEventId, startTime, endTime, rehearsalDate, rehearsalStartTime, rehearsalEndTime } = parsed.data;
    if (!memberIds.length) return NextResponse.json({ conflicts: [] });
    const supabase = await createClient();
    const dates = Array.from(new Set([date, rehearsalDate].filter((value): value is string => Boolean(value))));
    let query = supabase.from("events")
      .select("id, name, event_date, starts_at, ends_at, rehearsal_date, rehearsal_time, rehearsal_end_time, event_assignments(team_member_id)")
      .eq("team_id", teamId).eq("approval_status", "approved").is("deleted_at", null)
      .or(`event_date.in.(${dates.join(",")}),rehearsal_date.in.(${dates.join(",")})`);
    if (excludeEventId) query = query.neq("id", excludeEventId);
    const [eventsResult, membersResult] = await Promise.all([
      query,
      supabase.from("team_members").select("id, profile:profiles(full_name)")
        .eq("team_id", teamId).eq("status", "active").in("id", memberIds),
    ]);
    if (eventsResult.error || membersResult.error) {
      console.error("Conflict check unavailable:", safeErrorDetails(eventsResult.error ?? membersResult.error));
      return NextResponse.json({ error: "Scheduling conflicts could not be checked. Please retry." }, { status: 503 });
    }
    const names = new Map((membersResult.data ?? []).map((member) => {
      const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
      return [member.id, profile?.full_name || "A member"];
    }));
    const currentWindows = eventScheduleWindows({
      id: excludeEventId || "new", name: "This event", event_date: date, starts_at: startTime, ends_at: endTime,
      rehearsal_date: rehearsalDate, rehearsal_time: rehearsalStartTime, rehearsal_end_time: rehearsalEndTime,
    });
    const conflicts: Array<{ memberName: string; eventName: string }> = [];
    for (const event of eventsResult.data ?? []) {
      const overlapping = eventScheduleWindows(event).some((other) => currentWindows.some((current) => eventWindowsOverlap(current, other)));
      if (!overlapping) continue;
      const assignedIds = new Set(event.event_assignments.map((assignment) => assignment.team_member_id));
      for (const memberId of new Set(memberIds)) {
        const name = names.get(memberId);
        if (name && assignedIds.has(memberId)) conflicts.push({ memberName: name, eventName: event.name });
      }
    }
    return NextResponse.json({ conflicts });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Unexpected conflict check failure:", safeErrorDetails(error));
    return NextResponse.json({ error: "Scheduling conflicts could not be checked. Please retry." }, { status: 503 });
  }
}
