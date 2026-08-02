import { AppShell } from "@/components/app-shell";
import { SetlistForm, type SetlistFormSong } from "@/components/setlist-form";
import { Panel } from "@/components/ui/card";
import { SetlistTemplatePicker, type SetlistTemplateSummary } from "@/components/setlist-template-picker";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { EventType } from "@/lib/types";

export default async function NewSetlistPage({ searchParams }: { searchParams: Promise<{ eventId?: string; templateId?: string }> }) {
  const { eventId, templateId } = await searchParams;
  const teamContext = await getRequiredTeamContext();
  let setlistTemplates: SetlistTemplateSummary[] = [];
  let initialEventType: EventType | undefined;
  let songs: SetlistFormSong[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data } = await supabase
      .from("setlist_templates")
      .select("*")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: false });
    
    if (data) {
      setlistTemplates = data;
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

    // Fetch songs for the team
    const { data: dbSongs } = await supabase
      .from("songs")
      .select("id, title, original_key, bpm")
      .eq("team_id", teamContext.teamId)
      .order("title", { ascending: true });
    if (dbSongs) {
      songs = dbSongs;
    }
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
        <SetlistForm eventId={eventId} initialEventType={initialEventType} templateId={templateId} songs={songs} />
      </Panel>
    </AppShell>
  );
}
