"use client";

import { useActionState } from "react";
import { createEventAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

export function EventForm({
  setlists = [],
  defaultDate,
}: {
  setlists?: Array<{ id: string; name: string; date: string }>;
  defaultDate?: string;
}) {
  const [state, formAction] = useActionState(createEventAction, initialActionState);

  return (
    <div className="animate-fade-in">
      <form action={formAction} className="space-y-6">
        <ActionMessage state={state} />

        {/* 2-Column Split Layout */}
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
                  defaultValue="service"
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="service" className="bg-[#111014] text-white">Service</option>
                  <option value="rehearsal" className="bg-[#111014] text-white">Rehearsal</option>
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
                <span className="text-xs font-bold text-zinc-300">Start time *</span>
                <Input type="time" name="startTime" defaultValue="09:00" required className="rounded-xl border-white/10" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">End time</span>
                <Input type="time" name="endTime" defaultValue="12:30" className="rounded-xl border-white/10" />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Assigned teams/roles</span>
              <Input name="assignedTeams" defaultValue="Worship Band, AV Team" placeholder="e.g. Choir, Sound Team" className="rounded-xl border-white/10" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Linked setlist</span>
              <div className="relative">
                <select
                  name="linkedSetlistId"
                  defaultValue=""
                  className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="" className="bg-[#111014] text-white">None (Not linked)</option>
                  {setlists.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#111014] text-white">
                      {s.name} ({s.date})
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

        </div>

        {/* Notes (Full Width) */}
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

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.04]">
          <ButtonLink href="/events" variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
            Cancel
          </ButtonLink>
          <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
            Create Event
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
