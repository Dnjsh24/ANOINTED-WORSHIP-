import { notFound } from "next/navigation";
import { requestRehearsalPlanAction } from "@/app/workflow-proposals";
import { AppShell } from "@/components/app-shell";
import { ServicePreparation } from "@/components/service-preparation";
import { SharedPreparation } from "@/components/shared-preparation";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { canForTeam } from "@/lib/domain/permission-overrides";
import type { RehearsalSong } from "@/lib/domain/rehearsal-plan";
import { parseSongSlotNotes } from "@/lib/domain/song-slot-notes";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { loadPreparationWorkspace, type PreparationWorkspace, type WorkspaceResult } from "@/lib/supabase/workflow-data";

type RehearsalSetlistRow = Pick<Database["public"]["Tables"]["setlists"]["Row"], "id" | "name" | "event_id"> & {
  setlist_songs: Array<Pick<Database["public"]["Tables"]["setlist_songs"]["Row"],
    "id" | "song_order" | "assigned_key" | "notes" | "arrangement"> & {
    song: Pick<Database["public"]["Tables"]["songs"]["Row"], "title" | "original_key" | "bpm"> | null;
  }>;
};

export default async function TeamRehearsalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  let name: string;
  let songs: RehearsalSong[];
  let preparation: WorkspaceResult<PreparationWorkspace> | null = null;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("setlists")
      .select("id, name, event_id, setlist_songs(id, song_order, assigned_key, notes, arrangement, song:songs(title, original_key, bpm))")
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    if (error) throw new Error("The rehearsal setlist could not be loaded. Please retry.");
    if (!data) notFound();
    const setlist = data as unknown as RehearsalSetlistRow;
    name = setlist.name;
    songs = [...setlist.setlist_songs]
      .sort((left, right) => left.song_order - right.song_order)
      .flatMap(slot => slot.song ? [{
        id: slot.id,
        title: slot.song.title,
        assignedKey: slot.assigned_key || slot.song.original_key,
        bpm: slot.song.bpm,
        lead: parseSongSlotNotes(slot.notes).lead,
        arrangement: slot.arrangement,
      }] : []);
    preparation = await loadPreparationWorkspace(supabase, teamContext.teamId, setlist.id, setlist.event_id, songs.map(song => song.id));
  } else {
    const sample = sampleSetlists.find(setlist => setlist.id === id);
    if (!sample) notFound();
    name = sample.name;
    songs = [...sample.songs].sort((left, right) => left.order - right.order).map(slot => ({
      id: slot.id,
      title: slot.song.title,
      assignedKey: slot.assignedKey,
      bpm: slot.song.bpm,
      lead: slot.lead,
      arrangement: slot.arrangement,
    }));
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlist · {name}</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Team rehearsal plan</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/setlists/${id}/stage`} variant="secondary">Open Stage mode</ButtonLink>
          <ButtonLink href={`/setlists/${id}`} variant="secondary">Back to setlist</ButtonLink>
        </div>
      </div>
      <div className="mt-6 min-w-0">
        {preparation ? preparation.ok ? (
          <SharedPreparation
            key={id} setlistId={id} name={name} songs={songs}
            workspace={preparation.data} memberId={teamContext.memberId}
            canManage={canForTeam(teamContext, "setlists.manage")}
            proposeAction={requestRehearsalPlanAction.bind(null, id)}
          />
        ) : (
          <Panel><p role="status" className="text-sm text-amber-200">{preparation.message}</p></Panel>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Demo plan: saved notes stay on this device. Sign in with a connected team to share your plan.</p>
            <ServicePreparation setlistId={id} name={name} songs={songs} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
