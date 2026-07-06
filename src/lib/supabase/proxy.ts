import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.next({ request });
  }

  const prefix = "/services/anointed-worship-app";
  const pathname = request.nextUrl.pathname;
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
