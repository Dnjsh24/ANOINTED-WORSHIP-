import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

const base64UrlKey = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/);
const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.url().max(2_048).refine((value) => new URL(value).protocol === "https:", {
      message: "Push endpoint must use HTTPS",
    }),
    expirationTime: z.number().int().nonnegative().nullable().optional(),
    keys: z.object({
      p256dh: base64UrlKey,
      auth: base64UrlKey,
    }).strict(),
  }).strict(),
}).strict();

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = pushSubscriptionSchema.safeParse(await readBoundedJson(req, 16_384));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    }
    const { subscription } = parsed.data;

    const { data: existing, error: lookupError } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("profile_id", user.id)
      .contains("subscription", { endpoint: subscription.endpoint })
      .maybeSingle();

    if (lookupError) {
      console.error("Push subscription lookup failed:", safeErrorDetails(lookupError));
      return NextResponse.json({ error: "Push subscription could not be saved" }, { status: 500 });
    }

    if (!existing) {
      const { error: insertError } = await supabase.from("push_subscriptions").insert({
        profile_id: user.id,
        subscription,
      });
      if (insertError) {
        console.error("Push subscription insert failed:", safeErrorDetails(insertError));
        return NextResponse.json({ error: "Push subscription could not be saved" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error subscribing to web push:", safeErrorDetails(error));
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
