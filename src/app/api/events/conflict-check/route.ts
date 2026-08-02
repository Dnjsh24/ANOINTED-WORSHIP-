import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

const conflictRequestSchema = z.object({
  date: z.iso.date(),
  memberIds: z.array(z.uuid()).max(50),
  excludeEventId: z.uuid().optional(),
}).strict();

type ConflictEvent = {
  id: string;
  name: string;
  event_assignments: Array<{ profile_id: string }>;
};

export async function POST(req: Request) {
  try {
    const { teamId } = await getRequiredTeamContext();
    if (!teamId) {
      return NextResponse.json({ error: "Missing team" }, { status: 400 });
    }

    const parsed = conflictRequestSchema.safeParse(await readBoundedJson(req, 16_384));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid conflict request" }, { status: 400 });
    }
    const { date, memberIds, excludeEventId } = parsed.data;

    if (memberIds.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    const supabase = await createClient();

    // Find all events on the same date for the team, excluding the current event if we are editing
    let query = supabase
      .from("events")
      .select("id, name, event_assignments(profile_id)")
      .eq("team_id", teamId)
      .eq("event_date", date);
      
    if (excludeEventId) {
      query = query.neq("id", excludeEventId);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Conflict check error:", safeErrorDetails(error));
      return NextResponse.json({ conflicts: [] });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    // assigned_teams has the format { worshipLeader: string, ... }
    // We want to fetch the member names for the conflicting IDs
    const { data: members } = await supabase
      .from("team_members")
      .select("id, profile:profiles(full_name)")
      .in("id", memberIds);

    const memberNames = new Map<string, string>();
    if (members) {
      for (const m of members) {
        if (m.profile) {
          const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
          memberNames.set(m.id, profile.full_name || "Unknown Member");
        }
      }
    }

    const conflicts: { memberName: string; eventName: string }[] = [];

    for (const ev of events as unknown as ConflictEvent[]) {
      if (!ev.event_assignments || ev.event_assignments.length === 0) continue;
      
      const eventAssignedIds = new Set(
        ev.event_assignments.map((assignment) => assignment.profile_id),
      );

      for (const reqId of memberIds) {
        if (eventAssignedIds.has(reqId)) {
          conflicts.push({
            memberName: memberNames.get(reqId) || "A member",
            eventName: ev.name
          });
        }
      }
    }

    return NextResponse.json({ conflicts });

  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Unexpected conflict check failure:", safeErrorDetails(error));
    return NextResponse.json({ conflicts: [] }, { status: 500 });
  }
}
