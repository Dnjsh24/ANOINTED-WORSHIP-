import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subscription } = await req.json();

    if (!subscription) {
      return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
    }

    // Upsert or insert depending on if you want one per device
    // Simplest is to just insert it if it doesn't already exist for this user.
    // For robust implementations, we might need a composite key on (profile_id, endpoint).
    // Let's just do an insert and ignore duplicates if we had a unique constraint, but we don't.
    // Instead we can just delete old ones or let them accumulate.

    // Better: check if it already exists by stringified subscription endpoint
    const { data: existing } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("profile_id", user.id)
      .contains("subscription", { endpoint: subscription.endpoint })
      .single();

    if (!existing) {
      await supabase.from("push_subscriptions").insert({
        profile_id: user.id,
        subscription,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error subscribing to web push:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
