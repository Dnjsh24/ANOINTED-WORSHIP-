import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Rate limit configuration per route tier
// ---------------------------------------------------------------------------
const RATE_LIMITS = {
  /** OAuth callback — tightest limit to prevent code replay abuse */
  auth: { max: 10, windowMs: 60_000 },
  /** Internal API routes — moderate limit */
  api: { max: 30, windowMs: 60_000 },
  /** General page navigation — generous limit, real users won't hit this */
  general: { max: 120, windowMs: 60_000 },
} as const;

/** Extract the best available client IP from the request headers. */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first (client) IP.
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function updateSession(request: NextRequest) {
  // ---------------------------------------------------------------------------
  // Rate limiting — runs before any Supabase or route logic
  // ---------------------------------------------------------------------------
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  const isAuthRoute = pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api");

  const limitConfig = isAuthRoute
    ? RATE_LIMITS.auth
    : isApiRoute
    ? RATE_LIMITS.api
    : RATE_LIMITS.general;

  const limitKey = `${isAuthRoute ? "auth" : isApiRoute ? "api" : "gen"}:${ip}`;
  const { allowed, remaining, resetAt } = rateLimit(limitKey, limitConfig.max, limitConfig.windowMs);

  if (!allowed) {
    const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
    return new NextResponse(
      JSON.stringify({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(limitConfig.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        },
      }
    );
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.next({ request });
  }

  const prefix = "/services/anointed-worship-app";
  const hasPrefix = pathname.startsWith(prefix);

  const requestHeaders = new Headers(request.headers);
  const targetUrl = request.nextUrl.clone();

  if (hasPrefix) {
    targetUrl.pathname = pathname.slice(prefix.length) || "/";
    
    // Clean up Vercel-specific routing headers to prevent Next.js from routing to prefix
    const headersToClean = ["x-matched-path", "x-vercel-forwarded-path", "x-now-route-matches"];
    headersToClean.forEach(headerName => {
      const value = requestHeaders.get(headerName);
      if (value && value.startsWith(prefix)) {
        requestHeaders.set(headerName, value.slice(prefix.length) || "/");
      }
    });
  }

  let supabaseResponse = hasPrefix
    ? NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = hasPrefix
          ? NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
          : NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.warn("Supabase session update failed:", error);
  }

  const publicRoutes = ["/", "/login", "/auth"];
  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAssetRoute = pathname.startsWith("/_next") || pathname.startsWith("/brand") || pathname.includes(".");

  if (isAssetRoute) {
    return supabaseResponse;
  }

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
