import { AppShell } from "@/components/app-shell";
import { EventsClient } from "@/components/events-client";
import { events as sampleEvents } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import type { Event } from "@/lib/types";

export default async function EventsPage() {
  const teamContext = await getCurrentTeamContext();
  let eventsList: Event[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // 1. Fetch events for this team
    const { data: dbEvents } = (await supabase
      .from("events")
      .select("*")
      .eq("team_id", teamContext.teamId)
      .order("event_date", { ascending: true })) as any;

    if (dbEvents && dbEvents.length > 0) {
      const eventIds = dbEvents.map((e: any) => e.id);

      // 2. Fetch distinct roles/assignments for these events
      let assignmentsMap: Record<string, string[]> = {};
      const { data: dbAssignments } = (await supabase
        .from("event_assignments")
        .select("event_id, assignment")
        .in("event_id", eventIds)) as any;

      if (dbAssignments) {
        dbAssignments.forEach((ass: any) => {
          if (!assignmentsMap[ass.event_id]) {
            assignmentsMap[ass.event_id] = [];
          }
          if (!assignmentsMap[ass.event_id].includes(ass.assignment)) {
            assignmentsMap[ass.event_id].push(ass.assignment);
          }
        });
      }

      // 3. Fetch attendance RSVP counts
      let attendanceMap: Record<string, { confirmed: number; pending: number }> = {};
      const { data: dbAttendance } = (await supabase
        .from("attendance")
        .select("event_id, status")
        .in("event_id", eventIds)) as any;

      const { count: totalMembers } = (await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamContext.teamId)
        .eq("status", "active")) as any;

      dbEvents.forEach((e: any) => {
        const eventAttendance = (dbAttendance ?? []).filter((a: any) => a.event_id === e.id);
        const confirmed = eventAttendance.filter((a: any) => a.status === "available").length;
        const respondedCount = eventAttendance.length;
        const noResponseCount = Math.max(0, (totalMembers || 0) - respondedCount);
        const pending = eventAttendance.filter((a: any) => a.status === "maybe").length + noResponseCount;
        attendanceMap[e.id] = { confirmed, pending };
      });

      // 3.5 Fetch linked setlist IDs
      let setlistMap: Record<string, string> = {};
      const { data: dbSetlists } = (await supabase
        .from("setlists")
        .select("id, event_id")
        .in("event_id", eventIds)) as any;
      if (dbSetlists) {
        dbSetlists.forEach((s: any) => {
          if (s.event_id) {
            setlistMap[s.event_id] = s.id;
          }
        });
      }

      // 4. Construct final list
      eventsList = dbEvents.map((e: any) => {
        const timeStr = e.ends_at
          ? `${e.starts_at.slice(0, 5)} - ${e.ends_at.slice(0, 5)}`
          : e.starts_at.slice(0, 5);

        return {
          id: e.id,
          name: e.name,
          type: e.type,
          date: e.event_date,
          time: timeStr,
          location: e.location ?? "Main Sanctuary",
          assignedTeams: assignmentsMap[e.id] || [],
          confirmed: attendanceMap[e.id]?.confirmed ?? 0,
          pending: attendanceMap[e.id]?.pending ?? 0,
          setlistId: setlistMap[e.id],
        };
      });
    }
  } else {
    // Fallback to sample data when Supabase is not configured (demo mode)
    eventsList = sampleEvents as Event[];
  }

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      <EventsClient events={eventsList} />
    </AppShell>
  );
}
