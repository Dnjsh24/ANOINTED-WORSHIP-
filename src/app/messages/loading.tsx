import { Music2 } from "lucide-react";

export default function MessagesLoading() {
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
        <div className="grid gap-6 md:grid-cols-[280px_1fr] h-[calc(100dvh-200px)] min-h-[500px]">
          {/* Channels Sidebar List */}
          <div className="rounded-2xl border border-white/10 bg-[#111014]/80 p-4 flex flex-col gap-4 animate-pulse">
            <div className="h-6 w-32 rounded bg-white/10" />
            <div className="space-y-2 flex-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 rounded-xl bg-white/[0.04]" />
              ))}
            </div>
            <div className="h-10 rounded-xl bg-white/[0.06]" />
          </div>

          {/* Chat Window Panel */}
          <div className="rounded-2xl border border-white/10 bg-[#111014]/80 p-5 flex flex-col justify-between animate-pulse">
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="space-y-1.5">
                <div className="h-5 w-40 rounded bg-white/10" />
                <div className="h-3 w-24 rounded bg-white/[0.06]" />
              </div>
              <div className="h-8 w-8 rounded-full bg-white/10" />
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 py-6 space-y-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
                <div className="space-y-1">
                  <div className="h-4 w-24 rounded bg-white/10" />
                  <div className="h-10 w-64 rounded-xl bg-white/[0.04]" />
                </div>
              </div>

              <div className="flex items-start gap-3 justify-end">
                <div className="space-y-1 text-right">
                  <div className="h-4 w-20 rounded bg-white/10 ml-auto" />
                  <div className="h-12 w-80 rounded-xl bg-violet-600/10 border border-violet-500/10" />
                </div>
                <div className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
              </div>

              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
                <div className="space-y-1">
                  <div className="h-4 w-32 rounded bg-white/10" />
                  <div className="h-8 w-48 rounded-xl bg-white/[0.04]" />
                </div>
              </div>
            </div>

            {/* Chat Input Bar */}
            <div className="flex gap-3 border-t border-white/[0.06] pt-4">
              <div className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/10" />
              <div className="h-11 w-12 rounded-xl bg-violet-600/20 border border-violet-500/20" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
