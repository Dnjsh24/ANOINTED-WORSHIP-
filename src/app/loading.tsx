import { Music2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0d0d10] text-white">
      <header className="hidden border-b border-white/10 bg-[#111014]/95 md:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="h-5 w-40 rounded bg-white/10" />
          <div className="flex items-center gap-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-4 w-20 rounded bg-white/10" />
            ))}
          </div>
          <div className="h-9 w-24 rounded-lg bg-white/10" />
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-6 pb-24 md:px-6 md:pb-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <Music2 className="size-5 animate-pulse" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Loading workspace</p>
            <p className="text-xs font-semibold text-zinc-500">Getting the latest team data...</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
            <div className="space-y-3 rounded-2xl border border-white/10 bg-[#111014]/80 p-5">
              <div className="h-5 w-36 rounded bg-white/10" />
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-11 rounded-lg bg-white/[0.06]" />
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
              ))}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, panelIndex) => (
                <div key={panelIndex} className="space-y-3 rounded-2xl border border-white/10 bg-[#111014]/80 p-4">
                  <div className="h-4 w-28 rounded bg-white/10" />
                  {Array.from({ length: 3 }).map((_, rowIndex) => (
                    <div key={rowIndex} className="h-14 rounded-xl bg-white/[0.06]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
