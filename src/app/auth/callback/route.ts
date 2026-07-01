import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/lib/supabase/team-context";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Construct origin from host header to correctly preserve local network IP address (e.g. for phone access)
  const host = request.headers.get("host") || requestUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;

  if (!hasSupabaseEnv() || !code) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  const redirectPath = await getPostLoginRedirectPath(supabase);

  return NextResponse.redirect(new URL(redirectPath, origin));
}
