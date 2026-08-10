import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SetlistForm } from "@/components/setlist-form";
import { Panel } from "@/components/ui/card";
import { type SetlistFormSong } from "@/components/setlist-form";
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
  let allSongs: SetlistFormSong[] = [];

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
      
      // Fetch songs for the team
      const { data: dbSongs } = await supabase
        .from("songs")
        .select("id, title, original_key, bpm")
        .eq("team_id", teamContext.teamId)
        .order("title", { ascending: true });
      if (dbSongs) {
        allSongs = dbSongs;
      }
      
      // Fetch selected songs for this setlist
      const { data: selectedSongsData } = await supabase
        .from("setlist_songs")
        .select(`
          id,
          song_order,
          assigned_key,
          songs (
            id,
            title,
            original_key,
            bpm
          )
        `)
        .eq("setlist_id", id)
        .order("song_order", { ascending: true });
        
      if (selectedSongsData) {
        setlist.songs = selectedSongsData.map((row: any) => {
          const s = Array.isArray(row.songs) ? row.songs[0] : row.songs;
          return {
            id: row.id,
            order: row.song_order,
            assignedKey: row.assigned_key,
            song: {
              id: s?.id,
              title: s?.title,
              originalKey: s?.original_key,
              bpm: s?.bpm,
            } as any
          };
        });
      }
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
        <SetlistForm setlist={setlist} songs={allSongs.length > 0 ? allSongs : undefined} />
      </Panel>
    </AppShell>
  );
}
