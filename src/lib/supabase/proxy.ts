import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import type { Database } from "@/lib/supabase/database.types";
import { rateLimit } from "@/lib/rate-limit";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { hasValidCronAuthorization } from "@/lib/server/cron-auth";

// ---------------------------------------------------------------------------
// Rate limit configuration per route tier
//
// ⚠️  These limits are shared per IP address. When your whole team connects
//     through a single phone hotspot, everyone shares one IP — so limits
//     must be generous enough for the full team size (10–20 users).
//
//     Sizing guide (hotspot scenario):
//       ~15 users × ~8 Next.js requests per page = ~120 req per navigation burst
//       General window: 600 req / 60s → comfortable headroom for 15 active users
// ---------------------------------------------------------------------------
const RATE_LIMITS = {
  /** OAuth callback — stays tight, this route is unauthenticated */
  auth: { max: 10, windowMs: 60_000 },
  /** API routes — raised to handle the full team hitting endpoints together */
  api: { max: 150, windowMs: 60_000 },
  /** General page navigation — raised for shared-hotspot team usage */
  general: { max: 600, windowMs: 60_000 },
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
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const isAuthRoute = pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api");

  const limitConfig = isAuthRoute
    ? RATE_LIMITS.auth
    : isApiRoute
    ? RATE_LIMITS.api
    : RATE_LIMITS.general;

  const limitKey = `${isAuthRoute ? "auth" : isApiRoute ? "api" : "gen"}:${ip}`;
  const { allowed, resetAt } =
    process.env.E2E_FORCE_DEMO === "1"
      ? { allowed: true, resetAt: Date.now() + limitConfig.windowMs }
      : await rateLimit(limitKey, limitConfig.max, limitConfig.windowMs);

  if (!allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return withContentSecurityPolicy(new NextResponse(
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
    ), contentSecurityPolicy);
  }

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

  const prefix = "/services/anointed-worship-app";
  const hasPrefix = pathname.startsWith(prefix);

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
    console.warn("Supabase session update failed:", safeErrorDetails(error));
  }

  const isPublicRoute = isPublicWebsiteRoute(pathname);
  const isAssetRoute = pathname.startsWith("/_next") || pathname.startsWith("/brand") || pathname.includes(".");

  if (isAssetRoute) {
    return withContentSecurityPolicy(supabaseResponse, contentSecurityPolicy);
  }

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return withContentSecurityPolicy(
      NextResponse.redirect(loginUrl),
      contentSecurityPolicy,
    );
  }

  if (user && pathname === "/") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return withContentSecurityPolicy(
      NextResponse.redirect(dashboardUrl),
      contentSecurityPolicy,
    );
  }

  return withContentSecurityPolicy(supabaseResponse, contentSecurityPolicy);
}
