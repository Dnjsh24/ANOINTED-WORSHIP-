"use client";

import { useActionState, useState } from "react";
import { createSetlistAction, updateSetlistAction, deleteSetlistAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import {
  DEFAULT_SERVICE_TYPE,
  EVENT_TYPE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  getPrimaryServiceType,
  isServiceBasedEventType,
  resolveSetlistEventType,
} from "@/lib/domain/event-types";
import type { EventType, ServiceTemplate, Setlist, TeamMember } from "@/lib/types";



export function SetlistForm({
  setlist,
  eventId,
  initialEventType,
  templateId,
  }: {
  setlist?: Setlist;
  eventId?: string;
  initialEventType?: EventType;
  templateId?: string;
  }) {
  const action = setlist ? updateSetlistAction : createSetlistAction;
  const [state, formAction] = useActionState(action, initialActionState);
  const [serviceTitle, setServiceTitle] = useState(setlist?.name ?? "");
  const [eventType, setEventType] = useState(() => resolveSetlistEventType(setlist?.eventType ?? initialEventType, setlist?.serviceTimes));
  const [serviceType, setServiceType] = useState(() => getPrimaryServiceType(setlist?.serviceTimes) || DEFAULT_SERVICE_TYPE);
  const [location, setLocation] = useState(setlist?.location ?? "Main Sanctuary");
  const [callTime, setCallTime] = useState(toTimeValue(setlist?.callTime) ?? "09:00");
  const [rehearsalTime, setRehearsalTime] = useState(toTimeValue(setlist?.rehearsalTime) ?? "08:00");
  const showServiceType = isServiceBasedEventType(eventType);

  function handleEventTypeChange(value: string) {
    setEventType(value as typeof eventType);

    if ((value === "service" || value === "service_rehearsal") && !serviceType) {
      setServiceType(DEFAULT_SERVICE_TYPE);
    }
  }

  return (
    <div className="animate-fade-in">
      <form action={formAction} className="space-y-6">
        {setlist && <input type="hidden" name="setlistId" value={setlist.id} />}
        {eventId && <input type="hidden" name="eventId" value={eventId} />}
        {templateId && <input type="hidden" name="templateId" value={templateId} />}
        <ActionMessage state={state} />

        {/* 2-Column Split Layout */}
        <div className="max-w-2xl mx-auto">
          
          {/* Left Column: Event Information */}
          <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left">
            <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Event Information</h3>

            
            
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Event Title *</span>
              <Input name="title" value={serviceTitle} onChange={(event) => setServiceTitle(event.target.value)} placeholder="e.g., Sunday Service" required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Date *</span>
              <Input type="date" name="serviceDate" defaultValue={setlist?.date} required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Event Type *</span>
              <div className="relative">
                <select name="eventType" value={eventType} onChange={(event) => handleEventTypeChange(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400">
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#111014]">{option.label}</option>
                  ))}
                </select>
              </div>
            </label>

            {showServiceType && (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Service Type *</span>
                <div className="relative">
                  <select name="serviceType" value={serviceType} onChange={(event) => setServiceType(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400">
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option} className="bg-[#111014]">{option}</option>
                    ))}
                  </select>
                </div>
              </label>
            )}
            {!showServiceType && <input type="hidden" name="serviceType" value="" />}

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Location *</span>
              <Input name="location" value={location} onChange={(event) => setLocation(event.target.value)} required />
            </label>

            {/* Call Time & Rehearsal Time row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Call Time *</span>
                <Input type="time" name="callTime" value={callTime} onChange={(event) => setCallTime(event.target.value)} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Rehearsal Time (Optional)</span>
                <Input type="time" name="rehearsalTime" value={rehearsalTime} onChange={(event) => setRehearsalTime(event.target.value)} required />
              </label>
            </div>

            <label className="block space-y-1.5 pt-2">
              <span className="text-xs font-bold text-zinc-300">Notes (Optional)</span>
              <textarea
                name="notes"
                defaultValue={setlist?.notes ?? ""}
                placeholder="Add any notes about this event..."
                className="min-h-24 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400"
              />
            </label>
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

