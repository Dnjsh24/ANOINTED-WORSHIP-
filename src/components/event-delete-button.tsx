"use client";

import { useState, useTransition } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { deleteEventAction } from "@/app/actions";

export function EventDeleteButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-200 transition hover:bg-red-500/20 hover:border-red-400/50"
      >
        <Trash2 className="size-4" />
        Delete Event
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0e14] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="size-5 text-red-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Delete Event</h2>
                <p className="text-sm text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-zinc-300">
              Are you sure you want to delete this event? All attendance records, team assignments, and the linked setlist will also be removed.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                startTransition(async () => {
                  await deleteEventAction(new FormData(e.currentTarget));
                });
                setOpen(false);
              }}
              className="mt-6 flex gap-3"
            >
              <input type="hidden" name="eventId" value={eventId} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "Deleting..." : "Yes, delete event"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
