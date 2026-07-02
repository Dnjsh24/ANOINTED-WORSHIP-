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

  await supabase.auth.getClaims();

  return supabaseResponse;
}
