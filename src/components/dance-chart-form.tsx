"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createDanceChartAction, updateDanceChartAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

export type DanceChartOption = {
  id: string;
  label: string;
};

export function DanceChartForm({
  songs,
  events,
  chart,
}: {
  songs: DanceChartOption[];
  events: DanceChartOption[];
  chart?: any;
}) {
  const action = chart ? updateDanceChartAction : createDanceChartAction;
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-white/10 bg-[#111014]/80 p-5">
      {chart && <input type="hidden" name="chartId" value={chart.id} />}
      
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-200">
          {chart ? "Edit Dance Chart" : "New Dance Chart"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-white">{chart ? "Edit Steps" : "Add Steps"}</h2>
      </div>

      <ActionMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold text-zinc-300">Chart Title *</span>
          <Input
            name="title"
            placeholder="e.g. Tambourine pattern for chorus"
            required
            defaultValue={chart?.title}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-300">Song</span>
          <select
            name="songId"
            className="h-10 w-full appearance-none rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            defaultValue={chart?.songId || ""}
          >
            <option value="" className="bg-[#111014] text-white">No song linked</option>
            {songs.map((song) => (
              <option key={song.id} value={song.id} className="bg-[#111014] text-white">
                {song.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-300">Event</span>
          <select
            name="eventId"
            className="h-10 w-full appearance-none rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            defaultValue={chart?.eventId || ""}
          >
            <option value="" className="bg-[#111014] text-white">No event linked</option>
            {events.map((event) => (
              <option key={event.id} value={event.id} className="bg-[#111014] text-white">
                {event.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-t border-white/5 pt-4">
        <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Or Enter Custom Song Details</span>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Custom Song Name</span>
            <Input name="songTitle" placeholder="e.g. Way Maker" defaultValue={chart?.songTitle || ""} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Artist</span>
            <Input name="songArtist" placeholder="e.g. Sinach" defaultValue={chart?.songArtist || ""} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Version / Reference</span>
            <Input name="songVersion" placeholder="e.g. Leeland Live" defaultValue={chart?.songVersion || ""} />
          </label>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-300">YouTube Video Link (Optional)</span>
          <Input name="videoUrl" type="url" placeholder="https://www.youtube.com/watch?v=..." defaultValue={chart?.videoUrl || ""} />
        </label>
      </div>

      <label className="block space-y-1.5 pt-4 border-t border-white/5">
        <span className="text-xs font-bold text-zinc-300">Dance / Tambourine Steps *</span>
        <textarea
          name="choreographyNotes"
          rows={6}
          placeholder="Intro: face center, hands low. Verse: step right, tap left. Chorus: tambourine up/down pattern."
          required
          defaultValue={chart?.choreographyNotes}
          className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-300">Formation Notes</span>
          <textarea
            name="formationNotes"
            rows={4}
            placeholder="Two lines, leader center, dancers 1 and 2 front."
            defaultValue={chart?.formationNotes || ""}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-300">Outfit / Props Notes</span>
          <textarea
            name="outfitNotes"
            rows={4}
            placeholder="White top, purple sash, tambourine with ribbons."
            defaultValue={chart?.outfitNotes || ""}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          />
        </label>
      </div>

      <div className="flex justify-end items-center gap-3 border-t border-white/10 pt-4">
        <Link
          href={chart ? `/dance/${chart.id}` : "/dance"}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08]"
        >
          Cancel
        </Link>
        <SubmitButton>{chart ? "Save Changes" : "Save Dance Chart"}</SubmitButton>
      </div>
    </form>
  );
}
