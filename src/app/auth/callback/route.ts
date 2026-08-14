import { NextResponse, type NextRequest } from "next/server";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/lib/supabase/team-context";
import { getSiteUrl } from "@/lib/supabase/env";
import { resolveSafePostLoginReturnPath } from "@/lib/domain/post-login";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const configuredOrigin = new URL(getSiteUrl()).origin;
  const origin = resolveAuthCallbackOrigin(request, configuredOrigin);

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

  const fallbackPath = await getPostLoginRedirectPath(supabase);
  const redirectPath = resolveSafePostLoginReturnPath(
    requestUrl.searchParams.get("next"),
    fallbackPath,
  );

  return NextResponse.redirect(new URL(redirectPath, origin));
}

function resolveAuthCallbackOrigin(request: NextRequest, configuredOrigin: string) {
  if (!isDesktopRuntime()) return configuredOrigin;

  const host = request.headers.get("host");
  if (!host) return configuredOrigin;

  try {
    const loopbackOrigin = new URL(`http://${host}`);
    return loopbackOrigin.hostname === "127.0.0.1"
      ? loopbackOrigin.origin
      : configuredOrigin;
  } catch {
    return configuredOrigin;
  }
}
