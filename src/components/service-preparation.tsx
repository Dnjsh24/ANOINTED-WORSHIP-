"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RehearsalRunThrough } from "@/components/rehearsal-run-through";
import { RehearsalSongFields } from "@/components/rehearsal-song-fields";
import { buildRehearsalPlan, preparationGroups, rehearsalMinutes, type RehearsalAllocation, type RehearsalSong } from "@/lib/domain/rehearsal-plan";

export function ServicePreparation({ name, songs }: { name: string; songs: RehearsalSong[] }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [allocations, setAllocations] = useState<Record<string, RehearsalAllocation>>({});
  const totalTasks = preparationGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  const totalMinutes = songs.reduce((sum, song) => sum + (allocations[song.id]?.minutes ?? 5), 0);

  function updateAllocation(id: string, patch: Partial<RehearsalAllocation>) {
    setAllocations(current => ({ ...current, [id]: { ...(current[id] ?? { minutes: 5, focus: "" }), ...patch } }));
  }

  function downloadPlan() {
    const url = URL.createObjectURL(new Blob([buildRehearsalPlan(name, songs, allocations, checked)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "rehearsal-plan.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <section aria-label="Rehearsal and service preparation" className="rounded-2xl border border-white/10 bg-[#111014]/80 p-5">
    <h2 className="text-lg font-bold">Rehearsal &amp; service preparation</h2>
    <p className="mt-2 text-sm text-zinc-400">Plan practice time and focus, then download a copy for your team. Edits and checks last while this page stays open.</p>
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
      <Button type="button" onClick={downloadPlan} className="mt-5">Download rehearsal plan</Button>
    </div>
  </section>;
}
