"use client";

import { ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { useState } from "react";
import { useActionState } from "react";
import { signOut, updateProfileAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { initialActionState } from "@/lib/action-state";
import {
  SELF_SELECTABLE_MINISTRIES,
  SELF_SELECTABLE_BAND_ROLES,
  getLeadershipRole,
} from "@/lib/domain/leadership-roles";
import { getMemberLeadershipRole } from "@/lib/domain/member-ministries";
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
  ministries: initialMinistries,
  birthday,
  teamAnniversary,
  role,
}: {
  fullName: string;
  email: string;
  ministries: string[];
  birthday: string | null;
  teamAnniversary: string | null;
  role?: string;
}) {
  const [state, formAction] = useActionState(updateProfileAction, initialActionState);
  const [phone, setPhone] = useState("(555) 555-0123");
  const [timezone, setTimezone] = useState("(UTC+8) Asia/Manila");
  const [language, setLanguage] = useState("English");
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [profileStatus, setProfileStatus] = useState("");
  const [ministries, setMinistries] = useState<string[]>(initialMinistries);

  const leadershipRole = getMemberLeadershipRole(role, initialMinistries);

  function toggleMinistry(m: string) {
    setMinistries((prev) => {
      if (prev.includes(m)) {
        // If unchecking "Band Member", also uncheck all band roles
        if (m === "Band Member") {
          return prev.filter((x) => x !== m && !SELF_SELECTABLE_BAND_ROLES.includes(x as any));
        }
        return prev.filter((x) => x !== m);
      } else {
        return [...prev, m];
      }
    });
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
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Time Zone</span>
            <div className="relative">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
              >
                {TIMEZONES.map((t) => <option key={t} value={t} className="bg-[#111014]">{t}</option>)}
              </select>
            </div>
          </label>
          <label className="block space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-zinc-300">Language</span>
            <div className="relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
              >
                {LANGUAGES.map((l) => <option key={l} value={l} className="bg-[#111014]">{l}</option>)}
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

      {/* Leadership Role Section (Admin-managed) */}
      <div className="mt-8 border-t border-white/[0.06] pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Leadership Role</h3>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-zinc-500">
            <ShieldCheck className="size-3 text-violet-400" /> Admin Appointed
          </span>
        </div>

        {leadershipRole ? (
          <div className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl">{leadershipRole.iconEmoji}</span>
              <div>
                <p className="text-sm font-bold text-white leading-tight">{leadershipRole.label}</p>
                <p className="text-xs font-semibold text-amber-200/80 mt-0.5">Active team leadership position</p>
              </div>
            </div>
            <span className="rounded-full px-3 py-1 font-mono text-[10px] font-bold border border-amber-400/40 bg-amber-400/10 text-amber-300">
              Official Role
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs font-semibold text-zinc-400">
            <p className="text-zinc-300 font-bold">General Member</p>
            <p className="mt-1 text-zinc-500 text-[11px]">
              Leadership roles (such as Worship Team Chairman, Worship Leader, Band Leader, Vocal Director, etc.) are assigned by Team Owners and Admins in Team Management.
            </p>
          </div>
        )}
      </div>

      {/* Ministries Section (Self-service) */}
      <div className="mt-8 border-t border-white/[0.06] pt-6 space-y-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Ministry Involvement</h3>
        <p className="text-xs font-semibold text-zinc-400">Select the ministries and areas you serve in:</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {SELF_SELECTABLE_MINISTRIES.map((m) => (
            <label key={m} className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors select-none",
              ministries.includes(m) ? "border-violet-500/50 bg-violet-500/10 text-violet-100 font-bold" : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]"
            )}>
              <input
                type="checkbox"
                className="sr-only"
                checked={ministries.includes(m)}
                onChange={() => toggleMinistry(m)}
              />
              <span className="text-xs">{m}</span>
            </label>
          ))}
        </div>

        {ministries.includes("Band Member") && (
          <div className="mt-4 pt-4 border-t border-white/[0.04] animate-fade-in space-y-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Band Roles & Instruments</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {SELF_SELECTABLE_BAND_ROLES.map((roleName) => (
                <label key={roleName} className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors select-none",
                  ministries.includes(roleName) ? "border-violet-500/50 bg-violet-500/10 text-violet-100 font-bold" : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]"
                )}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={ministries.includes(roleName)}
                    onChange={() => toggleMinistry(roleName)}
                  />
                  <span className="text-xs">{roleName}</span>
                </label>
              ))}
            </div>
          </div>
        )}
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
          <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500">
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
