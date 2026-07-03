import { AppShell } from "@/components/app-shell";
import { SongForm } from "@/components/song-form";
import { Panel } from "@/components/ui/card";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function NewSongPage() {
  const teamContext = await getRequiredTeamContext();

  return (
    <AppShell active="Song Library" teamContext={teamContext}>
      <div className="mb-6">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Song Library</p>
        <h1 className="mt-2 text-4xl font-bold">Add New Song</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">Save title, artist/source, default key, tempo, and chart notes.</p>
      </div>
      <Panel>
        <SongForm />
      </Panel>
    </AppShell>
  );
}
