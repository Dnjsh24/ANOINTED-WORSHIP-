import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/lib/supabase/team-context";
import { getSiteUrl } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const origin = new URL(getSiteUrl()).origin;

  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  const redirectPath = await getPostLoginRedirectPath(supabase);

  return NextResponse.redirect(new URL(redirectPath, origin));
}
