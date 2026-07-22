import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export async function POST(req: Request) {
  try {
    const { teamId } = await getRequiredTeamContext();
    if (!teamId) {
      return NextResponse.json({ error: "Missing team" }, { status: 400 });
    }

    const { date, memberIds, excludeEventId } = await req.json();

    if (!date || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
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
      console.error("Conflict check error:", error);
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

    for (const ev of events) {
      if (!ev.event_assignments || ev.event_assignments.length === 0) continue;
      
      const eventAssignedIds = new Set<string>(ev.event_assignments.map((ea: any) => ea.profile_id));

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

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ conflicts: [] }, { status: 500 });
  }
}
