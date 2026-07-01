"use client";

import { Plus, X } from "lucide-react";
import { type Dispatch, type ReactNode, type SetStateAction, useActionState, useId, useRef, useState } from "react";
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
  extraBandMembers?: string[];
  backupSingers?: string[];
  media?: string;
  dancers?: string[];
}

type AssignmentRow = {
  id: string;
  defaultValue?: string;
};

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
  const nextRowId = useRef(0);
  const [showSecondKeys, setShowSecondKeys] = useState(true);
  const [extraBandRows, setExtraBandRows] = useState(() => createAssignmentRows("extra-band", initialAssignments.extraBandMembers, 0));
  const [singerRows, setSingerRows] = useState(() => createAssignmentRows("singer", initialAssignments.backupSingers, 2));
  const [dancerRows, setDancerRows] = useState(() => createAssignmentRows("dancer", initialAssignments.dancers, 3));

  function addAssignmentRow(prefix: string, setRows: Dispatch<SetStateAction<AssignmentRow[]>>) {
    const id = `${prefix}-added-${nextRowId.current}`;
    nextRowId.current += 1;
    setRows((rows) => [...rows, { id }]);
  }

  function removeAssignmentRow(rowId: string, setRows: Dispatch<SetStateAction<AssignmentRow[]>>, minimumRows = 0) {
    setRows((rows) => {
      if (rows.length <= minimumRows) return rows;
      return rows.filter((row) => row.id !== rowId);
    });
  }

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

            <RoleSelect
              name="worshipLeader"
              label="Worship Leader *"
              placeholder="Select leader"
              defaultValue={initialAssignments.worshipLeader}
              required
              teamMembers={teamMembers}
            />

            <AssignmentSection title="Band">
              <RoleSelect name="mainKeys" label="Keys" placeholder="Select keys" defaultValue={initialAssignments.mainKeys} teamMembers={teamMembers} />
              {showSecondKeys && (
                <RoleSelect
                  name="secondKeys"
                  label="Keys 2"
                  placeholder="Select keys 2"
                  defaultValue={initialAssignments.secondKeys}
                  teamMembers={teamMembers}
                  onRemove={() => setShowSecondKeys(false)}
                />
              )}
              <RoleSelect name="acousticGuitar" label="Acoustic Guitar" placeholder="Select acoustic guitarist" defaultValue={initialAssignments.acousticGuitar} teamMembers={teamMembers} />
              <RoleSelect name="electricGuitar" label="Electric Guitar" placeholder="Select electric guitarist" defaultValue={initialAssignments.electricGuitar} teamMembers={teamMembers} />
              <RoleSelect name="bass" label="Bass" placeholder="Select bassist" defaultValue={initialAssignments.bass} teamMembers={teamMembers} />
              <RoleSelect name="drums" label="Drums" placeholder="Select drummer" defaultValue={initialAssignments.drums} teamMembers={teamMembers} />
              {extraBandRows.map((row, index) => (
                <RoleSelect
                  key={row.id}
                  name="extraBandMembers"
                  label={`Band Member ${index + 1}`}
                  placeholder="Select band member"
                  defaultValue={row.defaultValue}
                  teamMembers={teamMembers}
                  onRemove={() => removeAssignmentRow(row.id, setExtraBandRows)}
                />
              ))}
              <AddAssignmentButton label="Add More" onClick={() => addAssignmentRow("extra-band", setExtraBandRows)} />
            </AssignmentSection>

            <AssignmentSection title="Singers">
              {singerRows.map((row, index) => (
                <RoleSelect
                  key={row.id}
                  name="backupSingers"
                  label={`Singer ${index + 1}`}
                  placeholder={`Select singer ${index + 1}`}
                  defaultValue={row.defaultValue}
                  teamMembers={teamMembers}
                  onRemove={singerRows.length > 1 ? () => removeAssignmentRow(row.id, setSingerRows, 1) : undefined}
                />
              ))}
              <AddAssignmentButton label="Add Singer" onClick={() => addAssignmentRow("singer", setSingerRows)} />
            </AssignmentSection>

            <AssignmentSection title="Dance">
              {dancerRows.map((row, index) => (
                <RoleSelect
                  key={row.id}
                  name="dancers"
                  label={`Dancer ${index + 1}`}
                  placeholder={`Select dancer ${index + 1}`}
                  defaultValue={row.defaultValue}
                  teamMembers={teamMembers}
                  onRemove={() => removeAssignmentRow(row.id, setDancerRows)}
                />
              ))}
              <AddAssignmentButton label="Add Dancers" onClick={() => addAssignmentRow("dancer", setDancerRows)} />
            </AssignmentSection>

            <input type="hidden" name="media" value={initialAssignments.media ?? ""} />
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

function AssignmentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-300">{title}</h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function RoleSelect({
  name,
  label,
  placeholder,
  defaultValue,
  required,
  teamMembers,
  onRemove,
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  required?: boolean;
  teamMembers: TeamMember[];
  onRemove?: () => void;
}) {
  const selectId = useId();

  return (
    <div className="block space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={selectId} className="text-xs font-bold text-zinc-300">
          {label}
        </label>
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${label}`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
            onClick={onRemove}
          >
            <X className="size-3" />
            Remove
          </button>
        )}
      </div>
      <div className="relative">
        <select
          id={selectId}
          name={name}
          defaultValue={defaultValue ?? ""}
          className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
          required={required}
        >
          <option value="" className="bg-[#111014]">{placeholder}</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id} className="bg-[#111014]">
              {member.profile.fullName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AddAssignmentButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-violet-400 transition-colors hover:text-violet-300"
      onClick={onClick}
    >
      <Plus className="size-3.5" />
      {label}
    </button>
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

function createAssignmentRows(prefix: string, values: string[] | undefined, minimumRows: number): AssignmentRow[] {
  const savedValues = values?.filter(Boolean) ?? [];
  const rowCount = Math.max(savedValues.length, minimumRows);

  return Array.from({ length: rowCount }, (_, index) => ({
    id: `${prefix}-${index}`,
    defaultValue: savedValues[index] ?? "",
  }));
}
