import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { usageDateRangeIsValid, type MemberUsageDay, type MemberUsageState } from "@/lib/domain/member-usage";

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

export async function loadMemberUsageDays(client: SupabaseClient<Database>, teamId: string, start: string, end: string, options: { signal?: AbortSignal } = {}): Promise<UsageResult<MemberUsageDay>> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (!usageDateRangeIsValid(start, end)) return { kind: 'unavailable', message: 'Choose valid UTC dates covering at most 366 days.' };
  const rows: MemberUsageDay[] = [];
  let cursor: { memberId: string; date: string } | null = null;
  while (true) {
    signal?.throwIfAborted();
    let query = client.from("member_usage_daily").select("*").eq("team_id", teamId)
      .gte("usage_date", start).lte("usage_date", end).order("member_id").order("usage_date").limit(1000);
    if (cursor) query = query.or(`member_id.gt.${cursor.memberId},and(member_id.eq.${cursor.memberId},usage_date.gt.${cursor.date})`);
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    signal?.throwIfAborted();
    if (error) return { kind: "unavailable", message: usageError(error.code) };
    if (!data || data.length > 1000 || rows.length + data.length > 50000) return { kind: 'unavailable', message: 'Complete usage data could not load within the safe read limit. Previous data is retained.' };
    if (!data.length) return { kind: 'ready', rows };
    for (const row of data) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.member_id) || row.team_id !== teamId
        || !usageDateRangeIsValid(row.usage_date, row.usage_date) || row.usage_date < start || row.usage_date > end
        || !Number.isInteger(row.active_minutes) || row.active_minutes < 0 || row.active_minutes > 1440 || !Number.isInteger(row.sessions) || row.sessions < 0 || row.sessions > 1440
        || cursor && (row.member_id < cursor.memberId || row.member_id === cursor.memberId && row.usage_date <= cursor.date)) return { kind: 'unavailable', message: 'Usage data could not be verified. Please retry.' };
      cursor = { memberId: row.member_id, date: row.usage_date };
    }
    rows.push(...data);
    // Only an empty page proves completion when the API caps pages below 1,000 rows.
  }
}
