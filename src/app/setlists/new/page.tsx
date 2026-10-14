import { AppShell } from "@/components/app-shell";
import { SetlistForm, type SetlistFormEvent, type SetlistFormSong } from "@/components/setlist-form";
import { Panel } from "@/components/ui/card";
import { SetlistTemplatePicker, type SetlistTemplateSummary } from "@/components/setlist-template-picker";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { events as sampleEvents, setlists as sampleSetlists, songs as sampleSongs } from "@/lib/sample-data";

export default async function NewSetlistPage({ searchParams }: { searchParams: Promise<{ eventId?: string; templateId?: string }> }) {
  const { eventId, templateId } = await searchParams;
  const teamContext = await getRequiredTeamContext();
  let setlistTemplates: SetlistTemplateSummary[] = [];
  let events: SetlistFormEvent[] = hasSupabaseEnv() ? [] : sampleEvents
    .filter(event => !sampleSetlists.some(setlist => setlist.eventId === event.id))
    .map(event => ({ id: event.id, name: event.name, type: event.type, event_date: event.date }));
  let eventsUnavailable = false;
  let songs: SetlistFormSong[] = hasSupabaseEnv() ? [] : sampleSongs.map(song => ({ id: song.id, title: song.title, original_key: song.originalKey, bpm: song.bpm ?? null }));

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

    const { data: availableEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, name, type, event_date, setlists ( id )")
      .eq("team_id", teamContext.teamId)
      .eq("approval_status", "approved")
      .is("deleted_at", null)
      .is("setlists.deleted_at", null)
      .order("event_date", { ascending: true })
      .order("starts_at", { ascending: true });
    eventsUnavailable = Boolean(eventsError);
    events = eventsError ? [] : (availableEvents ?? [])
      .filter(event => event.setlists.length === 0)
      .map(({ id, name, type, event_date }) => ({ id, name, type, event_date }));

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

  const selectedEvent = events.find(event => event.id === eventId);

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlists</p>
          <h1 className="mt-2 text-4xl font-bold">New Setlist</h1>
          <p className="mt-2 text-sm font-semibold text-zinc-300">Arrange songs and keep this setlist standalone or link it to a Timeline event.</p>
        </div>
        
        {/* We pass the templates here but currently SetlistForm creates the Setlist first.
            We will allow selecting a template, which passes a hidden field to SetlistForm. */}
        <SetlistTemplatePicker templates={setlistTemplates || []} />
      </div>
      <Panel>
        <SetlistForm eventId={selectedEvent?.id} initialEventType={selectedEvent?.type} events={events} eventsUnavailable={eventsUnavailable} templateId={templateId} songs={songs} />
      </Panel>
    </AppShell>
  );
}
