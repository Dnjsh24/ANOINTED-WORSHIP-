import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MemberUsageDay, MemberUsageState } from "@/lib/domain/member-usage";

export type UsageResult<T> = { kind: "ready"; rows: T[] } | { kind: "unavailable"; message: string };

function usageError(code: string) {
  return code === "42P01" || code === "PGRST205" || code === "42703"
    ? "Usage tracking is unavailable until the member usage migration is deployed."
    : "Usage data could not load. Please retry.";
}

export async function loadMemberUsageStates(client: SupabaseClient<Database>, teamId: string): Promise<UsageResult<MemberUsageState>> {
  const rows: MemberUsageState[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("member_usage_state").select("*").eq("team_id", teamId)
      .order("member_id").range(offset, offset + 999);
    if (error) return { kind: "unavailable", message: usageError(error.code) };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { kind: "ready", rows };
  }
}

export async function loadMemberUsageDays(client: SupabaseClient<Database>, teamId: string, start: string, end: string): Promise<UsageResult<MemberUsageDay>> {
  const rows: MemberUsageDay[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("member_usage_daily").select("*").eq("team_id", teamId)
      .gte("usage_date", start).lte("usage_date", end).order("member_id").order("usage_date").range(offset, offset + 999);
    if (error) return { kind: "unavailable", message: usageError(error.code) };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { kind: "ready", rows };
  }
}
