import { AppShell } from "@/components/app-shell";
import { SetlistForm } from "@/components/setlist-form";
import { Panel } from "@/components/ui/card";
import { SetlistTemplatePicker } from "@/components/setlist-template-picker";
import { fallbackServiceTemplates, mapServiceTemplate } from "@/lib/domain/service-templates";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { members as sampleMembers } from "@/lib/sample-data";
import type { EventType } from "@/lib/types";
import type { ServiceTemplate, TeamMember, TeamRole } from "@/lib/types";

export default async function NewSetlistPage({ searchParams }: { searchParams: Promise<{ eventId?: string; templateId?: string }> }) {
  const { eventId, templateId } = await searchParams;
  const teamContext = await getRequiredTeamContext();
  let teamMembersList: TeamMember[] = [];
  let serviceTemplates: ServiceTemplate[] = fallbackServiceTemplates;
  let initialEventType: EventType | undefined;

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch team members
    const { data: dbMembers } = await supabase
      .from("team_members")
      .select("id, profile_id, role, status, ministry, ministries")
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

    teamMembersList = (dbMembers ?? []).map((t: any) => {
      const tm = t as any;
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

    const { data: setlistTemplates } = await supabase
      .from("setlist_templates")
      .select("*")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: false });

    const { data: templateRows } = await supabase
      .from("service_templates")
      .select("id, name, service_type, location, call_time, rehearsal_time, reminder_frequency, reminder_occurrences, default_roles")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true });

    if (templateRows && templateRows.length > 0) {
      serviceTemplates = templateRows.map((row) => mapServiceTemplate(row as any));
    }

    if (eventId) {
      const { data: linkedEvent } = await supabase
        .from("events")
        .select("type")
        .eq("id", eventId)
        .eq("team_id", teamContext.teamId)
        .maybeSingle();

      initialEventType = linkedEvent?.type as EventType | undefined;
    }
  } else if (!hasSupabaseEnv()) {
    // Demo fallback
    teamMembersList = sampleMembers as any[];
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlists</p>
          <h1 className="mt-2 text-4xl font-bold">New Setlist</h1>
          <p className="mt-2 text-sm font-semibold text-zinc-300">Create event details, scheduling, team assignments, and song order.</p>
        </div>
        
        {/* We pass the templates here but currently SetlistForm creates the Setlist first.
            We will allow selecting a template, which passes a hidden field to SetlistForm. */}
        <SetlistTemplatePicker templates={setlistTemplates || []} />
      </div>
      <Panel>
        <SetlistForm eventId={eventId} initialEventType={initialEventType} templateId={templateId} />
      </Panel>
    </AppShell>
  );
}
