"use client";

import { useRef, useState, useTransition } from "react";
import { submitSharedEditRequestAction } from "@/app/edit-request-actions";
import type { SharedEditTargetType } from "@/lib/domain/shared-edit-requests";

const labels: Record<string, string> = { original_key: "Original key", lyrics_chords: "Lyrics and chords", assigned_key: "Assigned key", is_pinned: "Pin announcement", body: "Message", starts_at: "Start time", ends_at: "End time", setlist_date: "Setlist date", choreography_notes: "Choreography", rehearsal_end_time: "Rehearsal end time" };
const excluded = new Set(["song_ids", "assignments", "allocations", "tasks", "entries", "required_roles"]);
const arrays = new Set(["tags", "service_times"]);
const dates = new Set(["setlist_date", "event_date", "rehearsal_date"]);
const times = new Set(["starts_at", "ends_at", "call_time", "rehearsal_time", "rehearsal_end_time"]);
const choices: Record<string, string[]> = { priority: ["normal", "important", "urgent"], type: ["service", "rehearsal", "meeting", "special_event", "service_rehearsal"] };

export function SharedContentRequestForm({ type, targetId, revision, values, members = [], songs = [] }: { type: SharedEditTargetType; targetId: string; revision: number; values: Record<string, unknown>; members?: { id: string; name: string }[]; songs?: { id: string; name: string }[] }) {
  const fields = Object.entries(values).filter(([key]) => !excluded.has(key));
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map(([key, value]) => [key, typeof value === "boolean" ? value : Array.isArray(value) ? value.join("\n") : String(value ?? "")])));
  const [reason, setReason] = useState("");
  const [songIds, setSongIds] = useState<string[]>(() => Array.isArray(values.song_ids) ? values.song_ids.filter((id): id is string => typeof id === "string") : []);
  const [assignments, setAssignments] = useState<{ team_member_id: string; assignment: string }[]>(() => Array.isArray(values.assignments) ? values.assignments.filter((entry): entry is { team_member_id: string; assignment: string } => entry !== null && typeof entry === "object" && typeof entry.team_member_id === "string" && typeof entry.assignment === "string") : []);
  const [selectedSong, setSelectedSong] = useState(songs[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const nonce = useRef<{ fingerprint: string; id: string } | null>(null);
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    const changes: Record<string, unknown> = {};
    for (const [key, before] of fields) {
      const entered = draft[key];
      const after = arrays.has(key) ? String(entered).split("\n").map(value => value.trim()).filter(Boolean) : key === "bpm" ? String(entered).trim() === "" ? null : Number(entered) : typeof before === "boolean" ? entered : String(entered).trim() === "" && before === null ? null : entered;
      if (JSON.stringify(after) !== JSON.stringify(before)) changes[key] = after;
    }
    for (const [key] of fields.filter(([key]) => key.endsWith("member_id"))) changes[key] = String(draft[key] ?? "").trim() || null;
    for (const [key] of fields.filter(([key]) => key.endsWith("member_id"))) if (changes[key] === values[key]) delete changes[key];
    if (Array.isArray(values.song_ids) && JSON.stringify(songIds) !== JSON.stringify(values.song_ids)) changes.song_ids = songIds;
    if (Array.isArray(values.assignments) && JSON.stringify(assignments) !== JSON.stringify(values.assignments)) changes.assignments = assignments;
    if (Object.keys(changes).length === 0) { setMessage("Change at least one field before sending a request."); return; }
    const fingerprint = JSON.stringify({ changes, reason });
    if (nonce.current?.fingerprint !== fingerprint) nonce.current = { fingerprint, id: crypto.randomUUID() };
    const requestNonce = nonce.current.id;
    startTransition(async () => {
      try {
      const result = await submitSharedEditRequestAction({ targetType: type, targetId, revision, changes, reason, requestNonce });
      setMessage(result.message);
      } catch {
        setMessage("The request could not be confirmed. Your draft is retained. Retry when connected.");
      }
    });
  }}>
    {fields.filter(([key]) => !key.endsWith("member_id")).map(([key, before]) => <label key={key} className="block text-sm font-semibold capitalize">{labels[key] ?? key.replaceAll("_", " ")}
      {typeof before === "boolean" ? <input type="checkbox" checked={Boolean(draft[key])} onChange={event => setDraft({ ...draft, [key]: event.target.checked })} disabled={pending} className="ml-3" /> : choices[key] ? <select value={String(draft[key])} onChange={event => setDraft({ ...draft, [key]: event.target.value })} disabled={pending} className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-900 p-3">{choices[key].map(option => <option key={option}>{option}</option>)}</select> : dates.has(key) || times.has(key) || key === "bpm" ? <input type={dates.has(key) ? "date" : times.has(key) ? "time" : "number"} min={key === "bpm" ? 40 : undefined} max={key === "bpm" ? 240 : undefined} value={String(draft[key])} onChange={event => setDraft({ ...draft, [key]: event.target.value })} disabled={pending} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-3" /> : <textarea value={String(draft[key])} onChange={event => setDraft({ ...draft, [key]: event.target.value })} disabled={pending} maxLength={key === "lyrics_chords" ? 20000 : key === "choreography_notes" ? 6000 : key.endsWith("notes") || key === "arrangement" ? 4000 : key === "body" ? 3000 : key.endsWith("url") ? 500 : 2000} rows={key.includes("notes") || key === "body" ? 4 : 2} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-3" />}
      {arrays.has(key) && <span className="text-xs text-zinc-400">One item per line.</span>}
    </label>)}
    {fields.filter(([key]) => key.endsWith("member_id")).map(([key]) => <label key={key} className="block text-sm font-semibold capitalize">{key.replaceAll("_", " ")}<select value={String(draft[key])} disabled={pending} onChange={event => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-900 p-3"><option value="">Unassigned</option>{members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}{draft[key] && !members.some(member => member.id === draft[key]) && <option value={String(draft[key])}>Current member (unavailable)</option>}</select></label>)}
    {Array.isArray(values.song_ids) && <fieldset className="space-y-3 rounded-xl border border-white/10 p-4"><legend>Songs in order</legend>
      {songIds.map((songId, index) => <div key={`${songId}:${index}`} className="flex flex-wrap items-center gap-2"><span>{index + 1}. {songs.find(song => song.id === songId)?.name ?? "Current song"}</span><button type="button" disabled={pending || index === 0} aria-label={`Move song ${index + 1} up`} onClick={() => setSongIds(previous => { const next = [...previous]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} className="rounded border border-white/20 px-2 py-1">Up</button><button type="button" disabled={pending || index === songIds.length - 1} aria-label={`Move song ${index + 1} down`} onClick={() => setSongIds(previous => { const next = [...previous]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} className="rounded border border-white/20 px-2 py-1">Down</button><button type="button" disabled={pending} aria-label={`Remove song ${index + 1}`} onClick={() => setSongIds(previous => previous.filter((_, position) => position !== index))} className="rounded border border-white/20 px-2 py-1">Remove</button></div>)}
      <label className="block">Add song<select value={selectedSong} onChange={event => setSelectedSong(event.target.value)} disabled={pending} className="ml-2 rounded-lg bg-zinc-900 p-2">{songs.map(song => <option key={song.id} value={song.id}>{song.name}</option>)}</select></label><button type="button" disabled={pending || !selectedSong || songIds.length >= 200} onClick={() => setSongIds(previous => [...previous, selectedSong])} className="rounded border border-white/20 px-3 py-2">Add selected song</button>
    </fieldset>}
    {Array.isArray(values.assignments) && <fieldset className="space-y-3 rounded-xl border border-white/10 p-4"><legend>Team assignments</legend>{assignments.map((assignment, index) => <div key={index} className="flex flex-wrap gap-2"><label>Person<select value={assignment.team_member_id} disabled={pending} onChange={event => setAssignments(previous => previous.map((entry, position) => position === index ? { ...entry, team_member_id: event.target.value } : entry))} className="ml-2 rounded-lg bg-zinc-900 p-2"><option value="">Choose a person</option>{members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}{assignment.team_member_id && !members.some(member => member.id === assignment.team_member_id) && <option value={assignment.team_member_id}>Current member (unavailable)</option>}</select></label><label>Role<input value={assignment.assignment} maxLength={80} required disabled={pending} onChange={event => setAssignments(previous => previous.map((entry, position) => position === index ? { ...entry, assignment: event.target.value } : entry))} className="ml-2 rounded-lg border border-white/20 bg-white/5 p-2" /></label><button type="button" disabled={pending} aria-label={`Remove assignment ${index + 1}`} onClick={() => setAssignments(previous => previous.filter((_, position) => position !== index))} className="rounded border border-white/20 px-3 py-2">Remove</button></div>)}<button type="button" disabled={pending || !members.length || assignments.length >= 100} onClick={() => setAssignments(previous => [...previous, { team_member_id: members[0].id, assignment: "" }])} className="rounded border border-white/20 px-3 py-2">Add assignment</button></fieldset>}
    <label className="block text-sm font-semibold">Reason for these changes<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required disabled={pending} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-3" /></label>
    <button disabled={pending} className="rounded-lg bg-violet-600 px-4 py-3">{pending ? "Sending…" : "Submit edit request"}</button>
    <p role="status">{message}</p>
  </form>;
}
