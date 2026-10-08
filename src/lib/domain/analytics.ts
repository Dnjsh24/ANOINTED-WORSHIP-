import { getEventTypeLabel } from "@/lib/domain/event-types";
import type { Enums, Json } from "@/lib/supabase/database.types";

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const ANALYTICS_MIN_DATE = "1970-01-01";

export type AnalyticsRange = {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  days: number;
  today: string;
  timeZone: "Asia/Manila";
  notice: string | null;
};

export type AnalyticsSource<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable"; message: string };

export type SongUsage = { id: string; title: string; count: number; previousCount: number };
export type ChannelVolume = { id: string; name: string; count: number; previousCount: number };
export type AvailabilitySummary = {
  available: number;
  total: number;
  rate: number | null;
  eventCount: number;
};
export type EventAvailability = AvailabilitySummary & { type: Enums<"event_type">; label: string };
export type AvailabilityDay = AvailabilitySummary & { date: string };
export type AvailabilityAnalytics = {
  current: AvailabilitySummary;
  previous: AvailabilitySummary;
  byEventType: EventAvailability[];
  daily: AvailabilityDay[];
};
export type ActivityItem = {
  id: string;
  createdAt: string;
  category: string;
  description: string;
  actor: string;
};
export type AnalyticsTotal = {
  id: string;
  label: string;
  href: string;
  value: number | null;
  message: string | null;
};
export type AnalyticsData = {
  mode: "live" | "demo";
  range: AnalyticsRange;
  songs: AnalyticsSource<SongUsage[]>;
  availability: AnalyticsSource<AvailabilityAnalytics>;
  messages: AnalyticsSource<ChannelVolume[]>;
  activity: AnalyticsSource<ActivityItem[]>;
  totals: AnalyticsTotal[];
};

export function addAnalyticsDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function analyticsDayTimestamp(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - MANILA_OFFSET_MS).toISOString();
}

export function analyticsToday(now = new Date()) {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < ANALYTICS_MIN_DATE) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseAnalyticsRange(
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
): AnalyticsRange {
  const today = analyticsToday(now);
  const fallbackStart = addAnalyticsDays(today, -29);
  let start = fallbackStart;
  let end = today;
  let notice: string | null = null;
  if (params.start !== undefined || params.end !== undefined) {
    if (
      typeof params.start !== "string" || typeof params.end !== "string" ||
      !validDate(params.start) || !validDate(params.end) || params.start > params.end ||
      params.start > today
    ) {
      notice = "Choose valid dates from 1970 onward. Showing the last 30 days instead.";
    } else {
      const selectedEnd = params.end > today ? today : params.end;
      const days = (Date.parse(selectedEnd) - Date.parse(params.start)) / DAY_MS + 1;
      if (days > 365) {
        notice = "Choose a range of 365 days or fewer. Showing the last 30 days instead.";
      } else {
        start = params.start;
        end = selectedEnd;
        if (params.end > today) notice = "Future dates are excluded. The range now ends today.";
      }
    }
  }
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
  return {
    start, end, days, today, timeZone: "Asia/Manila", notice,
    previousStart: addAnalyticsDays(start, -days),
    previousEnd: addAnalyticsDays(start, -1),
  };
}

function inCurrentPeriod(date: string, range: AnalyticsRange) {
  return date >= range.start && date <= range.end;
}

export function summarizeSongUsage(
  placements: Array<{ songId: string; title: string; date: string }>,
  range: AnalyticsRange,
): SongUsage[] {
  const songs = new Map<string, SongUsage>();
  for (const placement of placements) {
    if (placement.date < range.previousStart || placement.date > range.end) continue;
    const song = songs.get(placement.songId) ?? {
      id: placement.songId, title: placement.title, count: 0, previousCount: 0,
    };
    if (inCurrentPeriod(placement.date, range)) song.count++;
    else song.previousCount++;
    songs.set(song.id, song);
  }
  return [...songs.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export function summarizeChannelVolume(
  messages: Array<{ channelId: string; name: string; publishedAt: string }>,
  range: AnalyticsRange,
): ChannelVolume[] {
  const channels = new Map<string, ChannelVolume>();
  for (const message of messages) {
    const date = analyticsToday(new Date(message.publishedAt));
    if (date < range.previousStart || date > range.end) continue;
    const channel = channels.get(message.channelId) ?? {
      id: message.channelId, name: message.name, count: 0, previousCount: 0,
    };
    if (inCurrentPeriod(date, range)) channel.count++;
    else channel.previousCount++;
    channels.set(channel.id, channel);
  }
  return [...channels.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

type AvailabilityEvent = { id: string; date: string; type: Enums<"event_type"> };
type AvailabilityResponse = { eventId: string; status: Enums<"attendance_status"> };

function availabilitySummary(events: AvailabilityEvent[], counts: Map<string, { available: number; total: number }>): AvailabilitySummary {
  let available = 0;
  let total = 0;
  for (const event of events) {
    available += counts.get(event.id)?.available ?? 0;
    total += counts.get(event.id)?.total ?? 0;
  }
  return {
    available, total, eventCount: events.length,
    rate: total > 0 ? available / total * 100 : null,
  };
}

export function summarizeAvailability(
  events: AvailabilityEvent[],
  responses: AvailabilityResponse[],
  range: AnalyticsRange,
): AvailabilityAnalytics {
  const counts = new Map<string, { available: number; total: number }>();
  for (const response of responses) {
    const count = counts.get(response.eventId) ?? { available: 0, total: 0 };
    count.total++;
    if (response.status === "available") count.available++;
    counts.set(response.eventId, count);
  }
  const historical = events.filter((event) =>
    event.date >= range.previousStart && event.date <= range.end && event.date < range.today,
  );
  const current = historical.filter((event) => inCurrentPeriod(event.date, range));
  const previous = historical.filter((event) => event.date < range.start);
  const types = [...new Set(current.map((event) => event.type))];
  const eventsByDate = new Map<string, AvailabilityEvent[]>();
  for (const event of historical) {
    const dated = eventsByDate.get(event.date) ?? [];
    dated.push(event);
    eventsByDate.set(event.date, dated);
  }
  const daily: AvailabilityDay[] = [];
  for (let date = range.previousStart; date <= range.end; date = addAnalyticsDays(date, 1)) {
    daily.push({ date, ...availabilitySummary(eventsByDate.get(date) ?? [], counts) });
  }
  return {
    current: availabilitySummary(current, counts),
    previous: availabilitySummary(previous, counts),
    byEventType: types.map((type) => ({
      type, label: getEventTypeLabel(type),
      ...availabilitySummary(current.filter((event) => event.type === type), counts),
    })),
    daily,
  };
}

export type AvailabilityTrendPoint = {
  label: string;
  currentDate: string;
  previousDate: string;
  currentRate: number | null;
  previousRate: number | null;
  currentTotal: number;
  previousTotal: number;
};

export function buildAvailabilityTrend(
  availability: AvailabilityAnalytics,
  range: AnalyticsRange,
  mode: "daily" | "weekly",
): AvailabilityTrendPoint[] {
  const days = new Map(availability.daily.map((day) => [day.date, day]));
  const size = mode === "weekly" ? 7 : 1;
  const result: AvailabilityTrendPoint[] = [];
  for (let offset = 0; offset < range.days; offset += size) {
    const currentDate = addAnalyticsDays(range.start, offset);
    const previousDate = addAnalyticsDays(range.previousStart, offset);
    let currentAvailable = 0;
    let currentTotal = 0;
    let previousAvailable = 0;
    let previousTotal = 0;
    for (let step = 0; step < Math.min(size, range.days - offset); step++) {
      const current = days.get(addAnalyticsDays(currentDate, step));
      const previous = days.get(addAnalyticsDays(previousDate, step));
      currentAvailable += current?.available ?? 0;
      currentTotal += current?.total ?? 0;
      previousAvailable += previous?.available ?? 0;
      previousTotal += previous?.total ?? 0;
    }
    result.push({
      label: new Date(`${currentDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      currentDate, previousDate, currentTotal, previousTotal,
      currentRate: currentTotal > 0 ? currentAvailable / currentTotal * 100 : null,
      previousRate: previousTotal > 0 ? previousAvailable / previousTotal * 100 : null,
    });
  }
  return result;
}

export function activityDescription(action: string, targetType: string, details: Json | null) {
  let title = "";
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const candidate = typeof details.title === "string" ? details.title : details.name;
    if (typeof candidate === "string") title = candidate.trim().slice(0, 200);
  }
  const category = targetType.replaceAll("_", " ").slice(0, 80) || "team activity";
  const verb = action.replaceAll("_", " ").slice(0, 80) || "updated";
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${category}${title ? `: ${title}` : ""}`;
}
