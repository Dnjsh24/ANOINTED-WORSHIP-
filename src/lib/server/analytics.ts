import {
  activityDescription,
  addAnalyticsDays,
  analyticsDayTimestamp,
  summarizeAvailability,
  summarizeChannelVolume,
  summarizeSongUsage,
  type AnalyticsData,
  type AnalyticsRange,
  type AnalyticsSource,
  type AnalyticsTotal,
} from "@/lib/domain/analytics";
import { songs as demoSongs } from "@/lib/sample-data";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

const PAGE_SIZE = 500;
const TOTALS = [
  { id: "songs", label: "Songs", href: "/songs" },
  { id: "setlists", label: "Setlists", href: "/setlists" },
  { id: "events", label: "Approved events", href: "/events" },
  { id: "members", label: "Active members", href: "/members" },
  { id: "channels", label: "Message channels", href: "/messages" },
  { id: "announcements", label: "Announcements", href: "/announcements" },
  { id: "dance", label: "Dance charts", href: "/dance" },
  { id: "requests", label: "Pending join requests", href: "/members/requests" },
];

async function allRows<T extends { id: string }>(
  fetchPage: (cursor: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  while (true) {
    const result = await fetchPage(cursor);
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Analytics query returned no result.");
    rows.push(...result.data);
    const last = result.data.at(-1);
    if (!last || result.data.length < PAGE_SIZE) return rows;
    if (last.id === cursor) throw new Error("Analytics pagination did not advance.");
    cursor = last.id;
  }
}

async function loadSource<T>(label: string, read: () => Promise<T>): Promise<AnalyticsSource<T>> {
  try {
    return { status: "ready", data: await read() };
  } catch (error) {
    console.warn(`Analytics ${label} unavailable`, safeErrorDetails(error));
    return { status: "unavailable", message: `${label} could not be loaded. Try again.` };
  }
}

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Reads only the caller's authenticated, RLS-visible team data. The route owns its owner/admin guard. */
export async function loadAnalytics(teamId: string, range: AnalyticsRange, now = new Date()): Promise<AnalyticsData> {
  const supabase = await createClient();
  const since = analyticsDayTimestamp(range.previousStart);
  const until = new Date(Math.min(
    Date.parse(analyticsDayTimestamp(addAnalyticsDays(range.end, 1))), now.getTime(),
  )).toISOString();

  const [songs, availability, messages, activity, totals] = await Promise.all([
    loadSource("Song usage", async () => {
      const rows = await allRows((cursor) => {
        const query = supabase.from("setlist_songs")
          .select("id,song_id,songs!inner(title,deleted_at),setlists!inner(team_id,setlist_date,deleted_at)")
          .eq("setlists.team_id", teamId)
          .is("deleted_at", null).is("setlists.deleted_at", null).is("songs.deleted_at", null)
          .gte("setlists.setlist_date", range.previousStart).lte("setlists.setlist_date", range.end)
          .order("id", { ascending: true }).limit(PAGE_SIZE);
        return cursor ? query.gt("id", cursor) : query;
      });
      return summarizeSongUsage(rows.flatMap((row) => {
        const song = relation(row.songs);
        const setlist = relation(row.setlists);
        return song && setlist ? [{ songId: row.song_id, title: song.title, date: setlist.setlist_date }] : [];
      }), range);
    }),
    loadSource("Availability", async () => {
      const [events, responses] = await Promise.all([
        allRows((cursor) => {
          const query = supabase.from("events").select("id,type,event_date")
            .eq("team_id", teamId).eq("approval_status", "approved").is("deleted_at", null)
            .gte("event_date", range.previousStart).lte("event_date", range.end).lt("event_date", range.today)
            .order("id", { ascending: true }).limit(PAGE_SIZE);
          return cursor ? query.gt("id", cursor) : query;
        }),
        allRows((cursor) => {
          const query = supabase.from("attendance")
            .select("id,event_id,status,events!inner(team_id,event_date,approval_status,deleted_at)")
            .eq("events.team_id", teamId).eq("events.approval_status", "approved").is("events.deleted_at", null)
            .gte("events.event_date", range.previousStart).lte("events.event_date", range.end)
            .lt("events.event_date", range.today)
            .order("id", { ascending: true }).limit(PAGE_SIZE);
          return cursor ? query.gt("id", cursor) : query;
        }),
      ]);
      return summarizeAvailability(
        events.map((event) => ({ id: event.id, date: event.event_date, type: event.type })),
        responses.map((response) => ({ eventId: response.event_id, status: response.status })),
        range,
      );
    }),
    loadSource("Message volume", async () => {
      const rows = await allRows((cursor) => {
        const query = supabase.from("messages")
          .select("id,channel_id,created_at,scheduled_for,message_channels!inner(name,team_id)")
          .eq("message_channels.team_id", teamId).eq("is_delivered", true)
          .or(`and(scheduled_for.gte.${since},scheduled_for.lt.${until}),and(scheduled_for.is.null,created_at.gte.${since},created_at.lt.${until})`)
          .order("id", { ascending: true }).limit(PAGE_SIZE);
        return cursor ? query.gt("id", cursor) : query;
      });
      return summarizeChannelVolume(rows.flatMap((row) => {
        const channel = relation(row.message_channels);
        return channel ? [{ channelId: row.channel_id, name: channel.name, publishedAt: row.scheduled_for ?? row.created_at }] : [];
      }), range);
    }),
    loadSource("Recent activity", async () => {
      const result = await supabase.from("activity_logs")
        .select("id,action,target_type,details,created_at,profile:profiles(full_name)")
        .eq("team_id", teamId).gte("created_at", analyticsDayTimestamp(range.start)).lt("created_at", until)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Activity query returned no result.");
      return result.data.map((log) => ({
        id: log.id, createdAt: log.created_at,
        category: log.target_type.replaceAll("_", " ").slice(0, 80) || "team",
        description: activityDescription(log.action, log.target_type, log.details),
        actor: relation(log.profile)?.full_name || "Team member",
      }));
    }),
    (async (): Promise<AnalyticsTotal[]> => {
      const results = await Promise.allSettled([
        supabase.from("songs").select("id", { count: "exact", head: true }).eq("team_id", teamId).is("deleted_at", null),
        supabase.from("setlists").select("id", { count: "exact", head: true }).eq("team_id", teamId).is("deleted_at", null),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("team_id", teamId).is("deleted_at", null).eq("approval_status", "approved"),
        supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "active"),
        supabase.from("message_channels").select("id", { count: "exact", head: true }).eq("team_id", teamId),
        supabase.from("announcements").select("id", { count: "exact", head: true }).eq("team_id", teamId),
        supabase.from("dance_notes").select("id", { count: "exact", head: true }).eq("team_id", teamId),
        supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "pending"),
      ]);
      return TOTALS.map((total, index) => {
        const result = results[index];
        const value = result?.status === "fulfilled" && !result.value.error ? result.value.count : null;
        if (value === null || value === undefined) {
          const error = result?.status === "rejected" ? result.reason : result?.value.error;
          console.warn(`Analytics ${total.label} count unavailable`, safeErrorDetails(error));
        }
        return { ...total, value: value ?? null, message: value == null ? `${total.label} could not be counted. Try again.` : null };
      });
    })(),
  ]);
  return { mode: "live", range, songs, availability, messages, activity, totals };
}

/** Explicit illustration for the unconfigured demo workspace, never a fallback for failed live queries. */
export function createDemoAnalytics(range: AnalyticsRange): AnalyticsData {
  const events: Array<{ id: string; date: string; type: Enums<"event_type"> }> = [];
  const responses: Array<{ eventId: string; status: Enums<"attendance_status"> }> = [];
  const placements: Array<{ songId: string; title: string; date: string }> = [];
  const messages: Array<{ channelId: string; name: string; publishedAt: string }> = [];
  for (const [periodIndex, start] of [range.previousStart, range.start].entries()) {
    for (let offset = 0; offset < range.days; offset += 7) {
      const date = addAnalyticsDays(start, offset);
      const id = `demo-event-${periodIndex}-${offset}`;
      events.push({ id, date, type: offset % 14 === 0 ? "service" : "rehearsal" });
      for (let member = 0; member < 10; member++) {
        responses.push({ eventId: id, status: member < 6 + periodIndex + offset % 3 ? "available" : member === 9 ? "pending" : "unavailable" });
      }
      for (const [index, song] of demoSongs.entries()) {
        for (let use = 0; use < Math.max(1, 4 - index); use++) placements.push({ songId: song.id, title: song.title, date });
      }
      for (let message = 0; message < 12 + periodIndex * 2; message++) {
        const isTeam = message % 3 !== 0;
        messages.push({ channelId: isTeam ? "demo-team" : "demo-announcements", name: isTeam ? "Worship Team" : "Announcements", publishedAt: analyticsDayTimestamp(date) });
      }
    }
  }
  const currentActivities = events.filter((event) => event.date >= range.start && event.date <= range.end);
  const activity = currentActivities.slice(-5).reverse().map((event) => ({
    id: `activity-${event.id}`, createdAt: analyticsDayTimestamp(event.date), category: "setlist",
    description: "Created setlist: Sunday Worship", actor: "Demo member",
  }));
  const totalValues = [demoSongs.length, 120, 120, 10, 2, 3, 2, 1];
  return {
    mode: "demo", range,
    songs: { status: "ready", data: summarizeSongUsage(placements, range) },
    availability: { status: "ready", data: summarizeAvailability(events, responses, range) },
    messages: { status: "ready", data: summarizeChannelVolume(messages, range) },
    activity: { status: "ready", data: activity },
    totals: TOTALS.map((total, index) => ({ ...total, value: totalValues[index] ?? 0, message: null })),
  };
}
