"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-violet-300">Open preparation tools</summary>
      <div className="mt-4 space-y-3">
        {songs.length === 0 && <p className="text-sm text-zinc-400">Add songs to plan your rehearsal order.</p>}
        {songs.map((song, index) => <div key={song.id} className="grid gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_110px]">
          <div className="min-w-0">
            <h3 className="break-words font-semibold">{index + 1}. {song.title} <span className="text-sm text-zinc-400">· Key {song.assignedKey}</span></h3>
            <label className="mt-2 grid gap-1 text-xs text-zinc-300">Focus for {song.title}
              <input type="text" maxLength={500} value={allocations[song.id]?.focus ?? ""} onChange={event => updateAllocation(song.id, { focus: event.target.value })} placeholder="Intro, harmonies, transitions…" className="min-h-11 w-full min-w-0 rounded border border-white/20 bg-zinc-900 px-3 text-sm text-white" />
            </label>
          </div>
          <label className="grid content-start gap-1 text-xs text-zinc-300">Minutes for {song.title}
            <input type="number" min={0} max={120} step={1} value={allocations[song.id]?.minutes ?? 5} onChange={event => updateAllocation(song.id, { minutes: rehearsalMinutes(event.target.value) })} className="min-h-11 w-full min-w-0 rounded border border-white/20 bg-zinc-900 px-3 text-sm text-white" />
          </label>
        </div>)}
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
    </details>
  </section>;
}
