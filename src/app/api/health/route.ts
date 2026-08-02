import { NextResponse } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ status: "ok", mode: "demo" });
  }

  const { url, publishableKey } = getSupabaseEnv();
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
      headers: { apikey: publishableKey },
    });
    if (!response.ok) throw new Error(`Supabase health returned ${response.status}`);
    return NextResponse.json({ status: "ok", dependencies: { supabase: "reachable" } });
  } catch {
    return NextResponse.json(
      { status: "degraded", dependencies: { supabase: "unreachable" } },
      { status: 503 },
    );
  }
}
