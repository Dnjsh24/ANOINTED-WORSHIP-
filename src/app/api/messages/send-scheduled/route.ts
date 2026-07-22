import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  // We can use GET for Vercel Cron jobs easily.
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // Find all scheduled messages whose time has come and are not delivered
    const { data: messages, error } = await supabase
      .from("messages")
      .select("id")
      .eq("is_delivered", false)
      .lte("scheduled_for", new Date().toISOString());

    if (error) {
      console.error("Cron Error fetching messages:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, delivered: 0 });
    }

    const messageIds = messages.map((m: any) => m.id);

    // Update them to be delivered
    const { error: updateError } = await supabase
      .from("messages")
      .update({ is_delivered: true })
      .in("id", messageIds);

    if (updateError) {
      console.error("Cron Error updating messages:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, delivered: messageIds.length });
  } catch (err: any) {
    console.error("Cron Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
