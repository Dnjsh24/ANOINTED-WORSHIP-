"use client";

import { useActionState } from "react";
import { createSetlistAction, updateSetlistAction, deleteSetlistAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import type { Setlist, TeamMember } from "@/lib/types";

export interface SetlistAssignments {
  worshipLeader?: string;
  acousticGuitar?: string;
  electricGuitar?: string;
  bass?: string;
  drums?: string;
  mainKeys?: string;
  secondKeys?: string;
  backupSingers?: string[];
  media?: string;
  dancers?: string;
}

export function SetlistForm({
  setlist,
  teamMembers = [],
  initialAssignments = {},
  eventId,
}: {
  setlist?: Setlist;
  teamMembers?: TeamMember[];
  initialAssignments?: SetlistAssignments;
  eventId?: string;
}) {
  const action = setlist ? updateSetlistAction : createSetlistAction;
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <div className="animate-fade-in">
      <form action={formAction} className="space-y-6">
        {setlist && <input type="hidden" name="setlistId" value={setlist.id} />}
        {eventId && <input type="hidden" name="eventId" value={eventId} />}
        <ActionMessage state={state} />

        {/* 2-Column Split Layout */}
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          
          {/* Left Column: Service Information */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Service Information</h3>
            
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Service Title *</span>
              <Input name="title" defaultValue={setlist?.name} placeholder="e.g., Sunday Service" required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Date *</span>
              <Input type="date" name="serviceDate" defaultValue={setlist?.date} required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Service Type *</span>
              <div className="relative">
                <select name="serviceType" defaultValue={setlist?.serviceTimes[0] ?? "Sunday Worship"} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400">
                  <option value="Sunday Worship" className="bg-[#111014]">Sunday Worship</option>
                  <option value="Midweek Rehearsal" className="bg-[#111014]">Midweek Rehearsal</option>
                  <option value="Prayer Meeting" className="bg-[#111014]">Prayer Meeting</option>
                  <option value="Special Event" className="bg-[#111014]">Special Event</option>
                </select>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Location *</span>
              <Input name="location" defaultValue={setlist?.location ?? "Main Sanctuary"} required />
            </label>

            {/* Call Time & Rehearsal Time row */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Call Time *</span>
                <Input type="time" name="callTime" defaultValue={toTimeValue(setlist?.callTime) ?? "09:00"} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Rehearsal Time (Optional)</span>
                <Input type="time" name="rehearsalTime" defaultValue={toTimeValue(setlist?.rehearsalTime) ?? "08:00"} required />
              </label>
            </div>

            <label className="block space-y-1.5 pt-2">
              <span className="text-xs font-bold text-zinc-300">Notes (Optional)</span>
              <textarea
                name="notes"
                defaultValue={setlist?.notes ?? ""}
                placeholder="Add any notes about this service..."
                className="min-h-24 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400"
              />
            </label>
          </div>

          {/* Right Column: Team Assignments */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Team Assignments</h3>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Worship Leader *</span>
              <div className="relative">
                <select
                  name="worshipLeader"
                  defaultValue={initialAssignments.worshipLeader ?? ""}
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                  required
                >
                  <option value="" className="bg-[#111014]">Select leader</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#111014]">
                      {m.profile.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Keys</span>
              <div className="relative">
                <select
                  name="mainKeys"
                  defaultValue={initialAssignments.mainKeys ?? ""}
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                >
                  <option value="" className="bg-[#111014]">Select keys</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#111014]">{m.profile.fullName}</option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Acoustic Guitar</span>
              <div className="relative">
                <select
                  name="acousticGuitar"
                  defaultValue={initialAssignments.acousticGuitar ?? ""}
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                >
                  <option value="" className="bg-[#111014]">Select guitarist</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#111014]">{m.profile.fullName}</option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Bass</span>
              <div className="relative">
                <select
                  name="bass"
                  defaultValue={initialAssignments.bass ?? ""}
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                >
                  <option value="" className="bg-[#111014]">Select bassist</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#111014]">{m.profile.fullName}</option>
                  ))}
                </select>
              </div>
            </label>

            {/* Hidden / Backup details - kept intact to combine */}
            <div className="hidden">
              <input type="hidden" name="electricGuitar" value={initialAssignments.electricGuitar ?? ""} />
              <input type="hidden" name="drums" value={initialAssignments.drums ?? ""} />
              <input type="hidden" name="secondKeys" value={initialAssignments.secondKeys ?? ""} />
              <input type="hidden" name="media" value={initialAssignments.media ?? ""} />
              <input type="hidden" name="dancers" value={initialAssignments.dancers ?? ""} />
            </div>

            <button type="button" className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors pt-2 block">
              + Add Team Role
            </button>
          </div>

        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.04]">
          <ButtonLink href={setlist ? `/setlists/${setlist.id}` : "/setlists"} variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
            Cancel
          </ButtonLink>
          <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
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
