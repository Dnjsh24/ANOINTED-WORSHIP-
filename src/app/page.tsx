import { CalendarDays, Library, MessageSquare, Rows3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/lib/supabase/team-context";

export default async function Home() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect(await getPostLoginRedirectPath(supabase));
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0c12] text-white overflow-x-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 animate-fade-down">
        <Link href="/" className="flex items-center" aria-label="Anointed Worship home">
          <Image
            src="/brand/anointed-worship-logo-transparent.png"
            alt="Anointed Worship"
            width={259}
            height={51}
            priority
            className="h-9 w-auto"
          />
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-zinc-300 transition-all hover:bg-white/[0.10] hover:text-white"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl gap-12 px-8 pb-16 pt-10 lg:grid-cols-2 lg:items-center">
        {/* Left */}
        <div className="animate-fade-up">
          <Image
            src="/brand/anointed-worship-logo-transparent.png"
            alt="Anointed Worship"
            width={648}
            height={128}
            priority
            className="mb-8 h-auto w-full max-w-xl"
          />
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-white lg:text-6xl">
            Anointed Worship<br />
            <span className="bg-gradient-to-r from-violet-400 to-purple-300 bg-clip-text text-transparent">
              Ministry Planning
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-sm font-medium leading-7 text-zinc-400">
            Plan with excellence. Lead with worship. Streamline setlists, chord charts, scheduling, and team communication in one beautiful space.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_rgba(139,92,246,0.35)] transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_40px_rgba(139,92,246,0.5)]"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Get Started with Google
            </Link>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
              <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
              No credit card required
            </p>
          </div>
        </div>

        {/* Right — Dashboard Preview */}
        <div className="animate-fade-up relative" style={{ animationDelay: "120ms" }}>
          <div className="absolute -inset-4 rounded-3xl bg-violet-500/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111014] p-5 shadow-2xl">
            {/* Mini preview header */}
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-400">Next Service</span>
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-mono text-[9px] text-violet-300">Live</span>
            </div>
            {/* Service hero mini */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-900/80 via-purple-900/50 to-[#111014] p-5">
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">
                <svg viewBox="0 0 60 90" className="w-16 text-white fill-current">
                  <rect x="24" y="0" width="12" height="90" rx="3" />
                  <rect x="6" y="20" width="48" height="12" rx="3" />
                </svg>
              </div>
              <p className="text-lg font-extrabold text-white">Sunday Worship</p>
              <p className="mt-0.5 text-[11px] font-semibold text-violet-300">Sun, Jul 12 · 9:00 AM & 11:00 AM</p>
              <p className="mt-2 text-[10px] font-semibold text-zinc-400">Main Sanctuary</p>
            </div>
            {/* Setlist preview mini */}
            <div className="mt-4">
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500">Setlist Preview</p>
              {[
                ["Opening Song", "B", "90 BPM"],
                ["Reflection Song", "D", "68 BPM"],
                ["Acoustic Response", "A", "72 BPM"],
                ["Build Song", "B", "130 BPM"],
                ["Response Song", "G", "70 BPM"],
              ].map(([title, key, bpm], i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]">
                  <span className="w-4 shrink-0 font-mono text-[9px] text-zinc-500">{i + 1}</span>
                  <span className="flex-1 text-[11px] font-semibold text-zinc-200">{title}</span>
                  <span className="rounded px-1.5 py-0.5 font-mono text-[9px] bg-violet-500/15 text-violet-300">{key}</span>
                  <span className="rounded px-1.5 py-0.5 font-mono text-[9px] bg-white/[0.05] text-zinc-400">{bpm}</span>
                </div>
              ))}
              <p className="mt-3 border-t border-white/10 pt-2 text-right text-[10px] font-bold text-violet-400">View full setlist →</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-8 pb-20 animate-fade-up" style={{ animationDelay: "200ms" }}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Rows3, title: "Setlists", body: "Build and share service plans with your team." },
            { icon: Library, title: "Chords", body: "Access chord charts, transpose keys, and lyrics instantly." },
            { icon: CalendarDays, title: "Scheduling", body: "Plan rehearsals, events, and services with ease." },
            { icon: MessageSquare, title: "Messaging", body: "Communicate in real time with your entire team." },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5 transition-all duration-200 hover:border-violet-400/30 hover:bg-white/[0.05]"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300 transition-all duration-200 group-hover:bg-violet-500/20">
                <f.icon className="size-4" />
              </span>
              <h2 className="mt-4 text-sm font-bold text-zinc-100">{f.title}</h2>
              <p className="mt-1.5 text-[11px] font-medium leading-5 text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-6 text-center font-mono text-[10px] font-bold text-zinc-600">
        © 2026 Anointed Worship. All rights reserved.
      </footer>
    </main>
  );
}
