"use client";

import { useState } from "react";
import { saveRehearsalPlanAction, respondPreparationTaskAction, reloadPreparationAction } from "@/app/workflow-actions";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { RehearsalRunThrough } from "@/components/rehearsal-run-through";
import { RehearsalSongFields } from "@/components/rehearsal-song-fields";
import { rehearsalMinutes, type RehearsalSong } from "@/lib/domain/rehearsal-plan";
import { defaultPreparationTasks, type PreparationTask, type RehearsalAllocationRow } from "@/lib/domain/team-workflows";
import type { PreparationWorkspace } from "@/lib/supabase/workflow-data";

export type PreparationProposalAction = (input: { revision: number; allocations: RehearsalAllocationRow[]; tasks: PreparationTask[]; reason: string; requestNonce: string }) => Promise<ActionState>;
const field = "min-h-11 w-full min-w-0 rounded border border-white/20 bg-zinc-900 px-3 text-sm text-white disabled:opacity-60";
export function SharedPreparation({ setlistId, songs, workspace, memberId, canManage, proposeAction, onAllocationsChange }: {
  setlistId: string; name: string; songs: RehearsalSong[]; workspace: PreparationWorkspace; memberId: string; canManage: boolean; proposeAction?: PreparationProposalAction;
  onAllocationsChange?: (allocations: RehearsalAllocationRow[]) => void;
}) {
  const [revision, setRevision] = useState(workspace.plan?.revision ?? 0);
  const [allocations, setAllocations] = useState<RehearsalAllocationRow[]>(() => songs.map(song => workspace.plan?.allocations.find(row => row.slot_id === song.id) ?? { slot_id: song.id, minutes: 5, focus: "" }));
  const [tasks, setTasks] = useState(workspace.plan?.tasks ?? defaultPreparationTasks());
  const [savedTasks, setSavedTasks] = useState(workspace.plan?.tasks ?? defaultPreparationTasks());
  const [checks, setChecks] = useState(workspace.checks);
  const [reason, setReason] = useState("");
  const [requestNonce, setRequestNonce] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const editable = canManage || Boolean(proposeAction);
  const totalMinutes = allocations.reduce((sum, row) => sum + row.minutes, 0);
  const names = new Map(workspace.members.map(member => [member.id, member.name]));
  const complete = tasks.filter(task => checks.some(row => row.task_key === task.key && row.team_member_id === task.assignee_member_id && row.completed)).length;
  function editAllocation(slotId: string, patch: Partial<RehearsalAllocationRow>) {
    setAllocations(current => current.map(row => row.slot_id === slotId ? { ...row, ...patch } : row));
    setRequestNonce(null);
  }
  async function save() {
    setPending(true); setStatus("");
    try {
      const nonce = requestNonce ?? crypto.randomUUID();
      if (!canManage) setRequestNonce(nonce);
      const result = canManage
        ? await saveRehearsalPlanAction({ setlistId, revision, allocations, tasks })
        : await proposeAction?.({ revision, allocations, tasks, reason, requestNonce: nonce });
      if (!result) return;
      setStatus(result.message);
      if (result.ok && canManage) {
        onAllocationsChange?.(allocations);
        if (typeof result.data?.revision === "number") setRevision(result.data.revision);
        setSavedTasks(tasks);
      }
    } catch { setStatus("Could not save. Your draft is unchanged. Retry when connected."); }
    finally { setPending(false); }
  }
  async function respond(taskKey: string, completed: boolean) {
    setPending(true);
    try {
      const result = await respondPreparationTaskAction({ setlistId, taskKey, completed });
      setStatus(result.message);
      if (result.ok) setChecks(current => [...current.filter(row => !(row.task_key === taskKey && row.team_member_id === memberId)), { setlist_id: setlistId, task_key: taskKey, team_member_id: memberId, completed, updated_at: new Date().toISOString() }]);
    } catch { setStatus("Check could not be saved. Retry when connected."); }
    finally { setPending(false); }
  }
  async function reload() {
    setPending(true);
    try {
      const result = await reloadPreparationAction(setlistId);
      if (!result.ok) { setStatus(result.message); return; }
      const plan = result.data.plan;
      setRevision(plan?.revision ?? 0);
      const latestAllocations = songs.map(song => plan?.allocations.find(row => row.slot_id === song.id) ?? { slot_id: song.id, minutes: 5, focus: "" });
      setAllocations(latestAllocations);
      onAllocationsChange?.(plan?.allocations ?? []);
      setTasks(plan?.tasks ?? defaultPreparationTasks()); setSavedTasks(plan?.tasks ?? defaultPreparationTasks()); setChecks(result.data.checks); setRequestNonce(null);
      setStatus("Latest shared plan loaded. Draft replaced.");
    } catch { setStatus("Latest plan could not be loaded. Your draft is unchanged."); }
    finally { setPending(false); }
  }
  return <section aria-label="Shared rehearsal preparation" className="space-y-4 rounded-2xl border border-white/10 bg-[#111014]/80 p-5">
    <h2 className="text-lg font-bold">Team rehearsal plan</h2>
    <p className="text-sm text-zinc-400">Save this shared plan to show each song’s rehearsal notes in the setlist and Stage mode. Assigned checks are saved for your team.</p>
    <p className="text-sm text-violet-200">{totalMinutes} rehearsal minutes · {complete} of 10 checks complete · Version {revision}</p>
    <RehearsalRunThrough songs={songs} allocations={Object.fromEntries(allocations.map(row => [row.slot_id, { minutes: row.minutes, focus: row.focus }]))} />
    {songs.map((song, index) => {
      const row = allocations.find(allocation => allocation.slot_id === song.id);
      return <RehearsalSongFields
        key={song.id} song={song} index={index} disabled={!editable || pending}
        focus={row?.focus ?? ""} minutes={row?.minutes ?? 5}
        onFocusChange={focus => editAllocation(song.id, { focus })}
        onMinutesChange={value => editAllocation(song.id, { minutes: rehearsalMinutes(value) })}
      />;
    })}
    <div className="grid gap-3 md:grid-cols-2">
      {tasks.map(task => {
        const checked = checks.some(row => row.task_key === task.key && row.team_member_id === task.assignee_member_id && row.completed);
        // A draft reassignment cannot grant response rights before the saved plan changes.
        const publishedTasks = workspace.plan && workspace.plan.revision > revision ? workspace.plan.tasks : savedTasks;
        const savedAssignee = publishedTasks.find(saved => saved.key === task.key)?.assignee_member_id;
        return <div key={task.key} className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={checked} disabled={pending || savedAssignee !== memberId || task.assignee_member_id !== memberId} onChange={event => void respond(task.key, event.target.checked)} className="mt-1 size-4 shrink-0 accent-violet-400" />{task.key}</label>
          <label className="grid gap-1 text-xs text-zinc-300">Responsible for {task.key}<select value={task.assignee_member_id ?? ""} disabled={!editable || pending} onChange={event => { setTasks(current => current.map(row => row.key === task.key ? { ...row, assignee_member_id: event.target.value || null } : row)); setRequestNonce(null); }} className={field}>
            <option value="">Unassigned</option>{workspace.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select></label>
          {!editable && task.assignee_member_id && <p className="text-xs text-zinc-400">{names.get(task.assignee_member_id) ?? "Unavailable member"}</p>}
        </div>;
      })}
    </div>
    {!canManage && proposeAction && <label className="grid gap-1 text-sm">Reason for requested changes<textarea maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); setRequestNonce(null); }} className={`${field} py-2`} /></label>}
    <div className="flex flex-wrap gap-2">
      {editable && <Button type="button" disabled={pending || (!canManage && !reason.trim())} onClick={() => void save()}>{pending ? "Saving…" : canManage ? "Save shared plan" : "Request plan changes"}</Button>}
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void reload()}>Reload latest plan (replace draft)</Button>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-violet-200">{status}</p>
  </section>;
}
