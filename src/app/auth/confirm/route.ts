import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/lib/supabase/team-context";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;

  if (!hasSupabaseEnv() || !tokenHash || !type) {
    return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=otp", requestUrl.origin));
  }

  const redirectPath = await getPostLoginRedirectPath(supabase);

  return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
}
