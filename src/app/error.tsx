"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0d0d10] p-6 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#16151a] p-8 text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-300">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-black">This page could not finish loading.</h1>
        <p className="mt-3 text-sm text-zinc-300">Your data was not changed. Try the request again or return to the dashboard.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="min-h-11 rounded-lg bg-violet-600 px-5 font-bold hover:bg-violet-500">Try again</button>
          <a href="/dashboard" className="flex min-h-11 items-center rounded-lg border border-white/10 px-5 font-bold hover:bg-white/[0.06]">Dashboard</a>
        </div>
      </section>
    </main>
  );
}
