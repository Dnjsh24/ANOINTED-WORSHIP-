"use client";

import { useActionState, useState } from "react";
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
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";

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

function DraggableSong({ song }: { song: SetlistFormSong }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `song-${song.id}`,
    data: song,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="p-3 border border-white/10 rounded-xl bg-[#17161b] hover:bg-[#1f1e24] hover:border-violet-500/50 cursor-grab active:cursor-grabbing mb-2 transition-colors">
      <div className="text-sm font-bold text-white">{song.title}</div>
      <div className="text-xs text-zinc-400 mt-1">{song.original_key} • {song.bpm} BPM</div>
    </div>
  );
}

function DroppableZone({ selectedSongs, onRemove }: { selectedSongs: SetlistFormSong[]; onRemove: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: "setlist-dropzone" });
  return (
    <div className="mt-4">
      <h4 className="text-xs font-bold text-zinc-300 mb-2">Adding song</h4>
      <div ref={setNodeRef} className={`p-4 rounded-xl border-2 border-dashed transition-colors min-h-[120px] ${isOver ? 'border-violet-500 bg-violet-500/10' : 'border-white/20 bg-[#111014]/40'}`}>
        {selectedSongs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-500 text-center py-6">
            Drag songs here from the right side
          </div>
        ) : (
          <div className="space-y-2">
            {selectedSongs.map((song, idx) => (
              <div key={`${song.id}-${idx}`} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-[#17161b]">
                 <div className="flex items-center gap-3">
                   <span className="text-xs font-mono text-zinc-500 w-4 text-right">{idx + 1}</span>
                   <div>
                     <div className="text-sm font-bold text-white">{song.title}</div>
                     <div className="text-xs text-zinc-400">{song.original_key}</div>
                   </div>
                 </div>
                 <button type="button" onClick={() => onRemove(song.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition" title="Remove song">
                   <Trash2 className="size-4" />
                 </button>
              </div>
            ))}
          </div>
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
  const [location] = useState(setlist?.location ?? "Main Sanctuary");
  const [callTime] = useState(toTimeValue(setlist?.callTime) ?? "09:00");
  const [rehearsalTime] = useState(toTimeValue(setlist?.rehearsalTime) ?? "08:00");
  const [selectedSongs, setSelectedSongs] = useState<SetlistFormSong[]>([]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && over.id === "setlist-dropzone") {
       const song = active.data.current;
       if (isSetlistFormSong(song) && !selectedSongs.some(s => s.id === song.id)) {
         setSelectedSongs([...selectedSongs, song]);
       }
    }
  }

  return (
    <DndContext id="setlist-form-dnd" onDragEnd={handleDragEnd}>
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
                <DroppableZone selectedSongs={selectedSongs} onRemove={(id) => setSelectedSongs(s => s.filter(x => x.id !== id))} />
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
                <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Song Library</h3>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                  {songs.map(song => (
                    <DraggableSong key={song.id} song={song} />
                  ))}
                  {songs.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-4">No songs in library.</p>
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
            <p className="text-xs text-zinc-400 mt-1">Permanently delete this setlist and its associated event timeline. This action cannot be undone.</p>
            <form
              action={async (formData) => {
                await deleteSetlistAction(formData);
              }}
              onSubmit={(e) => {
                if (!window.confirm("Are you absolutely sure you want to delete this setlist and its associated timeline event? This cannot be undone.")) {
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
