"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updateSetlistSongNotesAction, updateSongSlotArrangementAction } from "@/app/actions";
import { SavedSongReadiness } from "@/components/saved-song-readiness";
import { ServicePreparation } from "@/components/service-preparation";
import { SharedPreparation, type PreparationProposalAction } from "@/components/shared-preparation";
import { Button } from "@/components/ui/button";
import type { PreparationWorkspace, WorkspaceResult } from "@/lib/supabase/workflow-data";
import type { PracticeSetlist, PracticeSetlistSong } from "./practice-mode.types";
import type { StageSetlistSong } from "../stage/stage-mode-client";

const SongForm = dynamic(
  () => import("@/components/song-form").then((module) => module.SongForm),
  { loading: () => <p role="status" className="text-sm text-zinc-400">Loading song editor…</p> },
);
export function PracticeToolsPanel({
  setlist,
  stageSong,
  preparation,
  memberId,
  canManage,
  proposeAction,
  isPracticed,
  practicedCount,
  onTogglePracticed,
  practiceTimeSignature,
  onPracticeTimeSignatureChange,
  onSelectSong,
  onClose,
}: {
  setlist: PracticeSetlist;
  stageSong: StageSetlistSong;
  preparation?: WorkspaceResult<PreparationWorkspace>;
  memberId: string;
  canManage: boolean;
  proposeAction?: PreparationProposalAction;
  isPracticed: boolean;
  practicedCount: number;
  onTogglePracticed: (slotId: string) => void;
  practiceTimeSignature: string;
  onPracticeTimeSignatureChange: (timeSignature: string) => void;
  onSelectSong: (slotId: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const slot = setlist.songs.find((song) => song.slotId === stageSong.id);
  if (!slot) return <p role="alert" className="text-sm text-red-200">This song is no longer in the setlist. Reload the page to continue.</p>;

  const practiceSongs = setlist.songs.map((item) => ({
    id: item.slotId,
    title: item.song.title,
    assignedKey: item.assignedKey ?? item.song.originalKey,
    bpm: item.song.bpm,
    lead: item.lead,
    arrangement: item.arrangement,
  }));

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-200">{setlist.name}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Practice progress</h3>
            <p className="mt-1 text-xs text-zinc-400">{practicedCount} of {setlist.songs.length} songs practiced this session.</p>
          </div>
          <Button type="button" variant={isPracticed ? "secondary" : "primary"} aria-pressed={isPracticed} onClick={() => onTogglePracticed(slot.slotId)}>
            {isPracticed ? "Practiced" : "Mark practiced"}
          </Button>
        </div>
        <progress aria-label="Setlist practice progress" className="mt-3 h-2 w-full accent-violet-400" max={Math.max(setlist.songs.length, 1)} value={practicedCount} />
        <label htmlFor="practice-song-picker" className="mt-4 block text-sm font-semibold text-zinc-200">Song</label>
        <select id="practice-song-picker" value={slot.slotId} onChange={(event) => onSelectSong(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30">
          {setlist.songs.map((song, index) => <option key={song.slotId} value={song.slotId}>{index + 1}. {song.song.title}</option>)}
        </select>
        <label htmlFor="practice-time-signature" className="mt-4 block text-sm font-semibold text-zinc-200">Practice time signature</label>
        <select id="practice-time-signature" value={practiceTimeSignature} onChange={(event) => onPracticeTimeSignatureChange(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30">
          {! ["4/4", "3/4", "6/8"].includes(practiceTimeSignature) && <option value={practiceTimeSignature}>{practiceTimeSignature}</option>}
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </section>

      {preparation?.ok ? (
        <SharedPreparation
          key={setlist.id}
          setlistId={setlist.id}
          name={setlist.name}
          workspace={preparation.data}
          memberId={memberId}
          canManage={canManage}
          proposeAction={proposeAction}
          songs={practiceSongs}
        />
      ) : (
        <section className="space-y-3">
          <ServicePreparation name={setlist.name} songs={practiceSongs} />
          {preparation && <p role="status" className="text-sm text-amber-200">{preparation.message}</p>}
        </section>
      )}

      {preparation?.ok && <SavedSongReadiness
        key={`readiness:${slot.slotId}`}
        slotId={slot.slotId}
        linkedEvent={Boolean(setlist.eventId)}
        assigned={preparation.data.assignedMemberIds.includes(memberId)}
        own={preparation.data.readiness.find((row) => row.slot_id === slot.slotId && row.team_member_id === memberId)}
        summary={preparation.data.readiness
          .filter((row) => row.slot_id === slot.slotId)
          .map((row) => ({ name: preparation.data.members.find((member) => member.id === row.team_member_id)?.name ?? "Unavailable member", state: row.state }))}
      />}

      <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <h3 className="font-semibold text-white">Setlist notes</h3>
          <p className="mt-1 text-xs text-zinc-400">Rehearsal details saved with this song in the setlist.</p>
        </div>
        {slot.lead && <PracticeNote label="Lead vocal" value={slot.lead} />}
        {slot.notes && <PracticeNote label="Setlist note" value={slot.notes} />}
        {canManage ? (
          <SetlistNotesEditor setlistId={setlist.id} slot={slot} onSaved={() => router.refresh()} />
        ) : slot.bandNotes ? (
          <PracticeNote label="Band notes" value={slot.bandNotes} />
        ) : (
          <p className="text-sm text-zinc-400">No band notes have been added.</p>
        )}

        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">Arrangement</h4>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{slot.arrangement || "No arrangement set."}</p>
            </div>
            {canManage && <ArrangementEditorControl setlistId={setlist.id} slot={slot} onSaved={() => router.refresh()} />}
          </div>
        </div>
      </section>

      {slot.songEditAllowed === false ? (
        <p className="rounded-xl border border-white/10 p-4 text-sm text-zinc-400">Song details are read-only for your current role.</p>
      ) : (
        <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <summary className="cursor-pointer font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
            Edit song, lyrics, and chords
          </summary>
          <p className="mb-4 mt-2 text-xs text-zinc-400">
            {slot.songIsProposal ? "Submit changes for an owner or admin to review." : "Changes update this song for your team."}
          </p>
          <SongForm
            key={`${slot.song.id}:${slot.songRevision ?? 0}`}
            song={slot.song}
            revision={slot.songRevision ?? 0}
            isProposal={slot.songIsProposal ?? false}
            canDelete={false}
            cancelHref={`/setlists/${setlist.id}/practice`}
            onSaved={() => router.refresh()}
          />
        </details>
      )}

      <Button type="button" variant="secondary" className="w-full" onClick={onClose}>Return to stage</Button>
    </div>
  );
}

function SetlistNotesEditor({ setlistId, slot, onSaved }: { setlistId: string; slot: PracticeSetlistSong; onSaved: () => void }) {
  const [lead, setLead] = useState(slot.lead ?? "");
  const [setlistNotes, setSetlistNotes] = useState(slot.notes ?? "");
  const [bandNotes, setBandNotes] = useState(slot.bandNotes ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("setlistId", setlistId);
    formData.set("slotId", slot.slotId);
    formData.set("lead", lead);
    formData.set("setlistNotes", setlistNotes);
    formData.set("bandNotes", bandNotes);
    setStatus("");
    setError("");
    startTransition(async () => {
      try {
        const result = await updateSetlistSongNotesAction(formData);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStatus(result.message);
        onSaved();
      } catch {
        setError("Band notes could not be saved. Your text is still here; retry when connected.");
      }
    });
  }

  return (
    <form onSubmit={saveNotes} className="space-y-2">
      <label htmlFor={`lead-${slot.slotId}`} className="block text-sm font-semibold text-zinc-200">Lead vocal</label>
      <input id={`lead-${slot.slotId}`} value={lead} onChange={(event) => setLead(event.target.value)} maxLength={160} placeholder="Assign a lead vocalist" className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30" />
      <label htmlFor={`setlist-notes-${slot.slotId}`} className="block pt-2 text-sm font-semibold text-zinc-200">Setlist notes</label>
      <textarea id={`setlist-notes-${slot.slotId}`} value={setlistNotes} onChange={(event) => setSetlistNotes(event.target.value)} maxLength={1600} rows={3} placeholder="Add rehearsal notes for this song" className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30" />
      <label htmlFor={`band-notes-${slot.slotId}`} className="block pt-2 text-sm font-semibold text-zinc-200">Band notes</label>
      <textarea id={`band-notes-${slot.slotId}`} value={bandNotes} onChange={(event) => setBandNotes(event.target.value)} maxLength={4000} rows={3} placeholder="Add instructions for the band" className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30" />
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {status && <p role="status" className="text-sm text-emerald-300">{status}</p>}
      <Button type="submit" variant="secondary" disabled={isPending}>{isPending ? "Saving…" : "Save song notes"}</Button>
    </form>
  );
}

function ArrangementEditorControl({ setlistId, slot, onSaved }: { setlistId: string; slot: PracticeSetlistSong; onSaved: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [arrangement, setArrangement] = useState(slot.arrangement ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveArrangement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("setlistId", setlistId);
    formData.set("slotId", slot.slotId);
    formData.set("arrangement", arrangement);
    setStatus("");
    setError("");
    startTransition(async () => {
      try {
        const result = await updateSongSlotArrangementAction(formData);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStatus(result.message);
        setIsEditing(false);
        onSaved();
      } catch {
        setError("Arrangement could not be saved. Your text is still here; retry when connected.");
      }
    });
  }

  return (
    <div className="min-w-0 flex-1">
      {!isEditing ? (
        <Button type="button" variant="secondary" onClick={() => { setArrangement(slot.arrangement ?? ""); setIsEditing(true); }}>Edit arrangement</Button>
      ) : (
        <form onSubmit={saveArrangement} className="space-y-2">
          <label htmlFor={`arrangement-${slot.slotId}`} className="block text-sm font-semibold text-zinc-200">Song section order</label>
          <textarea id={`arrangement-${slot.slotId}`} value={arrangement} onChange={(event) => setArrangement(event.target.value)} maxLength={1000} rows={3} placeholder="Intro, Verse 1, Chorus, Bridge, Chorus" className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30" />
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save arrangement"}</Button>
            <Button type="button" variant="secondary" disabled={isPending} onClick={() => { setArrangement(slot.arrangement ?? ""); setIsEditing(false); }}>Cancel</Button>
          </div>
        </form>
      )}
      {status && <p role="status" className="mt-2 text-xs text-emerald-300">{status}</p>}
    </div>
  );
}

function PracticeNote({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-violet-200">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{value}</p>
    </div>
  );
}
