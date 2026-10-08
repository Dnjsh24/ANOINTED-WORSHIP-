"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { formatSongToText } from "@/lib/domain/chords";
import type { PreparationWorkspace, WorkspaceResult } from "@/lib/supabase/workflow-data";
import StageModeClient, { type StageSetlist } from "../stage/stage-mode-client";
import { PracticeToolsPanel } from "./practice-tools-panel";
import type { PracticeSetlist } from "./practice-mode.types";
import type { PreparationProposalAction } from "@/components/shared-preparation";

export default function PracticeModeClient({
  setlist,
  preparation,
  memberId = "",
  canManage = false,
  proposeAction,
}: {
  setlist: PracticeSetlist;
  preparation?: WorkspaceResult<PreparationWorkspace>;
  memberId?: string;
  canManage?: boolean;
  proposeAction?: PreparationProposalAction;
}) {
  const [practicedSongIds, setPracticedSongIds] = useState<Set<string>>(() => new Set());
  const [practiceTimeSignatures, setPracticeTimeSignatures] = useState<Record<string, string>>({});
  const practicedCount = setlist.songs.filter((song) => practicedSongIds.has(song.slotId)).length;

  function togglePracticed(slotId: string) {
    setPracticedSongIds((previous) => {
      const next = new Set(previous);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  if (setlist.songs.length === 0) {
    return (
      <Panel className="mx-auto max-w-2xl py-10 text-center">
        <h1 className="text-2xl font-bold">No songs in this setlist yet</h1>
        <p className="mt-2 text-sm text-zinc-400">Add songs to the setlist before starting practice.</p>
        <ButtonLink href={`/setlists/${setlist.id}/add-song`} className="mt-5">Add songs</ButtonLink>
      </Panel>
    );
  }

  const stageSetlist: StageSetlist = {
    id: setlist.id,
    date: setlist.date,
    type: "practice",
    songs: setlist.songs.map((slot, index) => ({
      id: slot.slotId,
      order: index + 1,
      assignedKey: slot.assignedKey,
      lead: slot.lead ?? "",
      youtubeUrl: slot.song.youtubeUrl ?? null,
      arrangement: slot.arrangement,
      song: {
        id: slot.song.id,
        title: slot.song.title,
        bpm: slot.song.bpm ?? 70,
        originalKey: slot.song.originalKey || "C",
        timeSignature: practiceTimeSignatures[slot.slotId] ?? slot.song.timeSignature ?? "4/4",
        lyricsChords: formatSongToText(slot.song),
      },
    })),
  };

  return (
    <StageModeClient
      setlist={stageSetlist}
      canManageSetlist={canManage}
      renderPracticeTools={(stageSong, close, selectSong) => {
        const practiceSong = setlist.songs.find((song) => song.slotId === stageSong.id);
        if (!practiceSong) return <p role="alert" className="text-sm text-red-200">This song is no longer available in the setlist.</p>;

        return (
          <PracticeToolsPanel
            key={practiceSong.slotId}
            setlist={setlist}
            stageSong={stageSong}
            preparation={preparation}
            memberId={memberId}
            canManage={canManage}
            proposeAction={proposeAction}
            isPracticed={practicedSongIds.has(practiceSong.slotId)}
            practicedCount={practicedCount}
            onTogglePracticed={togglePracticed}
            practiceTimeSignature={practiceTimeSignatures[practiceSong.slotId] ?? practiceSong.song.timeSignature ?? "4/4"}
            onPracticeTimeSignatureChange={(timeSignature) => setPracticeTimeSignatures((current) => ({ ...current, [practiceSong.slotId]: timeSignature }))}
            onSelectSong={selectSong}
            onClose={close}
          />
        );
      }}
    />
  );
}
