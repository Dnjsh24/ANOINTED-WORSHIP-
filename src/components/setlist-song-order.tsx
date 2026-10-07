"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangeKeyButton } from "@/components/change-key-button";
import { EditArrangementButton } from "@/components/edit-arrangement-button";
import { EditBandNotesButton } from "@/components/edit-band-notes-button";
import { DeleteSongButton } from "@/components/delete-song-button";
import { bulkReorderSetlistSongsAction } from "@/app/actions";

export type OrderedSetlistSong = {
  id: string;
  order: number;
  assignedKey: string;
  lead?: string;
  arrangement?: string | null;
  bandNotes?: string | null;
  song: {
    id: string;
    title: string;
    originalKey: string;
    bpm: number | null;
    lyrics?: string;
  };
};

function SortableSongItem({
  item,
  setlistId,
  canManageSetlist,
  canMoveUp = false,
  canMoveDown = false,
  isReorderPending = false,
  onMove,
}: {
  item: OrderedSetlistSong;
  setlistId: string;
  canManageSetlist: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isReorderPending?: boolean;
  onMove?: (direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: isReorderPending,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} role="listitem" style={style} data-slot-id={item.id} data-song-order={item.order} className="block w-full">
      <Card className={`grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-4 transition-all duration-200 ${isDragging ? "shadow-2xl border-violet-500 bg-[#18171c]/90" : "hover:border-violet-400/30"}`}>
        <div className="flex items-center gap-3">
          {canManageSetlist ? (
            <button
              {...attributes}
              {...listeners}
              type="button"
              aria-label={`Reorder ${item.song.title}`}
              disabled={isReorderPending}
              className="flex size-11 touch-none cursor-grab items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-violet-300 disabled:cursor-wait disabled:opacity-50"
            >
              <GripVertical className="size-5" />
            </button>
          ) : (
            <span className="font-mono text-sm font-bold text-zinc-300">{item.order}</span>
          )}
          {canManageSetlist && (
            <span className="w-4 text-center font-mono text-sm font-bold text-zinc-300">{item.order}</span>
          )}
        </div>
        
        <Link
          href={`/songs/${item.song.id}?setlistId=${setlistId}&slotId=${item.id}&assignedKey=${encodeURIComponent(item.assignedKey)}`}
          className="flex-1 min-w-0 text-left group"
        >
          <p className="font-bold text-white group-hover:text-violet-300 transition-colors">
            {item.song.title}
          </p>
          {item.lead && (
            <p className="mt-1 text-xs font-semibold text-zinc-400">
              Lead Vocal ({item.lead})
            </p>
          )}
          {item.arrangement && (
            <p className="mt-1 text-xs font-semibold text-violet-300">
              Arrangement: {item.arrangement}
            </p>
          )}
          {item.bandNotes && (
            <p className="mt-1 text-xs font-semibold text-emerald-400">
              Notes: {item.bandNotes}
            </p>
          )}
        </Link>
        <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {canManageSetlist ? (
              <ChangeKeyButton
                setlistId={setlistId}
                slotId={item.id}
                currentKey={item.assignedKey}
                originalKey={item.song.originalKey}
              />
            ) : (
              <Badge>Key: {item.assignedKey}</Badge>
            )}
            <Badge>{item.song.bpm} BPM</Badge>
          </div>
          {canManageSetlist && (
            <>
              <div role="group" aria-label={`Move ${item.song.title}`} className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move ${item.song.title} up`}
                  title={`Move ${item.song.title} up`}
                  disabled={isReorderPending || !canMoveUp}
                  onClick={() => onMove?.(-1)}
                  className="flex size-11 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${item.song.title} down`}
                  title={`Move ${item.song.title} down`}
                  disabled={isReorderPending || !canMoveDown}
                  onClick={() => onMove?.(1)}
                  className="flex size-11 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <EditArrangementButton
                setlistId={setlistId}
                slotId={item.id}
                songTitle={item.song.title}
                currentArrangement={item.arrangement}
                lyrics={item.song.lyrics ?? ""}
              />
              <EditBandNotesButton
                setlistId={setlistId}
                slotId={item.id}
                currentNotes={item.bandNotes}
              />

              <DeleteSongButton
                setlistId={setlistId}
                slotId={item.id}
                songTitle={item.song.title}
              />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export function SetlistSongOrder({ 
  setlistId, 
  initialSongs, 
  canManageSetlist 
}: { 
  setlistId: string; 
  initialSongs: OrderedSetlistSong[];
  canManageSetlist: boolean 
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [previousInitialSongs, setPreviousInitialSongs] = useState(initialSongs);
  const [isReorderPending, setIsReorderPending] = useState(false);
  const [reorderError, setReorderError] = useState("");
  const latestInitialSongsRef = useRef(initialSongs);
  const reorderInFlightRef = useRef(false);

  useEffect(() => {
    latestInitialSongsRef.current = initialSongs;
  }, [initialSongs]);

  if (initialSongs !== previousInitialSongs) {
    setPreviousInitialSongs(initialSongs);
    setSongs(initialSongs);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const saveSongOrder = async (reorderedSongs: OrderedSetlistSong[]) => {
    if (reorderInFlightRef.current) return;

    setSongs(reorderedSongs);
    setReorderError("");
    reorderInFlightRef.current = true;
    setIsReorderPending(true);

    try {
      const formData = new FormData();
      formData.set("setlistId", setlistId);
      formData.set("updates", JSON.stringify(reorderedSongs.map((item) => ({
        id: item.id,
        song_order: item.order,
      }))));

      const result = await bulkReorderSetlistSongsAction(formData);
      if (!result.ok) {
        setSongs(latestInitialSongsRef.current);
        setReorderError(result.message);
      }
    } catch {
      setSongs(latestInitialSongsRef.current);
      setReorderError("Songs could not be reordered. Try again.");
    } finally {
      reorderInFlightRef.current = false;
      setIsReorderPending(false);
    }
  };

  const reorderSong = (songIndex: number, direction: -1 | 1) => {
    if (isReorderPending) return;
    const destinationIndex = songIndex + direction;
    if (destinationIndex < 0 || destinationIndex >= songs.length) return;

    const reorderedSongs = arrayMove(songs, songIndex, destinationIndex).map((item, index) => ({
      ...item,
      order: index + 1,
    }));
    saveSongOrder(reorderedSongs);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (isReorderPending) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = songs.findIndex((item) => item.id === active.id);
    const newIndex = songs.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedSongs = arrayMove(songs, oldIndex, newIndex).map((item, index) => ({
      ...item,
      order: index + 1,
    }));
    saveSongOrder(reorderedSongs);
  };

  if (songs.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-[#18171c] p-6 text-center text-sm font-semibold text-zinc-400">
        No songs in this setlist yet. Use Add Song to populate it.
      </p>
    );
  }

  if (!canManageSetlist) {
    // Render static list for non-managers
    return (
      <div role="list" aria-label="Setlist songs" className="space-y-3">
        {songs.map((item) => (
          <SortableSongItem key={item.id} item={item} setlistId={setlistId} canManageSetlist={false} />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      id={`setlist-song-order-${setlistId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={songs.map(s => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div>
          {reorderError && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{reorderError}</p>}
          {isReorderPending && <p role="status" aria-live="polite" className="text-sm font-semibold text-zinc-400">Saving song order…</p>}
          <div role="list" aria-label="Setlist songs" aria-busy={isReorderPending} className={`space-y-3 ${isReorderPending ? "opacity-80" : ""}`}>
            {songs.map((item, index) => (
              <SortableSongItem
                key={item.id}
                item={item}
                setlistId={setlistId}
                canManageSetlist={canManageSetlist}
                canMoveUp={index > 0}
                canMoveDown={index < songs.length - 1}
                isReorderPending={isReorderPending}
                onMove={(direction) => reorderSong(index, direction)}
              />
            ))}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}
