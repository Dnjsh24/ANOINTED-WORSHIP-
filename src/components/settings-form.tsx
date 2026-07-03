"use client";

import { useActionState } from "react";
import { updateTeamSettingsAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

export function SettingsForm({
  teamName,
  teamCode,
  isAdmin = false,
  defaultServiceLocation = "Main Sanctuary",
  defaultCallTime = "08:00",
  defaultRehearsalTime = "08:15",
}: {
  teamName: string;
  teamCode: string;
  isAdmin?: boolean;
  defaultServiceLocation?: string;
  defaultCallTime?: string;
  defaultRehearsalTime?: string;
}) {
  const [state, formAction] = useActionState(updateTeamSettingsAction, initialActionState);

  return (
    <form action={formAction} className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5 rounded-lg border border-white/10 bg-[#17161b] p-5">
        <h2 className="text-2xl font-bold">{isAdmin ? "Ministry Defaults" : "Ministry Settings"}</h2>
        {!isAdmin && (
          <p className="text-xs text-zinc-400 font-semibold">
            Only team owners and admins can modify default settings.
          </p>
        )}
        <ActionMessage state={state} />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-bold text-zinc-300">Team name</span>
            <Input name="teamName" defaultValue={teamName} required disabled={!isAdmin} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-zinc-300">Default service location</span>
            <Input name="defaultServiceLocation" defaultValue={defaultServiceLocation} required disabled={!isAdmin} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-zinc-300">Default call time</span>
            <Input type="time" name="defaultCallTime" defaultValue={defaultCallTime} required disabled={!isAdmin} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-zinc-300">Default rehearsal time</span>
            <Input type="time" name="defaultRehearsalTime" defaultValue={defaultRehearsalTime} required disabled={!isAdmin} />
          </label>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-zinc-300">Notification preferences</legend>
          {[
            ["pendingRequests", "Pending requests"],
            ["upcomingEvents", "Upcoming events"],
            ["unreadMessages", "Unread messages"],
            ["attendanceReminders", "Attendance reminders"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
              <input name={name} type="checkbox" defaultChecked disabled={!isAdmin} className="size-4 accent-violet-500" />
              {label}
            </label>
          ))}
        </fieldset>
        {isAdmin && (
          <div className="flex flex-wrap gap-3">
            <SubmitButton>Save Settings</SubmitButton>
          </div>
        )}
      </div>
      <div className="space-y-6">
        <aside className="rounded-lg border border-white/10 bg-[#17161b] p-5">
          <h2 className="text-xl font-bold">Role Permissions Summary</h2>
          <div className="mt-4 space-y-3 text-sm font-semibold text-zinc-300">
            <p>Owner/Admin: members, settings, invites, team code.</p>
            <p>Worship/Band leaders: setlists, events, song reviews.</p>
            <p>Members: attendance, messages, own profile.</p>
          </div>
          {isAdmin && (
            <div className="mt-6 rounded-md border border-white/10 bg-violet-400/5 p-4 text-center">
              <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Team code</p>
              <p className="mt-2 text-3xl font-bold text-violet-200">{teamCode}</p>
            </div>
          )}
        </aside>
      </div>
    </form>
  );
}
