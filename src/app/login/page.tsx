"use client";

import { Music2 } from "lucide-react";
import { use } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = use(searchParams);

  async function handleGoogleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      window.location.href = "/login?error=config";
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        window.location.href = "/login?error=google";
      }
    } catch {
      window.location.href = "/login?error=google";
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0c12] text-white flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] rounded-full bg-violet-600/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-sm animate-fade-up">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex size-16 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 shadow-[0_0_40px_rgba(139,92,246,0.4)] mb-5">
            <Music2 className="size-7 text-violet-300" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Welcome Back</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-400">Sign in to Anointed Worship</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/90 p-7 backdrop-blur-sm shadow-2xl">
          {/* Google */}
          <form onSubmit={handleGoogleSignIn}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-white/[0.10] hover:border-white/20 active:scale-[0.98]"
            >
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </form>

          <LoginStatus params={params} />
        </div>

        <p className="mt-6 text-center font-mono text-[10px] text-zinc-600">
          © 2026 Anointed Worship. All rights reserved.
        </p>
      </div>
    </main>
  );
}

function LoginStatus({ params }: { params: { sent?: string; error?: string } }) {
  if (params.error) {
    const message =
      params.error === "config"
        ? "Sign-in is not configured yet. Add the Supabase environment variables in Vercel, then redeploy."
        : "Sign-in could not be completed. Please try again.";

    return (
      <p className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-center text-xs font-semibold text-red-300">
        {message}
      </p>
    );
  }
  return null;
}
