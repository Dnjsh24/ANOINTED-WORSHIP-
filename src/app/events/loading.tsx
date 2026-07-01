import { Music2 } from "lucide-react";

export default function EventsLoading() {
  return (
    <main className="min-h-screen bg-[#0d0d10] text-white">
      {/* Mock Header */}
      <header className="hidden border-b border-white/10 bg-[#111014]/95 md:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-400/30">
              <Music2 className="size-4 text-violet-300" />
            </span>
            <div className="h-4 w-28 rounded bg-white/10" />
          </div>
          <div className="flex items-center gap-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-4 w-16 rounded bg-white/10" />
            ))}
          </div>
          <div className="h-9 w-20 rounded-lg bg-white/10" />
        </div>
      </header>

      {/* Content Skeleton */}
      <section className="mx-auto max-w-7xl px-4 py-8 pb-24 md:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6 mb-8">
          <div>
            <div className="h-9 w-48 rounded-lg bg-white/10 animate-pulse" />
            <div className="mt-2 h-4 w-72 rounded bg-white/[0.06] animate-pulse" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-violet-600/20 border border-violet-500/20 animate-pulse" />
        </div>

        {/* Timeline event items skeletons */}
        <div className="space-y-4 max-w-4xl">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/10 bg-[#111014]/80 p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 animate-pulse"
              style={{ animationDelay: `${index * 75}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-white/10 shrink-0" />
                <div className="space-y-2">
                  <div className="h-5 w-48 rounded bg-white/10" />
                  <div className="h-4 w-32 rounded bg-white/[0.06]" />
                  <div className="flex gap-2">
                    <div className="h-4 w-16 rounded bg-white/[0.04]" />
                    <div className="h-4 w-20 rounded bg-white/[0.04]" />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:self-center">
                <div className="h-6 w-20 rounded-full bg-white/[0.06]" />
                <div className="h-6 w-20 rounded-full bg-white/[0.06]" />
              </div>

              <div className="flex items-center gap-3">
                <div className="h-9 w-24 rounded-lg bg-white/10" />
                <div className="h-9 w-24 rounded-lg bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
