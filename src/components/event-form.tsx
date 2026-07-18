"use client";

import { type Dispatch, type ReactNode, type SetStateAction, useActionState, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ServiceTemplate, TeamMember } from "@/lib/types";
import { createEventAction, updateEventAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

export interface EventAssignments {
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

type AssignmentRow = { id: string; };

type ArrayAssignmentKey = "extraBandMembers" | "backupSingers" | "dancers";



export function EventForm({
  teamMembers = [],
  serviceTemplates = [],
  initialAssignments = {},
  setlists = [],
  defaultDate,
  requiresApproval = false,
  canLinkSetlists = true,
  initialEvent,
}: {
  teamMembers?: TeamMember[];
  serviceTemplates?: ServiceTemplate[];
  initialAssignments?: EventAssignments;
  setlists?: Array<{ id: string; name: string; date: string }>;
  defaultDate?: string;
  requiresApproval?: boolean;
  canLinkSetlists?: boolean;
  initialEvent?: {
    id: string;
    name: string;
    type: string;
    date: string;
    startTime: string;
    endTime: string;
    rehearsalDate: string;
    rehearsalStartTime: string;
    rehearsalEndTime: string;
    location: string;
    assignedTeams: string[];
    notes: string;
    linkedSetlistId: string;
  };
}) {
  const actionToUse = initialEvent ? updateEventAction : createEventAction;
  const [state, formAction] = useActionState(actionToUse, initialActionState);
  const [eventType, setEventType] = useState(initialEvent?.type ?? "service");
    
  const isServiceRehearsal = eventType === "service_rehearsal";

  const nextRowId = useRef(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [assignmentValues, setAssignmentValues] = useState<EventAssignments>(() => normalizeAssignments(initialAssignments));
  const [showSecondKeys, setShowSecondKeys] = useState(() => Boolean(initialAssignments.secondKeys) || !initialEvent);
  const [extraBandRows, setExtraBandRows] = useState(() => createAssignmentRows("extra-band", initialAssignments.extraBandMembers, 0));
  const [singerRows, setSingerRows] = useState(() => createAssignmentRows("singer", initialAssignments.backupSingers, 2));
  const [dancerRows, setDancerRows] = useState(() => createAssignmentRows("dancer", initialAssignments.dancers, 3));

  function addAssignmentRow(prefix: string, setRows: Dispatch<SetStateAction<AssignmentRow[]>>, key: ArrayAssignmentKey) {
    const id = `${prefix}-added-${nextRowId.current}`;
    nextRowId.current += 1;
    setRows((rows) => [...rows, { id }]);
    setAssignmentValues((current) => ({ ...current, [key]: [...(current[key] ?? []), ""] }));
  }

  function removeAssignmentRow(
    rowId: string,
    rows: AssignmentRow[],
    setRows: Dispatch<SetStateAction<AssignmentRow[]>>,
    key: ArrayAssignmentKey,
    minimumRows = 0,
  ) {
    if (rows.length <= minimumRows) return;
    const removedIndex = rows.findIndex((row) => row.id === rowId);
    if (removedIndex < 0) return;
    setRows(rows.filter((row) => row.id !== rowId));
    setAssignmentValues((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((_, index) => index !== removedIndex),
    }));
  }

  function updateAssignment(key: keyof EventAssignments, value: string) {
    setAssignmentValues((current) => ({ ...current, [key]: value }));
  }

  function updateArrayAssignment(key: ArrayAssignmentKey, index: number, value: string) {
    setAssignmentValues((current) => {
      const nextValues = [...(current[key] ?? [])];
      nextValues[index] = value;
      return { ...current, [key]: nextValues };
    });
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = serviceTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const nextAssignments = normalizeAssignments(template.defaultRoles as any);
    setAssignmentValues(nextAssignments);
    setShowSecondKeys(true);
    setExtraBandRows(createAssignmentRows("extra-band", nextAssignments.extraBandMembers, 0));
    setSingerRows(createAssignmentRows("singer", nextAssignments.backupSingers, 2));
    setDancerRows(createAssignmentRows("dancer", nextAssignments.dancers, 3));
  }

  return (
    <div className="animate-fade-in">
      <form action={formAction} className="space-y-6">
        <ActionMessage state={state} />

        {requiresApproval ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            Event requests are sent to an admin or owner before becoming official.
          </div>
        ) : null}

        {initialEvent ? <input type="hidden" name="eventId" value={initialEvent.id} /> : null}
        
        <div className="grid gap-6 md:grid-cols-2">

          {/* Left Column: Event Details */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Event Information</h3>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Title *</span>
              <Input name="title" defaultValue={initialEvent?.name ?? "Sunday Morning Worship"} placeholder="e.g., Sunday Service" required className="rounded-xl border-white/10" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Event type *</span>
              <div className="relative">
                <select
                  name="eventType"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="service" className="bg-[#111014] text-white">Service</option>
                  <option value="rehearsal" className="bg-[#111014] text-white">Rehearsal</option>
                  <option value="service_rehearsal" className="bg-[#111014] text-white">Service + Rehearsal</option>
                  <option value="meeting" className="bg-[#111014] text-white">Meeting</option>
                  <option value="special_event" className="bg-[#111014] text-white">Special Event</option>
                </select>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Date *</span>
              <Input type="date" name="date" defaultValue={initialEvent?.date ?? defaultDate ?? "2026-07-12"} required className="rounded-xl border-white/10" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Location *</span>
              <Input name="location" defaultValue={initialEvent?.location ?? "Main Sanctuary"} placeholder="e.g., Main Auditorium" required className="rounded-xl border-white/10" />
            </label>
          </div>

          {/* Right Column: Time & Logistics */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Logistics & Teams</h3>

            {serviceTemplates.length > 0 && (
              <label className="block space-y-1.5 mb-4">
                <span className="text-xs font-bold text-zinc-300">Apply Service Template</span>
                <select
                  name="templateId"
                  value={selectedTemplateId}
                  onChange={(event) => applyTemplate(event.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                >
                  <option value="" className="bg-[#111014]">No template</option>
                  {serviceTemplates.map((template) => (
                    <option key={template.id} value={template.id} className="bg-[#111014]">
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            )}


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">{isServiceRehearsal ? "Service start time" : "Start time"} *</span>
                <Input type="time" name="startTime" defaultValue={initialEvent?.startTime ?? "09:00"} required className="rounded-xl border-white/10" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">{isServiceRehearsal ? "Service end time" : "End time"}</span>
                <Input type="time" name="endTime" defaultValue={initialEvent?.endTime ?? "12:30"} className="rounded-xl border-white/10" />
              </label>
            </div>

            {isServiceRehearsal && (
              <div className="space-y-3 rounded-xl border border-violet-400/20 bg-violet-500/5 p-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-300">Rehearsal</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Rehearsal date *</span>
                    <Input type="date" name="rehearsalDate" defaultValue={initialEvent?.rehearsalDate ?? ""} className="rounded-xl border-white/10" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Rehearsal start time *</span>
                    <Input type="time" name="rehearsalStartTime" defaultValue={initialEvent?.rehearsalStartTime ?? "07:00"} required className="rounded-xl border-white/10" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Rehearsal end time</span>
                    <Input type="time" name="rehearsalEndTime" defaultValue={initialEvent?.rehearsalEndTime ?? "08:30"} className="rounded-xl border-white/10" />
                  </label>
                </div>
              </div>
            )}

            
            <h3 className="text-sm font-bold text-white mt-6 mb-2 pb-2 border-b border-white/[0.04]">Team Assignments</h3>

            <RoleSelect
              name="worshipLeader"
              label="Worship Leader *"
              placeholder="Select leader"
              value={assignmentValues.worshipLeader ?? ""}
              onValueChange={(value) => updateAssignment("worshipLeader", value)}
              required
              teamMembers={teamMembers}
            />

            <AssignmentSection title="Band">
              <RoleSelect name="mainKeys" label="Keys" placeholder="Select keys" value={assignmentValues.mainKeys ?? ""} onValueChange={(value) => updateAssignment("mainKeys", value)} teamMembers={teamMembers} />
              {showSecondKeys && (
                <RoleSelect
                  name="secondKeys"
                  label="Keys 2"
                  placeholder="Select keys 2"
                  value={assignmentValues.secondKeys ?? ""}
                  onValueChange={(value) => updateAssignment("secondKeys", value)}
                  teamMembers={teamMembers}
                  onRemove={() => {
                    setShowSecondKeys(false);
                    updateAssignment("secondKeys", "");
                  }}
                />
              )}
              <RoleSelect name="acousticGuitar" label="Acoustic Guitar" placeholder="Select acoustic guitarist" value={assignmentValues.acousticGuitar ?? ""} onValueChange={(value) => updateAssignment("acousticGuitar", value)} teamMembers={teamMembers} />
              <RoleSelect name="electricGuitar" label="Electric Guitar" placeholder="Select electric guitarist" value={assignmentValues.electricGuitar ?? ""} onValueChange={(value) => updateAssignment("electricGuitar", value)} teamMembers={teamMembers} />
              <RoleSelect name="bass" label="Bass" placeholder="Select bassist" value={assignmentValues.bass ?? ""} onValueChange={(value) => updateAssignment("bass", value)} teamMembers={teamMembers} />
              <RoleSelect name="drums" label="Drums" placeholder="Select drummer" value={assignmentValues.drums ?? ""} onValueChange={(value) => updateAssignment("drums", value)} teamMembers={teamMembers} />
              {extraBandRows.map((row, index) => (
                <RoleSelect
                  key={row.id}
                  name="extraBandMembers"
                  label={`Band Member ${index + 1}`}
                  placeholder="Select band member"
                  value={assignmentValues.extraBandMembers?.[index] ?? ""}
                  onValueChange={(value) => updateArrayAssignment("extraBandMembers", index, value)}
                  teamMembers={teamMembers}
                  onRemove={() => removeAssignmentRow(row.id, extraBandRows, setExtraBandRows, "extraBandMembers")}
                />
              ))}
              <AddAssignmentButton label="Add More" onClick={() => addAssignmentRow("extra-band", setExtraBandRows, "extraBandMembers")} />
            </AssignmentSection>

            <AssignmentSection title="Singers">
              {singerRows.map((row, index) => (
                <RoleSelect
                  key={row.id}
                  name="backupSingers"
                  label={`Singer ${index + 1}`}
                  placeholder={`Select singer ${index + 1}`}
                  value={assignmentValues.backupSingers?.[index] ?? ""}
                  onValueChange={(value) => updateArrayAssignment("backupSingers", index, value)}
                  teamMembers={teamMembers}
                  onRemove={singerRows.length > 1 ? () => removeAssignmentRow(row.id, singerRows, setSingerRows, "backupSingers", 1) : undefined}
                />
              ))}
              <AddAssignmentButton label="Add Singer" onClick={() => addAssignmentRow("singer", setSingerRows, "backupSingers")} />
            </AssignmentSection>

            <AssignmentSection title="Dance">
              {dancerRows.map((row, index) => (
                <RoleSelect
                  key={row.id}
                  name="dancers"
                  label={`Dancer ${index + 1}`}
                  placeholder={`Select dancer ${index + 1}`}
                  value={assignmentValues.dancers?.[index] ?? ""}
                  onValueChange={(value) => updateArrayAssignment("dancers", index, value)}
                  teamMembers={teamMembers}
                  onRemove={() => removeAssignmentRow(row.id, dancerRows, setDancerRows, "dancers")}
                />
              ))}
              <AddAssignmentButton label="Add Dancers" onClick={() => addAssignmentRow("dancer", setDancerRows, "dancers")} />
            </AssignmentSection>

            <input type="hidden" name="media" value={assignmentValues.media ?? ""} />



            {canLinkSetlists ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Setlist (optional)</span>
                <span className="text-[11px] font-medium text-zinc-500">You can link a setlist for any event type, or leave it as no setlist.</span>
                <div className="relative">
                  <select
                    name="linkedSetlistId"
                    defaultValue={initialEvent?.linkedSetlistId ?? ""}
                    className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="" className="bg-[#111014] text-white">No setlist</option>
                    {setlists.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#111014] text-white">
                        {s.name} ({s.date})
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            ) : null}
          </div>

        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Notes (Optional)</span>
            <textarea
              name="notes"
              defaultValue={initialEvent?.notes ?? ""}
              placeholder="Add any notes about this event..."
              className="min-h-24 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.04]">
          <ButtonLink href="/events" variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
            Cancel
          </ButtonLink>
          <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
            {initialEvent ? "Save Changes" : requiresApproval ? "Request Event" : "Create Event"}
          </SubmitButton>
        </div>
      </form>
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
  value,
  onValueChange,
  required,
  teamMembers,
  onRemove,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
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
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
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
  }));
}

function normalizeAssignments(assignments: EventAssignments): EventAssignments {
  return {
    worshipLeader: assignments.worshipLeader ?? "",
    acousticGuitar: assignments.acousticGuitar ?? "",
    electricGuitar: assignments.electricGuitar ?? "",
    bass: assignments.bass ?? "",
    drums: assignments.drums ?? "",
    mainKeys: assignments.mainKeys ?? "",
    secondKeys: assignments.secondKeys ?? "",
    extraBandMembers: assignments.extraBandMembers ?? [],
    backupSingers: assignments.backupSingers ?? [],
    media: assignments.media ?? "",
    dancers: assignments.dancers ?? [],
  };
}
