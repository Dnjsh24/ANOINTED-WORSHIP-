import { Check, Music2, Users } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export default function TeamsPage() {
  return (
    <main className="min-h-screen bg-[#0d0c12] text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-96 rounded-full bg-violet-600/10 blur-[100px]" />

      {/* Header */}
      <nav className="flex items-center justify-between px-8 py-5 relative z-10">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-400/30">
            <Music2 className="size-4 text-violet-300" />
          </span>
          <span className="text-sm font-bold text-white">Anointed Worship</span>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 text-center animate-fade-up">
        <h1 className="text-3xl font-extrabold text-white">Welcome to Anointed Worship</h1>
        <p className="mt-3 text-sm font-semibold text-zinc-400">
          To get started, create a new team or join an existing one.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {/* Create a Team */}
          <div className="group flex min-h-[440px] flex-col rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-8 text-left transition-all duration-200 hover:border-violet-400/30 hover:bg-white/[0.05]">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 border border-violet-400/20 transition-all duration-200 group-hover:bg-violet-500/25">
              <Users className="size-6 text-violet-300" />
            </div>
            <h2 className="mt-5 text-xl font-extrabold text-white">Create a Team</h2>
            <p className="mt-2 text-sm font-semibold text-zinc-400 leading-relaxed">
              Build your team from scratch. Invite members, set roles, and start planning together.
            </p>

            <ul className="mt-5 space-y-2">
              {["Full team management", "Custom roles & permissions", "Service planning & scheduling"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <Check className="size-3.5 text-violet-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/teams/new"
              className="mt-auto flex h-11 w-full items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]"
            >
              Create a Team
            </Link>
          </div>

          {/* Join a Team */}
          <div className="group flex min-h-[440px] flex-col rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-8 text-left transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.05]">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-400/20 transition-all duration-200 group-hover:bg-emerald-500/20">
              <svg className="size-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3M13.5 19.5l-.197-.099a6 6 0 0 0-5.607 0L7.5 19.5m9-7.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
              </svg>
            </div>
            <h2 className="mt-5 text-xl font-extrabold text-white">Join a Team</h2>
            <p className="mt-2 text-sm font-semibold text-zinc-400 leading-relaxed">
              Have a team code? Join an existing team and start collaborating right away.
            </p>

            <ul className="mt-5 space-y-2">
              {["Instant access", "View team plans & files", "Communicate with the team"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <Check className="size-3.5 text-emerald-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/teams/join"
              className="mt-auto flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-sm font-bold text-white transition-all duration-200 hover:bg-white/[0.10] hover:border-white/20"
            >
              Join a Team
            </Link>
          </div>
        </div>
      </div>

      <footer className="relative z-10 border-t border-white/[0.06] py-5 text-center font-mono text-[10px] font-bold text-zinc-600">
        © 2026 Anointed Worship. All rights reserved.
      </footer>
    </main>
  );
}
