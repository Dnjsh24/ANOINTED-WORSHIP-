"use client";

import { useState, useActionState } from "react";
import { createEventAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

const TEAM_OPTIONS = [
  { value: "Worship Band", label: "Worship Band" },
  { value: "Dancers", label: "Dancers" },
  { value: "Singers", label: "Singers" },
  { value: "Media", label: "Media" },
] as const;

export function EventForm({
  setlists = [],
  defaultDate,
  requiresApproval = false,
  canLinkSetlists = true,
}: {
  setlists?: Array<{ id: string; name: string; date: string }>;
  defaultDate?: string;
  requiresApproval?: boolean;
  canLinkSetlists?: boolean;
}) {
  const [state, formAction] = useActionState(createEventAction, initialActionState);
  const [eventType, setEventType] = useState("service");
  const [selectedTeams, setSelectedTeams] = useState<string[]>(["Worship Band"]);
  const [selectAll, setSelectAll] = useState(false);

  const isServiceRehearsal = eventType === "service_rehearsal";

  function toggleTeam(team: string) {
    setSelectedTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team],
    );
    setSelectAll(false);
  }

  function toggleSelectAll() {
    if (selectAll) {
      setSelectedTeams([]);
      setSelectAll(false);
    } else {
      setSelectedTeams(TEAM_OPTIONS.map((t) => t.value));
      setSelectAll(true);
    }
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

        <input type="hidden" name="assignedTeams" value={selectedTeams.join(", ")} />

        <div className="grid gap-6 md:grid-cols-2">

          {/* Left Column: Event Details */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Event Information</h3>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Title *</span>
              <Input name="title" defaultValue="Sunday Morning Worship" placeholder="e.g., Sunday Service" required className="rounded-xl border-white/10" />
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
              <Input type="date" name="date" defaultValue={defaultDate ?? "2026-07-12"} required className="rounded-xl border-white/10" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Location *</span>
              <Input name="location" defaultValue="Main Sanctuary" placeholder="e.g., Main Auditorium" required className="rounded-xl border-white/10" />
            </label>
          </div>

          {/* Right Column: Time & Logistics */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Logistics & Teams</h3>

            <div className="grid grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">{isServiceRehearsal ? "Service start time" : "Start time"} *</span>
                <Input type="time" name="startTime" defaultValue="09:00" required className="rounded-xl border-white/10" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">{isServiceRehearsal ? "Service end time" : "End time"}</span>
                <Input type="time" name="endTime" defaultValue="12:30" className="rounded-xl border-white/10" />
              </label>
            </div>

            {isServiceRehearsal && (
              <div className="space-y-3 rounded-xl border border-violet-400/20 bg-violet-500/5 p-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-300">Rehearsal</p>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Rehearsal date *</span>
                    <Input type="date" name="rehearsalDate" className="rounded-xl border-white/10" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Rehearsal start time *</span>
                    <Input type="time" name="rehearsalStartTime" defaultValue="07:00" required className="rounded-xl border-white/10" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-300">Rehearsal end time</span>
                    <Input type="time" name="rehearsalEndTime" defaultValue="08:30" className="rounded-xl border-white/10" />
                  </label>
                </div>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Assigned teams/roles</span>
              <div className="mt-2 space-y-2">
                {TEAM_OPTIONS.map((team) => (
                  <label key={team.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(team.value)}
                      onChange={() => toggleTeam(team.value)}
                      className="size-4 rounded border-white/10 bg-[#17161b] text-violet-500 focus:ring-violet-500/20"
                    />
                    <span className="text-sm font-semibold text-zinc-300">{team.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-white/10 bg-[#17161b] text-violet-500 focus:ring-violet-500/20"
                  />
                  <span className="text-sm font-bold text-violet-300">All Teams</span>
                </label>
              </div>
            </label>

            {canLinkSetlists ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Setlist (optional)</span>
                <span className="text-[11px] font-medium text-zinc-500">You can link a setlist for any event type, or leave it as no setlist.</span>
                <div className="relative">
                  <select
                    name="linkedSetlistId"
                    defaultValue=""
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
            {requiresApproval ? "Request Event" : "Create Event"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
