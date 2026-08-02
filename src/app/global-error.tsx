"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-[#0d0d10] text-white">
        <main className="flex min-h-dvh items-center justify-center p-6">
          <section className="max-w-lg text-center">
            <h1 className="text-3xl font-black">Anointed Worship needs to reload.</h1>
            <p className="mt-3 text-zinc-300">The application encountered an unexpected error.</p>
            <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-lg bg-violet-600 px-5 font-bold">Reload application</button>
          </section>
        </main>
      </body>
    </html>
  );
}
