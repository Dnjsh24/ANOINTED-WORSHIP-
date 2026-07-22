"use client";

import { useState } from "react";
import { useActionState } from "react";
import { signOut, updateProfileAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "(UTC-8) Pacific Time (US & Canada)",
  "(UTC-7) Mountain Time (US & Canada)",
  "(UTC-6) Central Time (US & Canada)",
  "(UTC-5) Eastern Time (US & Canada)",
  "(UTC+8) Asia/Manila",
];

const LANGUAGES = ["English", "Spanish", "French", "Tagalog"];

const AVAILABLE_MINISTRIES = [
  "Band Member",
  "Worship Leader",
  "Media & Tech",
  "Dance Ministry",
  "Pastor",
  "Singer / Member",
  "Ushers / Greeters",
];

export function ProfileForm({
  fullName,
  email,
  ministries: initialMinistries,
  birthday,
  teamAnniversary
}: {
  fullName: string;
  email: string;
  ministries: string[];
  birthday: string | null;
  teamAnniversary: string | null;
}) {
  const [state, formAction] = useActionState(updateProfileAction, initialActionState);
  const [phone, setPhone] = useState("(555) 555-0123");
  const [timezone, setTimezone] = useState("(UTC+8) Asia/Manila");
  const [language, setLanguage] = useState("English");
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [profileStatus, setProfileStatus] = useState("");
  const [ministries, setMinistries] = useState<string[]>(initialMinistries);

  function toggleMinistry(m: string) {
    setMinistries(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  }

  return (
    <form action={formAction} className="space-y-6 animate-fade-in">
      <ActionMessage state={state} />
      {profileStatus ? (
        <p aria-live="polite" className="rounded-md border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-100">
          {profileStatus}
        </p>
      ) : null}
      
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
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Birthday</span>
            <Input type="date" name="birthday" defaultValue={birthday || ""} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Team Anniversary</span>
            <Input type="date" name="teamAnniversary" defaultValue={teamAnniversary || ""} />
          </label>
          {ministries.map((m) => (
            <input key={m} type="hidden" name="ministries" value={m} />
          ))}
        </div>
      </div>

      {/* Ministries Section */}
      <div className="mt-8 border-t border-white/[0.06] pt-6 space-y-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Ministry Involvement</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {AVAILABLE_MINISTRIES.map((m) => (
            <label key={m} className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
              ministries.includes(m) ? "border-violet-500/50 bg-violet-500/10 text-violet-100" : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]"
            )}>
              <input
                type="checkbox"
                className="sr-only"
                checked={ministries.includes(m)}
                onChange={() => toggleMinistry(m)}
              />
              <span className="text-xs font-bold">{m}</span>
            </label>
          ))}
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
      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
            Save Changes
          </SubmitButton>
          <button
            type="button"
            onClick={() => setProfileStatus("Password reset needs a Supabase email reset flow before it can send a secure link.")}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]"
          >
            Reset Password
          </button>
        </div>
        <button
          type="submit"
          formAction={signOut}
          formNoValidate
          className="rounded-xl border border-red-400/20 bg-red-500/15 px-6 py-2.5 text-xs font-bold text-red-100 transition hover:border-red-300/30 hover:bg-red-500/25 sm:ml-auto"
        >
          Log Out
        </button>
      </div>
    </form>
  );
}
