import { AppShell } from "@/components/app-shell";
import { EventForm } from "@/components/event-form";
import { Panel } from "@/components/ui/card";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import { setlists as sampleSetlists } from "@/lib/sample-data";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const teamContext = await getCurrentTeamContext();
  let setlistsList: Array<{ id: string; name: string; date: string }> = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
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
  } else {
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
        <h1 className="mt-2 text-4xl font-bold">Add Event</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">Create service, rehearsal, meeting, or special event details.</p>
      </div>
      <Panel className="animate-scale-in">
        <EventForm setlists={setlistsList} defaultDate={date} />
      </Panel>
    </AppShell>
  );
}
