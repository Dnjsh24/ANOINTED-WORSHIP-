"use client";

import { use } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { resolveSafePostLoginReturnPath } from "@/lib/domain/post-login";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const params = use(searchParams);

  async function handleGoogleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSupabaseEnv()) {
      window.location.href = "/login?error=config";
      return;
    }
    try {
      const supabase = createClient();
      // The browser opened by Electron cannot share cookies with the embedded
      // window. Return through the registered app protocol so Electron can load
      // the callback in its own persistent session and complete PKCE there.
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      const returnPath = resolveSafePostLoginReturnPath(params.next, "/dashboard");
      if (returnPath === "/worship-remote") callbackUrl.searchParams.set("next", returnPath);
      const redirectTo = window.anointedDesktop?.isDesktop
        ? "anointed-worship://auth/callback"
        : callbackUrl.toString();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        window.location.href = "/login?error=google";
      }
    } catch {
      window.location.href = "/login?error=google";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0c12] px-6 py-12 text-white">
      <div className="w-full max-w-sm -translate-y-16 animate-fade-up">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center">
          <Image
            src="/brand/sunday-setlist-icon.svg"
            alt="Sunday Setlist logo"
            width={256}
            height={256}
            priority
            className="size-24 object-contain"
          />
        </div>

        <div>
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Welcome Back</h1>
            <p className="mt-3 text-base text-zinc-400">Sign in to continue</p>
          </div>
          {/* Google */}
          <form onSubmit={handleGoogleSignIn}>
            <button
              type="submit"
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-base font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400"
            >
              <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24" fill="none">
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

        <p className="mt-6 text-center text-xs text-zinc-400">
          © 2026 Sunday Setlist. All rights reserved.
        </p>
      </div>
    </main>
  );
}

function LoginStatus({ params }: { params: { sent?: string; error?: string; next?: string } }) {
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
