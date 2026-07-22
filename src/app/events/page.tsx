import { AppShell } from "@/components/app-shell";
import { EventsClient } from "@/components/events-client";
import { can, canReviewEventRequests } from "@/lib/domain/rbac";
import { events as sampleEvents } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { Event } from "@/lib/types";

export default async function EventsPage() {
  const teamContext = await getRequiredTeamContext();
  let eventsList: Event[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch events along with their nested assignments, attendance, setlists, and active members count in parallel
    const [eventsResult, activeMembersResult] = await Promise.all([
      supabase
        .from("events")
        .select(`
          *,
          event_assignments (
            assignment
          ),
          attendance (
            team_member_id,
            status
          ),
          setlists (
            id
          )
        `)
        .eq("team_id", teamContext.teamId)
        .order("event_date", { ascending: true }),
      supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamContext.teamId)
        .eq("status", "active"),
    ]);

    const dbEvents = eventsResult.data;
    const totalMembers = activeMembersResult.count;

    if (dbEvents && dbEvents.length > 0) {
      eventsList = dbEvents.map((e: any) => {
        let timeStr = e.ends_at
          ? `${e.starts_at.slice(0, 5)} - ${e.ends_at.slice(0, 5)}`
          : e.starts_at.slice(0, 5);

        if (e.type === "service_rehearsal") {
          const rehStart = e.rehearsal_time ? e.rehearsal_time.slice(0, 5) : "";
          const rehEnd = e.rehearsal_end_time ? e.rehearsal_end_time.slice(0, 5) : "";
          const rehTime = rehEnd ? `${rehStart} - ${rehEnd}` : rehStart;
          const svcTime = e.ends_at ? `${e.starts_at.slice(0, 5)} - ${e.ends_at.slice(0, 5)}` : e.starts_at.slice(0, 5);
          timeStr = `Rehearsal: ${rehTime} | Service: ${svcTime}`;
        }

        const assignedTeams = Array.from(
          new Set((e.event_assignments ?? []).map((ass: any) => ass.assignment))
        ) as string[];

        const eventAttendance = e.attendance ?? [];
        const confirmed = eventAttendance.filter((a: any) => a.status === "available").length;
        const respondedCount = eventAttendance.length;
        const noResponseCount = Math.max(0, (totalMembers || 0) - respondedCount);
        const pending = eventAttendance.filter((a: any) => a.status === "maybe").length + noResponseCount;

        const setlistId = e.setlists?.[0]?.id || null;

        let myStatus: "available" | "maybe" | "unavailable" | "pending" | "no_response" = "no_response";
        const myAttendance = eventAttendance.find((a: any) => a.team_member_id === teamContext.memberId);
        if (myAttendance) {
          myStatus = myAttendance.status;
        }

        return {
          id: e.id,
          name: e.name,
          type: e.type,
          date: e.event_date,
          time: timeStr,
          rehearsalDate: e.rehearsal_date ?? null,
          rehearsalStart: e.rehearsal_time ? e.rehearsal_time.slice(0, 5) : null,
          location: e.location ?? "Main Sanctuary",
          assignedTeams,
          confirmed,
          pending,
          approvalStatus: e.approval_status ?? "approved",
          createdByMe: e.created_by === teamContext.userId,
          setlistId,
          myStatus,
        };
      });
    }
  } else {
    // Fallback to sample data when Supabase is not configured (demo mode)
    eventsList = sampleEvents as Event[];
  }

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      <EventsClient
        events={eventsList}
        canReviewEvents={canReviewEventRequests(teamContext.role as any)}
        memberSubmissionMode={!can(teamContext.role, "events.manage")}
      />
    </AppShell>
  );
}
