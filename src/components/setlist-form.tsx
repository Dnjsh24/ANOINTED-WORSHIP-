"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { createSetlistAction, updateSetlistAction, deleteSetlistAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import {
  DEFAULT_SERVICE_TYPE,
  getPrimaryServiceType,
  resolveSetlistEventType,
} from "@/lib/domain/event-types";
import type { EventType, Setlist } from "@/lib/types";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

export type SetlistFormSong = {
  id: string;
  title: string;
  original_key: string;
  bpm: number | null;
};

function isSetlistFormSong(value: unknown): value is SetlistFormSong {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "title" in value &&
      typeof value.title === "string" &&
      "original_key" in value &&
      typeof value.original_key === "string",
  );
}

export const snapDragPreviewToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!activatorEvent || !draggingNodeRect) return transform;

  const activatorCoordinates = getEventCoordinates(activatorEvent);
  if (!activatorCoordinates) return transform;

  const pointerOffsetX = activatorCoordinates.x - draggingNodeRect.left;
  const pointerOffsetY = activatorCoordinates.y - draggingNodeRect.top;

  return {
    ...transform,
    x: transform.x + pointerOffsetX - draggingNodeRect.width / 2,
    y: transform.y + pointerOffsetY - draggingNodeRect.height / 2,
  };
};

function SetlistDragOverlay({ activeSong }: { activeSong: SetlistFormSong | null }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <DragOverlay dropAnimation={null} modifiers={[snapDragPreviewToCursor]}>
      {activeSong ? (
        <div className="m-0 w-full cursor-grabbing rounded-xl border border-violet-500/50 bg-[#1f1e24] p-3 shadow-2xl shadow-black/50">
          <div className="truncate text-sm font-bold text-white">{activeSong.title}</div>
          <div className="mt-1 text-xs text-zinc-400">{activeSong.original_key} &bull; {activeSong.bpm} BPM</div>
        </div>
      ) : null}
    </DragOverlay>,
    document.body,
  );
}

function DraggableSong({ song }: { song: SetlistFormSong }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${song.id}`,
    data: song,
  });
  const style = { opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="p-3 border border-white/10 rounded-xl bg-[#17161b] hover:bg-[#1f1e24] hover:border-violet-500/50 cursor-grab active:cursor-grabbing mb-2 transition-colors">
      <div className="text-sm font-bold text-white">{song.title}</div>
      <div className="text-xs text-zinc-400 mt-1">{song.original_key} • {song.bpm} BPM</div>
    </div>
  );
}

function SortableSelectedSong({
  isActiveReorder,
  index,
  onRemove,
  song,
}: {
  isActiveReorder: boolean;
  index: number;
  onRemove: (id: string) => void;
  song: SetlistFormSong;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: `selected-${song.id}`,
    data: song,
    transition: {
      duration: 220,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  });
  const isVisuallyMoving = isDragging || isActiveReorder;
  const rowTransition = [
    transition ?? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
    "box-shadow 180ms ease",
    "border-color 180ms ease",
    "background-color 180ms ease",
  ].join(", ");

  return (
    <li
      ref={setNodeRef}
      aria-label={`${index + 1}. ${song.title}`}
      data-reordering={isVisuallyMoving ? "true" : undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: rowTransition,
        willChange: isVisuallyMoving ? "transform" : undefined,
      }}
      className={`mb-2 flex items-center justify-between rounded-lg border bg-[#17161b] p-3 last:mb-0 ${
        isVisuallyMoving
          ? "relative z-10 border-violet-400/70 bg-violet-500/10 shadow-lg shadow-violet-950/40 ring-1 ring-violet-400/30"
          : "border-white/10"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Move ${song.title}`}
          className="touch-none cursor-grab text-zinc-500 hover:text-violet-300 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-4 text-right font-mono text-xs text-zinc-500">{index + 1}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{song.title}</div>
          <div className="text-xs text-zinc-400">{song.original_key}</div>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Remove ${song.title}`}
        onClick={() => onRemove(song.id)}
        className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function SetlistInsertionGap({
  active,
  index,
  songTitle,
}: {
  active: boolean;
  index: number;
  songTitle: string | null;
}) {
  return (
    <li
      role="presentation"
      aria-hidden={active ? undefined : true}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        <div
          role={active ? "status" : undefined}
          aria-label={active && songTitle ? `Insert ${songTitle} as song ${index + 1}` : undefined}
          className="mb-2 flex min-h-16 items-center justify-center rounded-lg border-2 border-dashed border-violet-400/70 bg-violet-500/10 px-3 text-xs font-bold text-violet-200 shadow-inner shadow-violet-500/10"
        >
          Drop as song {index + 1}
        </div>
      </div>
    </li>
  );
}

function DroppableZone({
  activeReorderSongId,
  insertionIndex,
  insertingSongTitle,
  onRemove,
  selectedSongs,
}: {
  activeReorderSongId: string | null;
  insertionIndex: number | null;
  insertingSongTitle: string | null;
  onRemove: (id: string) => void;
  selectedSongs: SetlistFormSong[];
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: "setlist-dropzone",
    disabled: selectedSongs.length > 0,
  });
  return (
    <div className="mt-4">
      <h4 className="text-xs font-bold text-zinc-300 mb-2">Adding song</h4>
      <div ref={setNodeRef} className={`p-4 rounded-xl border-2 border-dashed transition-colors min-h-[120px] ${isOver ? 'border-violet-500 bg-violet-500/10' : 'border-white/20 bg-[#111014]/40'}`}>
        {selectedSongs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-500 text-center py-6">
            Drag songs here from the right side
          </div>
        ) : (
          <SortableContext
            items={selectedSongs.map((song) => `selected-${song.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <ol aria-label="Setlist song order">
              {selectedSongs.map((song, index) => [
                <SetlistInsertionGap
                  key={`gap-${song.id}`}
                  active={insertionIndex === index}
                  index={index}
                  songTitle={insertingSongTitle}
                />,
                <SortableSelectedSong
                  key={song.id}
                  isActiveReorder={activeReorderSongId === song.id}
                  index={index}
                  onRemove={onRemove}
                  song={song}
                />,
              ])}
              <SetlistInsertionGap
                active={insertionIndex === selectedSongs.length}
                index={selectedSongs.length}
                songTitle={insertingSongTitle}
              />
            </ol>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

export function SetlistForm({
  setlist,
  eventId,
  initialEventType,
  templateId,
  songs,
  }: {
  setlist?: Setlist;
  eventId?: string;
  initialEventType?: EventType;
  templateId?: string;
  songs?: SetlistFormSong[];
  }) {
  const action = setlist ? updateSetlistAction : createSetlistAction;
  const [state, formAction] = useActionState(action, initialActionState);
  const [serviceTitle, setServiceTitle] = useState(setlist?.name ?? "");
  const [eventType] = useState(() => resolveSetlistEventType(setlist?.eventType ?? initialEventType, setlist?.serviceTimes));
  const [serviceType] = useState(() => getPrimaryServiceType(setlist?.serviceTimes) || DEFAULT_SERVICE_TYPE);
  const [location] = useState(setlist?.location || "Main Sanctuary");
  const [callTime] = useState(toTimeValue(setlist?.callTime) ?? "09:00");
  const [rehearsalTime] = useState(toTimeValue(setlist?.rehearsalTime) ?? "08:00");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSongs, setSelectedSongs] = useState<SetlistFormSong[]>(() => {
    if (setlist?.songs && setlist.songs.length > 0) {
      return setlist.songs.map((s) => ({
        id: s.song.id,
        title: s.song.title,
        original_key: s.song.originalKey || s.assignedKey || "",
        bpm: s.song.bpm || null,
      }));
    }
    return [];
  });
  const [activeSong, setActiveSong] = useState<SetlistFormSong | null>(null);
  const [activeReorderSongId, setActiveReorderSongId] = useState<string | null>(null);
  const [libraryInsertionIndex, setLibraryInsertionIndex] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const song = active.data.current;
    const activeId = String(active.id);
    const isLibrarySong = activeId.startsWith("library-") && isSetlistFormSong(song);
    setActiveSong(isLibrarySong ? song : null);
    setActiveReorderSongId(activeId.startsWith("selected-") ? activeId.slice("selected-".length) : null);
    setLibraryInsertionIndex(null);
  }

  function resetDragState() {
    setActiveSong(null);
    setActiveReorderSongId(null);
    setLibraryInsertionIndex(null);
  }

  function handleDragMove(event: DragMoveEvent) {
    const { active, over } = event;
    const song = active.data.current;
    if (
      !String(active.id).startsWith("library-") ||
      !isSetlistFormSong(song) ||
      selectedSongs.some((item) => item.id === song.id) ||
      !over
    ) {
      setLibraryInsertionIndex(null);
      return;
    }

    if (over.id === "setlist-dropzone") {
      setLibraryInsertionIndex(selectedSongs.length);
      return;
    }

    const overIndex = selectedSongs.findIndex((item) => `selected-${item.id}` === over.id);
    if (overIndex < 0) {
      setLibraryInsertionIndex(null);
      return;
    }

    const translated = active.rect.current.translated;
    const draggedPastMiddle = translated
      ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
      : false;
    setLibraryInsertionIndex(overIndex + (draggedPastMiddle ? 1 : 0));
  }

  function handleDragEnd(event: DragEndEvent) {
    resetDragState();
    const { active, over } = event;
    const song = active.data.current;
    if (!over || !isSetlistFormSong(song)) return;

    if (String(active.id).startsWith("selected-")) {
      if (active.id === over.id) return;
      setSelectedSongs((items) => {
        const oldIndex = items.findIndex((item) => `selected-${item.id}` === active.id);
        const newIndex = items.findIndex((item) => `selected-${item.id}` === over.id);
        return oldIndex >= 0 && newIndex >= 0 ? arrayMove(items, oldIndex, newIndex) : items;
      });
      return;
    }

    if (!String(active.id).startsWith("library-")) return;
    setSelectedSongs((items) => {
      if (items.some((item) => item.id === song.id)) return items;
      if (over.id === "setlist-dropzone") return [...items, song];

      const overIndex = items.findIndex((item) => `selected-${item.id}` === over.id);
      if (overIndex < 0) return items;

      const translated = active.rect.current.translated;
      const droppedAfter = translated
        ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
        : false;
      const insertIndex = overIndex + (droppedAfter ? 1 : 0);
      return [...items.slice(0, insertIndex), song, ...items.slice(insertIndex)];
    });
  }

  return (
    <DndContext
      id="setlist-form-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDragState}
    >
      <div className="animate-fade-in">
        <form action={formAction} className="space-y-6">
          {setlist && <input type="hidden" name="setlistId" value={setlist.id} />}
          {eventId && <input type="hidden" name="eventId" value={eventId} />}
          {templateId && <input type="hidden" name="templateId" value={templateId} />}
          <ActionMessage state={state} />

          {selectedSongs.map(song => (
             <input key={`input-${song.id}`} type="hidden" name="songIds" value={song.id} />
          ))}

          {/* Dynamic layout based on songs presence */}
          <div className={songs && songs.length > 0 ? "grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6" : "max-w-2xl mx-auto"}>
            
            {/* Left Column: Form */}
            <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left h-fit">
              <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Setlist Information</h3>
              
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Setlist Name *</span>
                <Input name="title" value={serviceTitle} onChange={(event) => setServiceTitle(event.target.value)} placeholder="e.g., Sunday Service" required />
              </label>

              <input type="hidden" name="serviceDate" value={setlist?.date ?? new Date().toISOString().split("T")[0]} />
              <input type="hidden" name="eventType" value={eventType} />
              <input type="hidden" name="serviceType" value={serviceType} />
              <input type="hidden" name="location" value={location} />
              <input type="hidden" name="callTime" value={callTime} />
              <input type="hidden" name="rehearsalTime" value={rehearsalTime} />

              {songs && songs.length > 0 && (
                <DroppableZone
                  activeReorderSongId={activeReorderSongId}
                  insertionIndex={libraryInsertionIndex}
                  insertingSongTitle={activeSong?.title ?? null}
                  selectedSongs={selectedSongs}
                  onRemove={(id) => setSelectedSongs(s => s.filter(x => x.id !== id))}
                />
              )}

              <label className="block space-y-1.5 pt-4">
                <span className="text-xs font-bold text-zinc-300">Notes (Optional)</span>
                <textarea
                  name="notes"
                  defaultValue={setlist?.notes ?? ""}
                  placeholder="Add any notes about this event..."
                  className="min-h-24 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400"
                />
              </label>
            </div>

            {/* Right Column: Song Library */}
            {songs && songs.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left h-[600px] flex flex-col">
                <div className="mb-4 space-y-3 border-b border-white/[0.04] pb-4">
                  <h3 className="text-sm font-bold text-white">Song Library</h3>
                  <Input 
                    type="search"
                    placeholder="Search songs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/[0.04] border-white/10 h-9 text-xs"
                  />
                </div>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                  {songs
                    .filter(song => song.title.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(song => (
                      <DraggableSong key={song.id} song={song} />
                  ))}
                  {songs.filter(song => song.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-4">
                      {searchQuery ? "No songs found matching your search." : "No songs in library."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.04]">
            <ButtonLink href={setlist ? `/setlists/${setlist.id}` : "/setlists"} variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
              Cancel
            </ButtonLink>
            <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500">
              {setlist ? "Save Changes" : "Create Setlist"}
            </SubmitButton>
          </div>
        </form>

        {setlist && (
          <div className="border-t border-red-500/20 pt-6 mt-6 text-left">
            <h4 className="text-sm font-bold text-red-400">Danger Zone</h4>
            <p className="text-xs text-zinc-400 mt-1">Permanently delete this setlist. Any linked Timeline event will be preserved without a setlist.</p>
            <form
              action={async (formData) => {
                await deleteSetlistAction(formData);
              }}
              onSubmit={(e) => {
                if (!window.confirm("Are you absolutely sure you want to delete this setlist? Its Timeline event will be preserved. This cannot be undone.")) {
                  e.preventDefault();
                }
              }}
              className="mt-4"
            >
              <input type="hidden" name="setlistId" value={setlist.id} />
              <Button type="submit" variant="danger">
                Delete Setlist
              </Button>
            </form>
          </div>
        )}
      </div>
      <SetlistDragOverlay activeSong={activeSong} />
    </DndContext>
  );
}

function toTimeValue(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  const date = new Date(`2026-01-01 ${value}`);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
