import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import type { Database } from "@/lib/supabase/database.types";
import { rateLimit } from "@/lib/rate-limit";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { hasValidCronAuthorization } from "@/lib/server/cron-auth";

// Verified users have independent budgets. The wider IP gate still bounds
// pre-authentication work when many legitimate users share a venue network.
export const RATE_LIMITS = {
  auth: { max: 10, windowMs: 60_000 },
  aggregateApi: { max: 3_000, windowMs: 60_000 },
  aggregateGeneral: { max: 12_000, windowMs: 60_000 },
  userApi: { max: 150, windowMs: 60_000 },
  userGeneral: { max: 600, windowMs: 60_000 },
  anonymousApi: { max: 30, windowMs: 60_000 },
  anonymousGeneral: { max: 120, windowMs: 60_000 },
} as const;

const MACHINE_ROUTES = new Set([
  "/api/messages/send-scheduled",
  "/api/songs/cleanup-trash",
]);

export function isPublicWebsiteRoute(pathname: string) {
  const publicRoutePrefixes = ["/", "/login", "/auth", "/api/health"];
  if (pathname === "/worship-remote") return true;
  return publicRoutePrefixes.some((route) =>
    pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)),
  );
}

export function isVerifiedMachineRoute(
  pathname: string,
  headers: Headers,
  secret = process.env.CRON_SECRET,
) {
  if (!MACHINE_ROUTES.has(pathname)) return false;
  return hasValidCronAuthorization(
    new Request(`https://machine.local${pathname}`, { headers }),
    secret,
  );
}

export function buildContentSecurityPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://i.scdn.co https://lh3.googleusercontent.com",
    "media-src 'self' blob: https://*.supabase.co",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.spotify.com https://api.spotify.com",
    "frame-src https://open.spotify.com https://www.youtube.com https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function withContentSecurityPolicy(response: NextResponse, policy: string) {
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

/** Extract the best available client IP from the request headers. */
function getClientIp(request: NextRequest): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for");
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
  const originalPathname = request.nextUrl.pathname;
  const prefix = "/services/anointed-worship-app";
  const hasPrefix = originalPathname === prefix || originalPathname.startsWith(`${prefix}/`);
  const pathname = hasPrefix ? originalPathname.slice(prefix.length) || "/" : originalPathname;
  const ip = getClientIp(request);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");
  const isApiRoute = pathname === "/api" || pathname.startsWith("/api/");
  const tier = isAuthRoute ? "auth" : isApiRoute ? "api" : "general";
  const aggregateConfig = isAuthRoute ? RATE_LIMITS.auth
    : isApiRoute ? RATE_LIMITS.aggregateApi : RATE_LIMITS.aggregateGeneral;

  async function enforceLimit(key: string, config: { max: number; windowMs: number }, cookies?: NextResponse) {
    if (process.env.E2E_FORCE_DEMO === "1") return null;
    const { allowed, resetAt } = await rateLimit(key, config.max, config.windowMs);
    if (allowed) return null;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    const response = withContentSecurityPolicy(NextResponse.json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
    }, { status: 429, headers: {
      "Retry-After": String(retryAfterSeconds),
      "X-RateLimit-Limit": String(config.max),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    } }), contentSecurityPolicy);
    if (cookies) cookies.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    return response;
  }
  const aggregateDenial = await enforceLimit(`ip:${tier}:${ip}`, aggregateConfig);
  if (aggregateDenial) return aggregateDenial;

  if (!hasSupabaseEnv()) {
    return withContentSecurityPolicy(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    );
  }

  // The local Next server is always reachable while the internet may not be.
  // Desktop routes authenticate through the cached workspace context instead of
  // forcing a Supabase request on every navigation.
  if (isDesktopRuntime()) {
    return withContentSecurityPolicy(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    );
  }

  if (isVerifiedMachineRoute(pathname, requestHeaders)) {
    return withContentSecurityPolicy(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    );
  }

  const targetUrl = request.nextUrl.clone();

  if (hasPrefix) {
    targetUrl.pathname = pathname;
    
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
        const previousCookies = supabaseResponse.cookies.getAll();
        requestHeaders.set("cookie", request.cookies.toString());
        supabaseResponse = hasPrefix
          ? NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
          : NextResponse.next({ request: { headers: requestHeaders } });
        previousCookies.forEach(cookie => supabaseResponse.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = error ? null : data.user;
  } catch (error) {
    console.warn("Supabase session update failed:", safeErrorDetails(error));
  }

  // A cookie or caller-provided user header never selects this budget.
  if (!isAuthRoute) {
    const config = user
      ? isApiRoute ? RATE_LIMITS.userApi : RATE_LIMITS.userGeneral
      : isApiRoute ? RATE_LIMITS.anonymousApi : RATE_LIMITS.anonymousGeneral;
    const identity = user ? `user:${user.id}` : `anonymous:${ip}`;
    const denial = await enforceLimit(`${identity}:${tier}`, config, supabaseResponse);
    if (denial) return denial;
  }

  function redirectWithCookies(url: URL) {
    const response = withContentSecurityPolicy(NextResponse.redirect(url), contentSecurityPolicy);
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    return response;
  }

  const isPublicRoute = isPublicWebsiteRoute(pathname);
  const isAssetRoute = pathname.startsWith("/_next") || pathname.startsWith("/brand") || pathname.includes(".");

  if (isAssetRoute) {
    return withContentSecurityPolicy(supabaseResponse, contentSecurityPolicy);
  }

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return redirectWithCookies(loginUrl);
  }

  if (user && pathname === "/") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return redirectWithCookies(dashboardUrl);
  }

  return withContentSecurityPolicy(supabaseResponse, contentSecurityPolicy);
}
