import type { Database } from "@/lib/supabase/database.types";

export type MemberUsageDay = Database["public"]["Tables"]["member_usage_daily"]["Row"];
export type MemberUsageState = Database["public"]["Tables"]["member_usage_state"]["Row"];

export const USAGE_ACTIVITY_WINDOW_MS = 60_000;

export function shouldRecordUsage({ now, lastInputAt, visible, online }: {
  now: number; lastInputAt: number; visible: boolean; online: boolean;
}) {
  return visible && online && now >= lastInputAt && now - lastInputAt < USAGE_ACTIVITY_WINDOW_MS;
}

export function formatLastSeen(lastSeenAt: string | null, now: number): string {
  if (!lastSeenAt) return "Last seen unavailable";
  const elapsed = now - Date.parse(lastSeenAt);
  if (!Number.isFinite(elapsed)) return "Last seen unavailable";
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days} ${days === 1 ? "day" : "days"} ago`;
}

export function summarizeMemberUsage(days: MemberUsageDay[]) {
  const summaries = new Map<string, { memberId: string; activeMinutes: number; sessions: number; dates: string[] }>();
  for (const day of days) {
    const summary = summaries.get(day.member_id) ?? { memberId: day.member_id, activeMinutes: 0, sessions: 0, dates: [] };
    summary.activeMinutes += day.active_minutes;
    summary.sessions += day.sessions;
    if (day.active_minutes > 0) summary.dates.push(day.usage_date);
    summaries.set(day.member_id, summary);
  }
  return [...summaries.values()].map((summary) => ({ ...summary, dates: [...new Set(summary.dates)].sort() }))
    .sort((a, b) => b.activeMinutes - a.activeMinutes || b.sessions - a.sessions || a.memberId.localeCompare(b.memberId));
}

export function usageDateRangeIsValid(start: string, end: string) {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!isDate(start) || !isDate(end)) return false;
  const duration = Date.parse(end) - Date.parse(start);
  return duration >= 0 && duration <= 365 * 86_400_000;
}
