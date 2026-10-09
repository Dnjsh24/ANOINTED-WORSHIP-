import { NextResponse } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

export const dynamic = "force-dynamic";

// Admission proof is available only on an explicitly configured preview.
// Normal deployments expose neither identity nor capacity-test configuration.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.CAPACITY_TEST_ENABLED !== "1" || process.env.VERCEL_ENV !== "preview" || !hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const origin = new URL(getSupabaseEnv().url).origin;
  if (origin !== "https://fbrmotzjsnmdpdkcxyqb.supabase.co") {
    return NextResponse.json({ error: "Test isolation unavailable" }, { status: 503, headers });
  }
  const redisURL = process.env.UPSTASH_REDIS_REST_URL;
  if (!redisURL || !process.env.UPSTASH_REDIS_REST_TOKEN || redisURL !== process.env.CAPACITY_TEST_REDIS_REST_URL) {
    return NextResponse.json({ error: "Test Redis isolation unavailable" }, { status: 503, headers });
  }
  const context = await getCurrentTeamContext();
  if (!context.userId || !context.teamId || !context.memberId) {
    return NextResponse.json({ error: "Active test membership required" }, { status: 401, headers });
  }
  return NextResponse.json({
    mode: "isolated-free-preview",
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
    supabaseOrigin: origin,
    redisOrigin: new URL(redisURL).origin,
    userId: context.userId,
    teamId: context.teamId,
    status: "active",
  }, { headers });
}
