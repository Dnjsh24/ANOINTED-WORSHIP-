import { AppShell } from "@/components/app-shell";
import { EventForm } from "@/components/event-form";
import { Panel } from "@/components/ui/card";
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
  let setlistsList: Array<{ id: string; name: string; date: string }> = [];

  if (canLinkSetlists && hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split("T")[0];

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
  } else if (canLinkSetlists && !hasSupabaseEnv()) {
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
        />
      </Panel>
    </AppShell>
  );
}
