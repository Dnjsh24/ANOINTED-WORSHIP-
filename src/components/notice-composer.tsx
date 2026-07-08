"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createAnnouncementAction, createReminderAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { teamRoles, type NoticeEventTarget, type NoticeMemberTarget, type ReminderRecurrence, type TeamRole } from "@/lib/types";

type NoticeKind = "announcement" | "reminder";

export function NoticeComposer({
  kind,
  members,
  events = [],
  canCreate,
}: {
  kind: NoticeKind;
  members: NoticeMemberTarget[];
  events?: NoticeEventTarget[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<"all" | "role" | "person">("all");
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>("none");
  const action = kind === "announcement" ? createAnnouncementAction : createReminderAction;
  const [state, formAction] = useActionState(action, initialActionState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  if (!canCreate) {
    return null;
  }

  const title = kind === "announcement" ? "Add Announcement" : "Add Reminder";
  const bodyLabel = kind === "announcement" ? "Announcement" : "Reminder";
  const today = new Date().toISOString().slice(0, 10);
  const modal = open ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#151419] shadow-2xl shadow-black/50"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.08] bg-[#151419] px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">Owner/Admin only</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="space-y-4 px-5 py-5">
          <ActionMessage state={state} />

          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Title</span>
              <Input name="title" placeholder={`${bodyLabel} title`} required />
            </label>

            {kind === "announcement" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Category</span>
                <select
                  name="category"
                  defaultValue="General"
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  {["General", "Info", "Urgent", "Rehearsal", "Media", "Prayer"].map((category) => (
                    <option key={category} value={category} className="bg-[#111014] text-white">
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="targetPath" value="/reminders" />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Priority</span>
              <select
                name="priority"
                defaultValue="normal"
                className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="normal" className="bg-[#111014] text-white">Normal</option>
                <option value="important" className="bg-[#111014] text-white">Important</option>
                <option value="urgent" className="bg-[#111014] text-white">Urgent</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Linked event</span>
              <select
                name="eventId"
                defaultValue=""
                className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="" className="bg-[#111014] text-white">No event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id} className="bg-[#111014] text-white">
                    {event.name} - {formatEventDate(event.date)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Message</span>
            <textarea
              name="body"
              required
              placeholder={`${bodyLabel} details...`}
              className="min-h-28 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Tag</span>
              <select
                name="targetType"
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as "all" | "role" | "person")}
                className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="all" className="bg-[#111014] text-white">All team</option>
                <option value="role" className="bg-[#111014] text-white">Team role</option>
                <option value="person" className="bg-[#111014] text-white">Person</option>
              </select>
            </label>

            {targetType === "role" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Team role</span>
                <select
                  name="targetRole"
                  defaultValue="band_member"
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  {teamRoles.map((role) => (
                    <option key={role} value={role} className="bg-[#111014] text-white">
                      {formatTeamRole(role)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {targetType === "person" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Person</span>
                <select
                  name="targetMemberId"
                  defaultValue={members[0]?.memberId ?? ""}
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  {members.length > 0 ? (
                    members.map((member) => (
                      <option key={member.memberId} value={member.memberId} className="bg-[#111014] text-white">
                        {member.name} - {formatTeamRole(member.role)}
                      </option>
                    ))
                  ) : (
                    <option value="" className="bg-[#111014] text-white">No active members</option>
                  )}
                </select>
              </label>
            ) : null}
          </div>

          {kind === "reminder" ? (
            <div className="grid gap-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 md:grid-cols-[1fr_160px_140px]">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Schedule date</span>
                <Input name="scheduledFor" type="date" defaultValue={today} />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Repeat</span>
                <select
                  name="recurrence"
                  value={recurrence}
                  onChange={(event) => setRecurrence(event.target.value as ReminderRecurrence)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="none" className="bg-[#111014] text-white">Do not repeat</option>
                  <option value="weekly" className="bg-[#111014] text-white">Weekly</option>
                  <option value="monthly" className="bg-[#111014] text-white">Monthly</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Occurrences</span>
                <select
                  name="occurrences"
                  defaultValue="4"
                  disabled={recurrence === "none"}
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-45 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                >
                  {[2, 4, 8, 12].map((count) => (
                    <option key={count} value={count} className="bg-[#111014] text-white">
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-white/[0.06] pt-4">
            <Button type="button" variant="secondary" className="h-10 rounded-lg px-4 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton className="h-10 rounded-lg px-4 text-xs">
              {kind === "announcement" ? "Post Announcement" : "Send Reminder"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button type="button" className="h-10 rounded-lg px-4 text-sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {title}
      </Button>

      {modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null}
    </>
  );
}

function formatTeamRole(role: TeamRole) {
  const labels: Record<TeamRole, string> = {
    owner: "Owners",
    admin: "Admins",
    pastor: "Pastors",
    worship_leader: "Worship Leaders",
    band_leader: "Band Leaders",
    band_member: "Band Members",
    dancer: "Dancers",
    media: "Media Team",
    member: "Members",
  };

  return labels[role];
}

function formatEventDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
