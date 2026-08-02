import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { safeErrorDetails } from "@/lib/server/safe-error";

export async function logActivity({
  teamId,
  profileId,
  action,
  targetType,
  targetId,
  details = {},
}: {
  teamId: string;
  profileId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Json;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("activity_logs").insert({
    team_id: teamId,
    profile_id: profileId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });

  if (error) {
    console.error("Failed to log activity:", safeErrorDetails(error));
  }
}
