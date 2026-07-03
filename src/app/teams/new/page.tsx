"use client";

import { Check, ChevronDown, Copy, Mail, MapPin, Music2, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { createTeamAction } from "@/app/actions";

import { generateTeamCode } from "@/lib/domain/team-code";

const createTeamErrors: Record<string, string> = {
  create: "We could not create that workspace yet. Nothing was saved, so please try again.",
  member: "We could not create the workspace with you as owner. Nothing was saved, so please try again.",
  code: "We could not generate a unique join code. Please try again.",
  channel: "We could not create the workspace chat channel. Nothing was saved, so please try again.",
  "channel-member": "We could not add you to the workspace chat channel. Nothing was saved, so please try again.",
};

const STEPS = ["Team Details", "Invite Members", "Review & Create"];

const TIMEZONES = [
  "(UTC-8) Pacific Time (US & Canada)",
  "(UTC-7) Mountain Time (US & Canada)",
  "(UTC-6) Central Time (US & Canada)",
  "(UTC-5) Eastern Time (US & Canada)",
  "(UTC+8) Asia/Manila",
];

const DAYS = ["Sundays", "Saturdays", "Fridays", "Wednesdays"];
const TIMES = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "6:00 PM"];

interface NewTeamPageProps {
  searchParams?: Promise<{ error?: string }>;
}

export default function NewTeamPage({ searchParams }: NewTeamPageProps) {
  const params = use(searchParams ?? Promise.resolve<{ error?: string }>({}));
  const errorMessage = params.error ? createTeamErrors[params.error] ?? "Team creation failed. Please try again." : null;
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  // Form states
  const [teamName, setTeamName] = useState("");
  const [location, setLocation] = useState("");
  const [serviceDay, setServiceDay] = useState("Sundays");
  const [serviceTime, setServiceTime] = useState("9:00 AM");
  const [timezone, setTimezone] = useState("(UTC-8) Pacific Time (US & Canada)");

  // Invite states
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  const previewCode = teamName ? generateTeamCode(teamName, "preview") : "AWT-12345";

  function handleCopy() {
    navigator.clipboard.writeText(previewCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput.trim()) return;
    if (emails.includes(emailInput.trim())) {
      setEmailInput("");
      return;
    }
    setEmails([...emails, emailInput.trim()]);
    setEmailInput("");
  }

  function handleRemoveEmail(indexToRemove: number) {
    setEmails(emails.filter((_, idx) => idx !== indexToRemove));
  }

  return (
    <main className="min-h-screen bg-[#0d0c12] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-96 rounded-full bg-violet-600/8 blur-[100px]" />

      {/* Nav */}
      <nav className="flex items-center gap-2.5 px-8 py-5 relative z-10">
        <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-400/30">
          <Music2 className="size-4 text-violet-300" />
        </span>
        <span className="text-sm font-bold">Anointed Worship</span>
      </nav>

      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-6 animate-fade-up">
        {/* Stepper */}
        <div className="mb-10 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-extrabold transition-all ${i === step ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]" : i < step ? "bg-violet-600/30 text-violet-300" : "bg-white/[0.06] text-zinc-500"}`}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-bold ${i === step ? "text-white" : "text-zinc-500"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="mx-2 h-px w-10 bg-white/[0.08]" />}
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left Panel */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-7">
            {errorMessage ? (
              <p className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                {errorMessage}
              </p>
            ) : null}

            {step === 0 && (
              <div className="animate-fade-in">
                <h1 className="text-2xl font-extrabold text-white">Create Your Ministry Workspace</h1>
                <p className="mt-1.5 text-sm font-semibold text-zinc-400">Set up your team details to get started.</p>

                <div className="mt-7 space-y-4">
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ministry / Team Name</label>
                    <input
                      value={teamName}
                      onChange={e => setTeamName(e.target.value)}
                      required
                      placeholder="e.g. Anointed Praise"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white placeholder:text-zinc-600 focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Location</label>
                    <div className="relative">
                      <input
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder="e.g. Main Campus"
                        className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 pr-10 text-sm font-semibold text-white placeholder:text-zinc-600 focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition-all"
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Default Service Time</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <select
                          value={serviceDay}
                          onChange={e => setServiceDay(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white focus:border-violet-400/50 focus:outline-none transition-all"
                        >
                          {DAYS.map(d => <option key={d} value={d} className="bg-[#111014]">{d}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                      </div>
                      <div className="relative">
                        <select
                          value={serviceTime}
                          onChange={e => setServiceTime(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white focus:border-violet-400/50 focus:outline-none transition-all"
                        >
                          {TIMES.map(t => <option key={t} value={t} className="bg-[#111014]">{t}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Timezone</label>
                    <div className="relative">
                      <select
                        value={timezone}
                        onChange={e => setTimezone(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white focus:border-violet-400/50 focus:outline-none transition-all"
                      >
                        {TIMEZONES.map(t => <option key={t} value={t} className="bg-[#111014]">{t}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full rounded-xl bg-violet-600 py-3.5 text-sm font-extrabold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-[0.98]"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="animate-fade-in">
                <h1 className="text-2xl font-extrabold text-white">Invite Your Team Members</h1>
                <p className="mt-1.5 text-sm font-semibold text-zinc-400">Add the email addresses of your musicians, vocalists, and media techs.</p>

                <div className="mt-7 space-y-6">
                  <form onSubmit={handleAddEmail} className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                      <input
                        type="email"
                        placeholder="musician@church.com"
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.05] pl-10 pr-4 py-3 text-sm font-semibold text-white placeholder:text-zinc-600 focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-xl bg-violet-600 px-5 text-sm font-bold text-white transition-all hover:bg-violet-500 active:scale-[0.98]"
                    >
                      Add
                    </button>
                  </form>

                  {/* Emails list */}
                  <div className="space-y-2">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Invited ({emails.length})</p>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {emails.map((email, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                          <span className="text-sm font-semibold text-zinc-300">{email}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(idx)}
                            className="text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                      {emails.length === 0 && (
                        <p className="py-4 text-center text-xs font-semibold text-zinc-600">No members invited yet. You can share your code later.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-extrabold text-zinc-300 transition-all hover:bg-white/[0.08]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="flex-1 rounded-xl bg-violet-600 py-3.5 text-sm font-extrabold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-in">
                <h1 className="text-2xl font-extrabold text-white">Review & Create Workspace</h1>
                <p className="mt-1.5 text-sm font-semibold text-zinc-400">Double check your details before launching.</p>

                <div className="mt-7 space-y-6">
                  {/* Summary list */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
                    <div>
                      <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500">Ministry Name</span>
                      <span className="text-base font-bold text-white">{teamName}</span>
                    </div>
                    <div>
                      <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500">Location</span>
                      <span className="text-sm font-semibold text-zinc-300">{location}</span>
                    </div>
                    <div>
                      <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500">Service Time</span>
                      <span className="text-sm font-semibold text-zinc-300">{serviceDay} at {serviceTime}</span>
                    </div>
                    <div>
                      <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500">Invited Members</span>
                      <span className="text-sm font-semibold text-zinc-300">
                        {emails.length === 0 ? "None (invite codes can be shared later)" : `${emails.length} member(s)`}
                      </span>
                    </div>
                  </div>

                  <form action={createTeamAction}>
                    <input type="hidden" name="name" value={teamName} />
                    <input type="hidden" name="location" value={location} />
                    <input type="hidden" name="serviceDay" value={serviceDay} />
                    <input type="hidden" name="serviceTime" value={serviceTime} />
                    <input type="hidden" name="timezone" value={timezone} />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-extrabold text-zinc-300 transition-all hover:bg-white/[0.08]"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="flex-1 rounded-xl bg-violet-600 py-3.5 text-sm font-extrabold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-[0.98]"
                      >
                        Create Team
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Team Code + What's Next */}
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-6">
              <h3 className="text-sm font-bold text-white">Your Team Code (Preview)</h3>
              <p className="mt-1 text-[11px] font-semibold text-zinc-400">Share this code for members to join your team.</p>
              <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/5 py-4 text-center">
                <p className="font-mono text-2xl font-extrabold tracking-widest text-violet-300">{previewCode}</p>
              </div>
              <button
                onClick={handleCopy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-xs font-bold text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white"
              >
                <Copy className="size-3.5" />
                {copied ? "Copied!" : "Copy Code"}
              </button>
              <p className="mt-4 text-[10px] font-semibold text-zinc-600">You can always change this later in Team Settings.</p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-6">
              <h3 className="text-sm font-bold text-white">What's Next?</h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  "Invite your team members",
                  "Add your first service",
                  "Build your first setlist",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-xs font-semibold text-zinc-300">
                    <Check className="size-3.5 shrink-0 text-violet-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className="relative z-10 border-t border-white/[0.06] py-5 text-center font-mono text-[10px] font-bold text-zinc-600">
        © 2026 Anointed Worship. All rights reserved.
      </footer>
    </main>
  );
}
