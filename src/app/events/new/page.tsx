import { AppShell } from "@/components/app-shell";
import { EventForm } from "@/components/event-form";
import { Panel } from "@/components/ui/card";
import { fallbackServiceTemplates, mapServiceTemplate } from "@/lib/domain/service-templates";
import { members as sampleMembers } from "@/lib/sample-data";
import type { ServiceTemplate, TeamMember, TeamRole } from "@/lib/types";
import { can } from "@/lib/domain/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const teamContext = await getRequiredTeamContext();
  const canCreateOfficialEvents = can(teamContext.role, "events.manage");
  const canLinkSetlists = canCreateOfficialEvents && can(teamContext.role, "setlists.manage");
  let teamMembersList: TeamMember[] = [];
  let serviceTemplates: ServiceTemplate[] = fallbackServiceTemplates;
  let setlistsList: Array<{ id: string; name: string; date: string }> = [];

  if (canLinkSetlists && hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split("T")[0];


    // Fetch team members
    const { data: dbMembers } = await supabase
      .from("team_members")
      .select("id, profile_id, role, status, ministry")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true });

    // Collect profile IDs
    const memberProfileIds = (dbMembers ?? []).map((tm) => tm.profile_id);

    // Fetch profiles
    let memberProfilesMap: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
    if (memberProfileIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberProfileIds);

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
      };
    });

    
    const { data: templateRows } = await supabase
      .from("service_templates")
      .select("id, name, service_type, location, call_time, rehearsal_time, reminder_frequency, reminder_occurrences, default_roles")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true });

    if (templateRows && templateRows.length > 0) {
      serviceTemplates = templateRows.map((row) => mapServiceTemplate(row as any));
    }


    // Fetch recent setlists
    const { data: dbSetlists } = (await supabase
      .from("setlists")
      .select("id, name, setlist_date")
      .eq("team_id", teamContext.teamId)
      .gte("setlist_date", todayStr)
      .order("setlist_date", { ascending: true })) as any;

    if (dbSetlists) {
      setlistsList = dbSetlists.map((s: any) => ({
        id: s.id,
        name: s.name,
        date: s.setlist_date,
      }));
    }
  
  } else if (!hasSupabaseEnv()) {
    teamMembersList = sampleMembers as any[];
    // Demo mode fallback

    // Demo mode fallback
    setlistsList = sampleSetlists.map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date,
    }));
  }

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      <div className="mb-6 animate-fade-up">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Events & Rehearsal</p>
        <h1 className="mt-2 text-4xl font-bold">{canCreateOfficialEvents ? "Add Event" : "Request Event"}</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">
          {canCreateOfficialEvents
            ? "Create service, rehearsal, meeting, or special event details."
            : "Submit event details for admin or owner approval."}
        </p>
      </div>
      <Panel className="animate-scale-in">
        <EventForm
          setlists={setlistsList}
          defaultDate={date}
          requiresApproval={!canCreateOfficialEvents}
          canLinkSetlists={canLinkSetlists}
          teamMembers={teamMembersList}
          serviceTemplates={serviceTemplates}
        />
      </Panel>
    </AppShell>
  );
}
