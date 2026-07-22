"use client";

import { useTransition, useState, useEffect } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
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

function SortableSongItem({ item, setlistId, canManageSetlist }: { item: any; setlistId: string; canManageSetlist: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="block w-full">
      <Card className={`grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4 transition-all duration-200 ${isDragging ? "shadow-2xl border-violet-500 bg-[#18171c]/90" : "hover:border-violet-400/30"}`}>
        <div className="flex items-center gap-3">
          {canManageSetlist ? (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab hover:text-violet-300 text-zinc-500 transition-colors"
            >
              <GripVertical className="size-5" />
            </button>
          ) : (
            <span className="font-mono text-sm font-bold text-zinc-300">{item.order}</span>
          )}
          {canManageSetlist && (
             <span className="font-mono text-sm font-bold text-zinc-300 w-4 text-center">{item.order}</span>
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
        <div className="flex items-center gap-3">
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
              <EditArrangementButton
                setlistId={setlistId}
                slotId={item.id}
                songTitle={item.song.title}
                currentArrangement={item.arrangement}
                lyrics={item.song.lyrics}
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
  initialSongs: any[]; 
  canManageSetlist: boolean 
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [isPending, startTransition] = useTransition();

  // Sync with prop changes (e.g. after server mutation)
  useEffect(() => {
    setSongs(initialSongs);
  }, [initialSongs]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSongs((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      // Re-assign order based on new position
      const reorderedItems = newItems.map((item, index) => ({
        ...item,
        order: index + 1,
      }));

      // Fire server action in background
      startTransition(async () => {
        const formData = new FormData();
        formData.set("setlistId", setlistId);
        
        const updates = reorderedItems.map(item => ({
          id: item.id,
          song_order: item.order
        }));
        
        formData.set("updates", JSON.stringify(updates));
        await bulkReorderSetlistSongsAction(formData);
      });

      return reorderedItems;
    });
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
      <div className="space-y-3">
        {songs.map((item) => (
          <SortableSongItem key={item.id} item={item} setlistId={setlistId} canManageSetlist={false} />
        ))}
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={songs.map(s => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={`space-y-3 ${isPending ? 'opacity-80' : ''}`}>
          {songs.map((item) => (
            <SortableSongItem key={item.id} item={item} setlistId={setlistId} canManageSetlist={canManageSetlist} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
