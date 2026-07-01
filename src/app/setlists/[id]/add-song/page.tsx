import { addSetlistSongAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { SetlistSongPicker } from "@/components/setlist-song-picker";
import { Panel } from "@/components/ui/card";
import { initialActionState } from "@/lib/action-state";
import { setlists as sampleSetlists, songs as sampleSongs } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

export default async function AddSongToSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getCurrentTeamContext();

  let setlist: any = null;
  let songsList: any[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // 1. Fetch setlist details
    const { data: dbSetlist } = await supabase
      .from("setlists")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dbSetlist) {
      setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
      };
    }

    // 2. Fetch songs library
    const { data: dbSongs } = await supabase
      .from("songs")
      .select("*")
      .eq("team_id", teamContext.teamId)
      .eq("status", "approved")
      .order("title", { ascending: true });

    if (dbSongs) {
      songsList = dbSongs.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        originalKey: s.original_key,
        currentKey: s.original_key,
        bpm: s.bpm,
        timeSignature: s.time_signature,
        tags: s.tags || [],
        favorite: false,
        sections: [],
      }));
    }
  }

  // Fallback to sample data when Supabase is not configured or not found
  if (!setlist) {
    const sample = sampleSetlists.find((item) => item.id === id) ?? sampleSetlists[0];
    setlist = sample;
    songsList = sampleSongs;
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="mb-6">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlists</p>
        <h1 className="mt-2 text-4xl font-bold">Add Song to {setlist.name}</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">Choose a library song, key, tempo, and optional lead assignment.</p>
      </div>
      <Panel>
        <SetlistSongPicker
          action={addSetlistSongAction}
          initialState={initialActionState}
          setlistId={setlist.id}
          songs={songsList}
        />
      </Panel>
    </AppShell>
  );
}
