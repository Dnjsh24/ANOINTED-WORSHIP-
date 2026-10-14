"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RehearsalRunThrough } from "@/components/rehearsal-run-through";
import { RehearsalSongFields } from "@/components/rehearsal-song-fields";
import { preparationGroups, rehearsalMinutes, type RehearsalAllocation, type RehearsalSong } from "@/lib/domain/rehearsal-plan";
import { useDemoRehearsalPlan } from "@/lib/use-demo-rehearsal-plan";

export function ServicePreparation({ songs, setlistId }: { name: string; songs: RehearsalSong[]; setlistId?: string }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Record<string, RehearsalAllocation>>({});
  const [status, setStatus] = useState("");
  const demo = useDemoRehearsalPlan(setlistId);
  const allocations = { ...demo.allocations, ...draft };
  const totalTasks = preparationGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  const totalMinutes = songs.reduce((sum, song) => sum + (allocations[song.id]?.minutes ?? 5), 0);

  function updateAllocation(id: string, patch: Partial<RehearsalAllocation>) {
    setDraft(current => ({ ...current, [id]: { ...(current[id] ?? demo.allocations[id] ?? { minutes: 5, focus: "" }), ...patch } }));
    setStatus("");
  }

  function saveNotes() {
    try {
      demo.save(Object.fromEntries(songs.map(song => [song.id, allocations[song.id] ?? { minutes: 5, focus: "" }])));
      setDraft({});
      setStatus("Demo rehearsal notes saved on this device. They are available in the setlist and Stage mode.");
    } catch { setStatus("Notes could not be saved on this device. Keep this page open and retry; your draft is unchanged."); }
  }

  return <section aria-label="Rehearsal and service preparation" className="rounded-2xl border border-white/10 bg-[#111014]/80 p-5">
    <h2 className="text-lg font-bold">Rehearsal &amp; service preparation</h2>
    <p className="mt-2 text-sm text-zinc-400">{setlistId ? "Save your rehearsal notes to show them with each song in the demo setlist and Stage mode. Checklist progress lasts while this page stays open." : "Plan rehearsal time and notes. Connect your team to save notes for the setlist and Stage mode."}</p>
    <p role="status" className="mt-3 text-sm text-violet-200">{totalMinutes} planned rehearsal minutes · {checked.size} of {totalTasks} preparation checks</p>
    <div className="mt-4 space-y-4">
      <RehearsalRunThrough songs={songs} allocations={allocations} />
      <div className="mt-4 space-y-3">
        {songs.length === 0 && <p className="text-sm text-zinc-400">Add songs to plan your rehearsal order.</p>}
        {songs.map((song, index) => <RehearsalSongFields
          key={song.id} song={song} index={index}
          focus={allocations[song.id]?.focus ?? ""} minutes={allocations[song.id]?.minutes ?? 5}
          onFocusChange={focus => updateAllocation(song.id, { focus })}
          onMinutesChange={value => updateAllocation(song.id, { minutes: rehearsalMinutes(value) })}
        />)}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {preparationGroups.map(group => <fieldset key={group.name} className="rounded-lg border border-white/10 p-3">
          <legend className="px-1 text-sm font-bold text-white">{group.name}</legend>
          {group.tasks.map(task => <label key={task} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-zinc-300">
            <input type="checkbox" checked={checked.has(task)} onChange={() => setChecked(current => { const next = new Set(current); if (next.has(task)) next.delete(task); else next.add(task); return next; })} className="mt-1 size-4 shrink-0 accent-violet-400" />
            {task}
          </label>)}
        </fieldset>)}
      </div>
      {setlistId && <Button type="button" onClick={saveNotes} className="mt-5">Save rehearsal notes</Button>}
      <p aria-live="polite" className="text-sm text-violet-200">{status}</p>
    </div>
  </section>;
}
