import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SetlistForm } from "@/components/setlist-form";
import { Panel } from "@/components/ui/card";
import { SaveAsTemplateButton } from "@/components/save-as-template-button";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { EventType, Setlist } from "@/lib/types";

type EditableSetlistRow = {
  id: string;
  name: string;
  setlist_date: string;
  location: string;
  call_time: string;
  rehearsal_time: string;
  service_times: string[] | null;
  events: { type: EventType } | Array<{ type: EventType }> | null;
};

export default async function EditSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  let setlist: Setlist | null = null;

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch setlist details
    const { data } = await supabase
      .from("setlists")
      .select(`
        *,
        events (
          type
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    const dbSetlist = data as unknown as EditableSetlistRow | null;

    if (dbSetlist) {
      const linkedEvent = Array.isArray(dbSetlist.events)
        ? dbSetlist.events[0]
        : dbSetlist.events;
      setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
        date: dbSetlist.setlist_date,
        location: dbSetlist.location,
        callTime: dbSetlist.call_time,
        rehearsalTime: dbSetlist.rehearsal_time,
        serviceTimes: dbSetlist.service_times || ["Sunday Worship"],
        eventType: linkedEvent?.type,
        leader: "",
        songs: [],
      };
    }
  }

  // Fallback to sample data only when Supabase is not configured (demo mode).
  if (!setlist) {
    if (hasSupabaseEnv()) {
      notFound();
    }

    const sample = sampleSetlists.find((item) => item.id === id) ?? sampleSetlists[0];
    setlist = sample;
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlists</p>
          <h1 className="mt-2 text-4xl font-bold">Edit Setlist</h1>
          <p className="mt-2 text-sm font-semibold text-zinc-300">{setlist.name}</p>
        </div>
        
        <SaveAsTemplateButton setlistId={setlist.id} />
      </div>
      <Panel>
        <SetlistForm setlist={setlist} />
      </Panel>
    </AppShell>
  );
}
