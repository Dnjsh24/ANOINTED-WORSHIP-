"use client";

import { useState } from "react";
import { respondSongReadinessAction } from "@/app/workflow-actions";
import { Button } from "@/components/ui/button";
import type { ReadinessState } from "@/lib/domain/team-workflows";
import type { SongReadinessRow } from "@/lib/supabase/workflow.types";
const labels: Record<ReadinessState,string> = { not_started: "Not started", practicing: "Practicing", ready: "Ready", needs_help: "Needs help" };
export function SavedSongReadiness({ slotId, linkedEvent, assigned, own, summary }: {
  slotId: string; linkedEvent: boolean; assigned: boolean; own?: SongReadinessRow; summary: { name: string; state: ReadinessState }[];
}) {
  const [state,setState] = useState<ReadinessState>(own?.state ?? "not_started");
  const [note,setNote] = useState(own?.note ?? "");
  const [pending,setPending] = useState(false);
  const [status,setStatus] = useState("");
  async function save() {
    setPending(true);
    try { setStatus((await respondSongReadinessAction({ slotId,state,note })).message); }
    catch { setStatus("Readiness could not be saved. Keep your note and retry when connected."); }
    finally { setPending(false); }
  }
  return <section aria-label="Saved team song readiness" className="space-y-3 rounded-lg border border-white/10 p-4">
    <h3 className="font-semibold">Saved team readiness</h3>
    <p className="text-xs text-zinc-400">Your team can see this status. It is separate from “Mark as practiced” for this session.</p>
    {!linkedEvent ? <p className="text-sm">Link this setlist to an approved event and assign team members to save readiness.</p> : !assigned ? <p className="text-sm">An event leader must assign you before you can save song readiness.</p> : <>
      <label className="grid gap-1 text-sm">Your readiness<select value={state} disabled={pending} onChange={event => setState(event.target.value as ReadinessState)} className="min-h-11 rounded border border-white/20 bg-zinc-900 px-3">{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Your readiness note<textarea maxLength={500} value={note} disabled={pending} onChange={event => setNote(event.target.value)} className="min-h-20 rounded border border-white/20 bg-zinc-900 p-3" /></label>
      <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : "Save my readiness"}</Button>
    </>}
    {summary.length > 0 && <ul className="space-y-1 text-sm text-zinc-300">{summary.map((row,index) => <li key={`${row.name}:${index}`}>{row.name}: {labels[row.state]}</li>)}</ul>}
    <p role="status" className="text-sm text-violet-200">{status}</p>
  </section>;
}
