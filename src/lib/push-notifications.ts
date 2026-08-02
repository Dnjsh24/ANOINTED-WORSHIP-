import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeErrorDetails } from "@/lib/server/safe-error";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:support@anointedworship.com",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export async function sendWebPush(subscription: webpush.PushSubscription, payload: string) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID keys not configured, skipping push notification.");
    return false;
  }
  try {
    await webpush.sendNotification(subscription, payload, { timeout: 5_000 });
    return true;
  } catch (error) {
    console.error("Error sending push notification:", safeErrorDetails(error));
    return false;
  }
}

export async function notifyProfiles(supabase: SupabaseClient, profileIds: string[], payload: unknown) {
  if (!vapidPublicKey || !vapidPrivateKey || profileIds.length === 0) return;
  
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .in("profile_id", profileIds);

  if (!subs || subs.length === 0) return;

  const payloadString = JSON.stringify(payload);
  
  await Promise.allSettled(
    subs.map((subscription) =>
      sendWebPush(
        subscription.subscription as unknown as webpush.PushSubscription,
        payloadString,
      ),
    )
  );
}
