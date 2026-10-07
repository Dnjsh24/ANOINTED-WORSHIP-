"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { SongViewer } from "@/components/song-viewer";
import { ServicePreparation } from "@/components/service-preparation";
import type { PracticeSetlist } from "./practice-mode.types";
import { SharedPreparation, type PreparationProposalAction } from "@/components/shared-preparation";
import { SavedSongReadiness } from "@/components/saved-song-readiness";
import type { PreparationWorkspace, WorkspaceResult } from "@/lib/supabase/workflow-data";

export default function PracticeModeClient({ setlist, preparation, memberId = "", canManage = false, proposeAction }: { setlist: PracticeSetlist; preparation?: WorkspaceResult<PreparationWorkspace>; memberId?: string; canManage?: boolean; proposeAction?: PreparationProposalAction }) {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [practicedSongIds, setPracticedSongIds] = useState<Set<string>>(() => new Set());
  const currentSetlistSong = setlist.songs[currentSongIndex];
  const practicedCount = setlist.songs.filter((song) => practicedSongIds.has(song.slotId)).length;

  function selectSong(slotId: string) {
    const nextSongIndex = setlist.songs.findIndex((song) => song.slotId === slotId);
    if (nextSongIndex >= 0) setCurrentSongIndex(nextSongIndex);
  }

  function togglePracticed(slotId: string) {
    setPracticedSongIds((previous) => {
      const next = new Set(previous);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlist Practice</p>
          <h1 className="mt-2 text-3xl font-bold">{setlist.name}</h1>
          <p className="mt-2 text-sm text-zinc-400">Practice each song in order with its setlist key and rehearsal notes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/setlists/${setlist.id}`} variant="secondary">
            Back to setlist
          </ButtonLink>
          <ButtonLink href={`/setlists/${setlist.id}/stage`}>
            Stage Mode
          </ButtonLink>
        </div>
      </header>

      {preparation?.ok ? <SharedPreparation key={setlist.id} setlistId={setlist.id} name={setlist.name} workspace={preparation.data} memberId={memberId} canManage={canManage} proposeAction={proposeAction} songs={setlist.songs.map(slot => ({
        id: slot.slotId, title: slot.song.title, assignedKey: slot.assignedKey ?? slot.song.originalKey,
        bpm: slot.song.bpm, lead: slot.lead, arrangement: slot.arrangement,
      }))} /> : <><ServicePreparation key={setlist.id} name={setlist.name} songs={setlist.songs.map(slot => ({
        id: slot.slotId, title: slot.song.title, assignedKey: slot.assignedKey ?? slot.song.originalKey,
        bpm: slot.song.bpm, lead: slot.lead, arrangement: slot.arrangement,
      }))} />{preparation && <p role="status" className="text-sm text-amber-200">{preparation.message}</p>}</>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="order-last min-w-0 space-y-5 lg:order-first" aria-label="Current song practice">
          {currentSetlistSong ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p aria-live="polite" className="text-sm font-semibold text-zinc-400">
                  Song {currentSongIndex + 1} of {setlist.songs.length}
                  {currentSetlistSong.assignedKey && <span> · Setlist key {currentSetlistSong.assignedKey}</span>}
                </p>
                <Button
                  type="button"
                  variant={practicedSongIds.has(currentSetlistSong.slotId) ? "secondary" : "primary"}
                  aria-pressed={practicedSongIds.has(currentSetlistSong.slotId)}
                  onClick={() => togglePracticed(currentSetlistSong.slotId)}
                >
                  <Check aria-hidden="true" data-icon="inline-start" />
                  {practicedSongIds.has(currentSetlistSong.slotId) ? "Practiced" : "Mark as practiced"}
                </Button>
              </div>

              {(currentSetlistSong.lead || currentSetlistSong.arrangement || currentSetlistSong.notes || currentSetlistSong.bandNotes) && (
                <Panel aria-label="Rehearsal notes" className="grid gap-3 sm:grid-cols-2">
                  {currentSetlistSong.lead && <PracticeNote label="Lead vocal" value={currentSetlistSong.lead} />}
                  {currentSetlistSong.arrangement && <PracticeNote label="Arrangement" value={currentSetlistSong.arrangement} />}
                  {currentSetlistSong.notes && <PracticeNote label="Setlist note" value={currentSetlistSong.notes} />}
                  {currentSetlistSong.bandNotes && <PracticeNote label="Band notes" value={currentSetlistSong.bandNotes} />}
                </Panel>
              )}

              <SongViewer
                key={currentSetlistSong.slotId}
                song={currentSetlistSong.song}
                assignedKey={currentSetlistSong.assignedKey ?? undefined}
              />
              {preparation?.ok && <SavedSongReadiness key={`readiness:${currentSetlistSong.slotId}`} slotId={currentSetlistSong.slotId}
                linkedEvent={Boolean(setlist.eventId)} assigned={preparation.data.assignedMemberIds.includes(memberId)}
                own={preparation.data.readiness.find(row => row.slot_id === currentSetlistSong.slotId && row.team_member_id === memberId)}
                summary={preparation.data.readiness.filter(row => row.slot_id === currentSetlistSong.slotId).map(row => ({ name: preparation.data.members.find(member => member.id === row.team_member_id)?.name ?? "Unavailable member", state: row.state }))}
              />}
            </>
          ) : (
            <Panel className="py-10 text-center">
              <h2 className="text-xl font-bold">No songs in this setlist yet</h2>
              <p className="mt-2 text-sm text-zinc-400">Add songs to the setlist before starting practice.</p>
              <ButtonLink href={`/setlists/${setlist.id}/add-song`} className="mt-5">
                Add songs
              </ButtonLink>
            </Panel>
          )}
        </section>

        <aside className="order-first lg:order-last" aria-label="Setlist practice progress">
          <Panel className="space-y-5">
            <div>
              <h2 className="text-lg font-bold">Song order</h2>
              <p className="mt-1 text-sm text-zinc-400">Choose a song or move through the setlist.</p>
            </div>

            <label htmlFor="practice-song-picker" className="block text-sm font-semibold text-zinc-200">
              Song
            </label>
            <select
              id="practice-song-picker"
              value={currentSetlistSong?.slotId ?? ""}
              disabled={setlist.songs.length === 0}
              onChange={(event) => selectSong(event.target.value)}
              className="h-11 w-full rounded-md border border-white/10 bg-[#111014] px-3 text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/40 disabled:opacity-50"
            >
              {setlist.songs.length === 0 ? (
                <option value="">No songs</option>
              ) : (
                setlist.songs.map((song, index) => (
                  <option key={song.slotId} value={song.slotId}>
                    {index + 1}. {song.song.title}
                  </option>
                ))
              )}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                aria-label="Previous song"
                disabled={currentSongIndex <= 0 || setlist.songs.length === 0}
                onClick={() => setCurrentSongIndex((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft aria-hidden="true" data-icon="inline-start" />
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-label="Next song"
                disabled={currentSongIndex >= setlist.songs.length - 1 || setlist.songs.length === 0}
                onClick={() => setCurrentSongIndex((index) => Math.min(setlist.songs.length - 1, index + 1))}
              >
                Next
                <ChevronRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-white">Practice progress</h3>
                <span className="text-sm text-zinc-300">{practicedCount} of {setlist.songs.length}</span>
              </div>
              <progress
                aria-label="Setlist practice progress"
                className="mt-3 h-2 w-full accent-violet-400"
                max={Math.max(setlist.songs.length, 1)}
                value={practicedCount}
              />
              <p className="mt-2 text-xs text-zinc-500">Progress lasts for this practice session.</p>
            </div>
          </Panel>
        </aside>
      </div>
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
