"use client";

import { CheckCircle2, ChevronDown, Lock, MapPin, Music2, Users, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getTeamPreviewAction, joinTeamAction } from "@/app/actions";

const STEPS = ["Enter Code", "Review Team", "Request Access"];
const ROLES = [
  { label: "Worship Leader", value: "worship_leader" },
  { label: "Backup Singer", value: "member" },
  { label: "Acoustic Guitarist", value: "band_member" },
  { label: "Electric Guitarist", value: "band_member" },
  { label: "Bassist", value: "band_member" },
  { label: "Drummer", value: "band_member" },
  { label: "Pianist / Keys", value: "band_member" },
  { label: "Pastor", value: "pastor" },
  { label: "Media & Tech", value: "media" },
  { label: "Dance Ministry", value: "dancer" },
  { label: "General Member", value: "member" },
];

export function JoinTeamForm() {
  const [step] = useState(0);
  const [code, setCode] = useState("");
  const [codeValid, setCodeValid] = useState(false);
  const [searching, setSearching] = useState(false);
  const [teamPreview, setTeamPreview] = useState<{
    name: string;
    location: string;
    members: number;
    serviceTime: string;
    leader: string;
  } | null>(null);

  function handleCodeChange(value: string) {
    setCode(value);

    if (value.trim().length < 5) {
      setTeamPreview(null);
      setCodeValid(false);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed.length < 5) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await getTeamPreviewAction(trimmed);
        if (res.ok && res.team) {
          setTeamPreview(res.team);
          setCodeValid(true);
        } else {
          setTeamPreview(null);
          setCodeValid(false);
        }
      } catch {
        setTeamPreview(null);
        setCodeValid(false);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [code]);

  return (
    <main className="min-h-screen bg-[#0d0c12] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-96 rounded-full bg-violet-600/8 blur-[100px]" />

      <nav className="flex items-center gap-2.5 px-8 py-5 relative z-10">
        <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-400/30">
          <Music2 className="size-4 text-violet-300" />
        </span>
        <span className="text-sm font-bold">Anointed Worship</span>
      </nav>

      <div className="relative z-10 mx-auto max-w-lg px-6 pb-20 pt-6 animate-fade-up">
        <div className="mb-10 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-extrabold transition-all ${i === step ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]" : "bg-white/[0.06] text-zinc-500"}`}>
                {i + 1}
              </div>
              <span className={`text-xs font-bold ${i === step ? "text-white" : "text-zinc-500"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-white/[0.08]" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-7">
          <h1 className="text-2xl font-extrabold text-white">Join an Existing Team</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-400">Enter the team code provided by your team leader.</p>

          <form action={joinTeamAction} className="mt-7 space-y-5">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Team Code</label>
              <div className="relative">
                <input
                  name="code"
                  value={code}
                  onChange={(event) => handleCodeChange(event.target.value)}
                  placeholder="e.g. DM-10001"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 pr-10 font-mono text-base font-extrabold tracking-widest text-white uppercase placeholder:text-zinc-600 placeholder:normal-case placeholder:font-semibold placeholder:tracking-normal focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition-all"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-violet-400" />
                )}
                {!searching && codeValid && code ? (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-emerald-400" />
                ) : null}
              </div>
              {code && !codeValid && !searching && code.trim().length >= 5 ? (
                <p className="mt-2 text-left text-xs font-semibold text-red-400">
                  No team found with this code. Please check and try again.
                </p>
              ) : null}
            </div>

            {codeValid && teamPreview ? (
              <div className="mx-auto flex w-full max-w-md animate-fade-in items-center gap-4 rounded-xl border border-white/[0.08] bg-[#17161b] p-4 text-left">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/15">
                  <Music2 className="size-5 text-violet-300" />
                </div>
                <div>
                  <p className="font-bold text-white">{teamPreview.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-400">{teamPreview.location}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] font-bold text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" /> {teamPreview.members} Members
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" /> {teamPreview.serviceTime}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Choose Your Role</label>
              <p className="mb-2 text-[11px] font-semibold text-zinc-500">Your role helps your team leader assign you to the right things.</p>
              <div className="relative">
                <select
                  name="role"
                  required
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition-all focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/30"
                >
                  {ROLES.map((role) => (
                    <option key={role.label} value={role.value} className="bg-[#111014]">
                      {role.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-violet-600 py-3.5 text-sm font-extrabold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-[0.98]"
            >
              Request to Join Team
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-zinc-500">
              <Lock className="size-3" />
              A team leader will review your request.
            </p>
          </form>
        </div>
      </div>

      <footer className="relative z-10 border-t border-white/[0.06] py-5 text-center font-mono text-[10px] font-bold text-zinc-600">
        &copy; 2026 Anointed Worship. All rights reserved.
      </footer>
    </main>
  );
}
