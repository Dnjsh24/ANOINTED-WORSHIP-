import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0d0d10] p-6 text-white">
      <section className="max-w-lg text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-300">404</p>
        <h1 className="mt-3 text-3xl font-black">Page not found</h1>
        <p className="mt-3 text-zinc-300">The link may be outdated or you may not have access to this page.</p>
        <Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-5 font-bold hover:bg-violet-500">Return to dashboard</Link>
      </section>
    </main>
  );
}
