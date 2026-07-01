"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { type TeamRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "(UTC-8) Pacific Time (US & Canada)",
  "(UTC-7) Mountain Time (US & Canada)",
  "(UTC-6) Central Time (US & Canada)",
  "(UTC-5) Eastern Time (US & Canada)",
  "(UTC+8) Asia/Manila",
];

const LANGUAGES = ["English", "Spanish", "French", "Tagalog"];

export function ProfileForm({
  fullName,
  email,
  primaryRole,
  avatarUrl,
}: {
  fullName: string;
  email: string;
  primaryRole: string;
  accessLevel: TeamRole;
  avatarUrl: string | null;
}) {
  const [state, formAction] = useActionState(updateProfileAction, initialActionState);
  const [phone, setPhone] = useState("(555) 555-0123");
  const [timezone, setTimezone] = useState("(UTC-6) Central Time (US & Canada)");
  const [language, setLanguage] = useState("English");
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);

  return (
    <form action={formAction} className="space-y-6 animate-fade-in">
      <ActionMessage state={state} />
      
      {/* Profile Settings */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Profile Settings</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Full Name</span>
            <Input name="fullName" defaultValue={fullName} required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Email</span>
            <Input aria-label="Email" value={email} disabled className="opacity-60" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Phone</span>
            <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Time Zone</span>
            <div className="relative">
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
              >
                {TIMEZONES.map(t => <option key={t} value={t} className="bg-[#111014]">{t}</option>)}
              </select>
            </div>
          </label>
          <label className="block space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-zinc-300">Language</span>
            <div className="relative">
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
              >
                {LANGUAGES.map(l => <option key={l} value={l} className="bg-[#111014]">{l}</option>)}
              </select>
            </div>
          </label>
          <input type="hidden" name="primaryRole" value={primaryRole} />
          <input type="hidden" name="avatarUrl" value={avatarUrl ?? ""} />
        </div>
      </div>

      {/* Preferences Section */}
      <div className="mt-8 border-t border-white/[0.06] pt-6 space-y-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Preferences</h3>
        
        <div className="space-y-4">
          {/* Email toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
            <div>
              <p className="text-sm font-bold text-white">Email Notifications</p>
              <p className="mt-0.5 text-xs text-zinc-500">Receive updates and announcements via email.</p>
            </div>
            <button
              type="button"
              onClick={() => setEmailNotif(!emailNotif)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                emailNotif ? "bg-violet-600" : "bg-zinc-800"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                emailNotif ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {/* Push toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
            <div>
              <p className="text-sm font-bold text-white">Push Notifications</p>
              <p className="mt-0.5 text-xs text-zinc-500">Receive push notifications on this device.</p>
            </div>
            <button
              type="button"
              onClick={() => setPushNotif(!pushNotif)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                pushNotif ? "bg-violet-600" : "bg-zinc-800"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                pushNotif ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-4 pt-4">
        <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
          Save Changes
        </SubmitButton>
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]"
        >
          Reset Password
        </button>
      </div>
    </form>
  );
}
