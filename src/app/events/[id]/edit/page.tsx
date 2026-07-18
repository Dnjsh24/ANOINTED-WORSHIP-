import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EventForm } from "@/components/event-form";
import { Panel } from "@/components/ui/card";
import { can } from "@/lib/domain/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canEditEvents = can(teamContext.role, "events.manage");
  
  if (!canEditEvents) {
    notFound();
  }

  const canLinkSetlists = can(teamContext.role, "setlists.manage");
  let setlistsList: Array<{ id: string; name: string; date: string }> = [];
  let dbEvent = null;

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split("T")[0];

    // Fetch the event
    const { data: eventData } = await supabase
      .from("events")
      .select(`
        *,
        event_assignments (
          assignment
        ),
        setlists (
          id
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (!eventData) {
      notFound();
    }
    dbEvent = eventData;

    // Fetch recent setlists
    const { data: dbSetlists } = await supabase
      .from("setlists")
      .select("id, name, setlist_date")
      .eq("team_id", teamContext.teamId)
      .gte("setlist_date", todayStr)
      .order("setlist_date", { ascending: true });

    if (dbSetlists) {
      setlistsList = dbSetlists.map((s: any) => ({
        id: s.id,
        name: s.name,
        date: s.setlist_date,
      }));
    }
  } else {
    notFound();
  }

  const assignedFromDb = dbEvent.event_assignments ? dbEvent.event_assignments.map((a: any) => a.assignment) : [];
  const assignedFromDescription = dbEvent.description
    ? dbEvent.description.split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const assigned = assignedFromDb.length > 0 ? assignedFromDb : assignedFromDescription;

  // Description is often used for assignedTeams if no notes were provided.
  const assignedTeamsStr = assigned.join(", ");
  const notesStr = dbEvent.description === assignedTeamsStr ? "" : (dbEvent.description || "");

  const initialEvent = {
    id: dbEvent.id,
    name: dbEvent.name,
    type: dbEvent.type,
    date: dbEvent.event_date,
    startTime: dbEvent.starts_at ? dbEvent.starts_at.slice(0, 5) : "09:00",
    endTime: dbEvent.ends_at ? dbEvent.ends_at.slice(0, 5) : "",
    rehearsalDate: dbEvent.rehearsal_date ?? "",
    rehearsalStartTime: dbEvent.rehearsal_time ? dbEvent.rehearsal_time.slice(0, 5) : "",
    rehearsalEndTime: dbEvent.rehearsal_end_time ? dbEvent.rehearsal_end_time.slice(0, 5) : "",
    location: dbEvent.location ?? "Main Sanctuary",
    assignedTeams: assigned.length > 0 ? assigned : ["Worship Band"],
    notes: notesStr,
    linkedSetlistId: dbEvent.setlists?.[0]?.id || "",
  };

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      <div className="mb-6 animate-fade-up">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Events & Rehearsal</p>
        <h1 className="mt-2 text-4xl font-bold">Edit Event</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">
          Update event details and logistics.
        </p>
      </div>
      <Panel className="animate-scale-in">
        <EventForm
          setlists={setlistsList}
          requiresApproval={false}
          canLinkSetlists={canLinkSetlists}
          initialEvent={initialEvent}
        />
      </Panel>
    </AppShell>
  );
}
