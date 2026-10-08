import { canForTeam } from "@/lib/domain/permission-overrides";
import { mapEventAssignments, eventAssignmentsSchema } from "@/lib/domain/event-workflows";
import type { Json } from "@/lib/supabase/database.types";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EventForm } from "@/components/event-form";
import { Panel } from "@/components/ui/card";
import { fallbackServiceTemplates, mapServiceTemplate } from "@/lib/domain/service-templates";
import { events as sampleEvents, members as sampleMembers } from "@/lib/sample-data";
import type { EventType, ServiceTemplate, TeamMember, TeamRole } from "@/lib/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
type EditableEventRow = {
  id: string;
  sync_revision: number;
  name: string;
  type: EventType;
  event_date: string;
  starts_at: string;
  ends_at: string | null;
  rehearsal_date: string | null;
  rehearsal_time: string | null;
  rehearsal_end_time: string | null;
  location: string | null;
  description: string | null;
  event_assignments: Array<{ team_member_id: string; assignment: string }>;
  requested_assignments: Json;
  approval_status: string;
  setlists: Array<{ id: string }>;
};

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canEditEvents = canForTeam(teamContext, "events.manage");
  
  if (!canEditEvents) {
    notFound();
  }

  let canLinkSetlists = canForTeam(teamContext, "setlists.manage");
  let teamMembersList: TeamMember[] = [];
  let serviceTemplates: ServiceTemplate[] = fallbackServiceTemplates;
  let setlistsList: Array<{ id: string; name: string; date: string }> = [];
  let dbEvent: EditableEventRow | null = null;

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split("T")[0];


    // Fetch team members
    const { data: dbMembers, error: membersError } = await supabase
      .from("team_members")
      .select("id, profile_id, role, status, ministry, ministries")
      .eq("team_id", teamContext.teamId).eq("status", "active")
      .order("created_at", { ascending: true });

    if (membersError) throw new Error("Event members are unavailable. Please retry.");

    // Collect profile IDs
    const memberProfileIds = (dbMembers ?? []).map((tm) => tm.profile_id);

    // Fetch profiles
    let memberProfilesMap: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
    if (memberProfileIds.length > 0) {
      const { data: memberProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberProfileIds);

      if (profilesError) throw new Error("Event member profiles are unavailable. Please retry.");
      memberProfilesMap = Object.fromEntries(
        (memberProfiles ?? []).map((p) => [p.id, { id: p.id, full_name: p.full_name, email: p.email }])
      );
    }

    teamMembersList = (dbMembers ?? []).map((tm) => {
      const profile = memberProfilesMap[tm.profile_id];
      return {
        id: tm.id,
        profile: {
          id: profile?.id ?? tm.profile_id,
          fullName: profile?.full_name ?? "Unknown",
          email: profile?.email ?? "",
        },
        role: (tm.role as TeamRole) ?? "member",
        status: (tm.status as "active" | "inactive") ?? "active",
        attendanceRate: 0,
        ministry: tm.ministry ?? "",
        ministries: tm.ministries ?? (tm.ministry ? [tm.ministry] : []),
      };
    });

    
    const { data: templateRows, error: templatesError } = await supabase
      .from("service_templates")
      .select("id, name, service_type, location, call_time, rehearsal_time, reminder_frequency, reminder_occurrences, default_roles")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true });

    if (templatesError) throw new Error("Event templates are unavailable. Please retry.");
    if (templateRows && templateRows.length > 0) {
      serviceTemplates = templateRows.map(mapServiceTemplate);
    }


    // Fetch the event
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select(`
        *,
        event_assignments (
          team_member_id, assignment
        ),
        setlists (
          id
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (eventError) throw new Error("Event details are unavailable. Please retry.");
    if (!eventData) {
      notFound();
    }
    dbEvent = eventData as unknown as EditableEventRow;

    // Fetch recent setlists
    if (canLinkSetlists) {
      const { data: dbSetlists, error: setlistsError } = await supabase
        .from("setlists")
        .select("id, name, setlist_date")
        .eq("team_id", teamContext.teamId)
        .gte("setlist_date", todayStr)
        .order("setlist_date", { ascending: true });
  
      if (setlistsError) throw new Error("Linked setlists are unavailable. Please retry.");
      if (dbSetlists) {
        setlistsList = dbSetlists.map((setlist) => ({
          id: setlist.id,
          name: setlist.name,
          date: setlist.setlist_date,
        }));
      }
    }
  } else if (!hasSupabaseEnv()) {
    teamMembersList = sampleMembers;
    const sampleEvent = sampleEvents.find((event) => event.id === id);
    if (!sampleEvent) {
      notFound();
    }
    dbEvent = {
      id: sampleEvent.id,
      sync_revision: 0,
      name: sampleEvent.name,
      type: sampleEvent.type,
      event_date: sampleEvent.date,
      starts_at: sampleEvent.time.match(/\d{1,2}:\d{2}/)?.[0] ?? "09:00",
      ends_at: sampleEvent.time.match(/-\s*(\d{1,2}:\d{2})/)?.[1] ?? null,
      rehearsal_date: null,
      rehearsal_time: null,
      rehearsal_end_time: null,
      location: sampleEvent.location,
      description: sampleEvent.assignedTeams.join(", "),
      event_assignments: [],
      requested_assignments: [], approval_status: "approved",
      setlists: [],
    };
  } else {
    notFound();
  }

  if (!dbEvent) {
    notFound();
  }
  if (dbEvent.approval_status !== "approved") canLinkSetlists = false;

  const proposedAssignments = eventAssignmentsSchema.safeParse(dbEvent.requested_assignments);
  if (dbEvent.approval_status === "pending" && !proposedAssignments.success) throw new Error("Event assignment proposals are unavailable.");
  const initialAssignments = mapEventAssignments(dbEvent.approval_status === "pending" && proposedAssignments.success ? proposedAssignments.data : dbEvent.event_assignments);

  const assignedFromDb = dbEvent.event_assignments
    ? dbEvent.event_assignments.map((assignment) => assignment.assignment)
    : [];
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
          revision={dbEvent.sync_revision}
          initialAssignments={initialAssignments}
          teamMembers={teamMembersList}
          serviceTemplates={serviceTemplates}
        />
      </Panel>
    </AppShell>
  );
}
