import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasValidCronAuthorization } from "@/lib/server/cron-auth";
import { safeErrorDetails } from "@/lib/server/safe-error";

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Scheduled delivery is not configured" }, { status: 503 });
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: delivered, error } = await supabase.rpc("deliver_scheduled_messages", {
      batch_size: 100,
    } as never);

    if (error) {
      console.error("[send-scheduled] Delivery failed:", safeErrorDetails(error));
      return NextResponse.json({ error: "Scheduled delivery failed" }, { status: 500 });
    }

    const count = Array.isArray(delivered) ? delivered.length : 0;
    console.info("[send-scheduled] Delivered scheduled messages:", count);
    return NextResponse.json({ success: true, delivered: count });
  } catch (err) {
    console.error("[send-scheduled] Unexpected failure:", safeErrorDetails(err));
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
