import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasValidCronAuthorization } from "@/lib/server/cron-auth";
import { safeErrorDetails } from "@/lib/server/safe-error";

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Missing Supabase service role key" }, { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: candidates, error: selectError } = await adminClient
    .from("songs")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", thirtyDaysAgo.toISOString())
    .order("deleted_at", { ascending: true })
    .limit(100);

  if (selectError) {
    console.error("[cleanup-trash] Candidate lookup failed:", safeErrorDetails(selectError));
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  const ids = (candidates ?? []).map(({ id }) => id);
  if (!ids.length) return NextResponse.json({ success: true, deleted: 0, hasMore: false });

  const { data: deleted, error: deleteError } = await adminClient
    .from("songs")
    .delete()
    .in("id", ids)
    .select("id");

  if (deleteError) {
    console.error("[cleanup-trash] Batch deletion failed:", safeErrorDetails(deleteError));
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  console.info("[cleanup-trash] Deleted expired songs:", deleted?.length ?? 0);
  return NextResponse.json({
    success: true,
    deleted: deleted?.length ?? 0,
    hasMore: ids.length === 100,
  });
}
