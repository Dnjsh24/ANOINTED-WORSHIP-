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
import { safeErrorDetails } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 500;
const MAX_SOURCE_ROWS = 50000;
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
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  while (true) {
    signal?.throwIfAborted();
    const result = await fetchPage(cursor);
    signal?.throwIfAborted();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Analytics query returned no result.");
    let previous = cursor;
    for (const row of result.data) {
      if (!row.id || previous !== null && row.id <= previous) throw new Error("Analytics pagination did not advance in unique ID order.");
      previous = row.id;
    }
    if (result.data.length > PAGE_SIZE || rows.length + result.data.length > MAX_SOURCE_ROWS) throw new Error("Analytics source exceeds the complete-read limit.");
    rows.push(...result.data);
    const last = result.data.at(-1);
    // PostgREST can cap a page below the requested limit. Only an empty page proves completion.
    if (!last) return rows;
    cursor = last.id;
  }
}

async function loadSource<T>(label: string, read: () => Promise<T>, signal?: AbortSignal): Promise<AnalyticsSource<T>> {
  try {
    return { status: "ready", data: await read() };
  } catch (error) {
    signal?.throwIfAborted();
    console.warn(`Analytics ${label} unavailable`, safeErrorDetails(error));
    return { status: "unavailable", message: `${label} could not be loaded. Try again.` };
  }
}

function relation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value) && value.length !== 1) throw new Error("Analytics relationship could not be verified.");
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Reads only the caller's authenticated, RLS-visible team data. The route owns its owner/admin guard. */
export async function loadAnalytics(teamId: string, range: AnalyticsRange, now = new Date(), options: { client?: SupabaseClient<Database>; signal?: AbortSignal } = {}): Promise<AnalyticsData> {
  const { signal } = options;
  signal?.throwIfAborted();
  const supabase = options.client ?? await createClient();
  const execute = <T extends { abortSignal(signal: AbortSignal): T }>(query: T): T => signal ? query.abortSignal(signal) : query;
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
        return execute(cursor ? query.gt("id", cursor) : query);
      }, signal);
      return summarizeSongUsage(rows.map((row) => {
        const song = relation(row.songs);
        const setlist = relation(row.setlists);
        if (!song || !setlist || setlist.team_id !== teamId) throw new Error("Analytics song placement relationship could not be verified.");
        return { songId: row.song_id, title: song.title, date: setlist.setlist_date };
      }), range);
    }, signal),
    loadSource("Availability", async () => {
      const [events, responses] = await Promise.all([
        allRows((cursor) => {
          const query = supabase.from("events").select("id,type,event_date")
            .eq("team_id", teamId).eq("approval_status", "approved").is("deleted_at", null)
            .gte("event_date", range.previousStart).lte("event_date", range.end).lt("event_date", range.today)
            .order("id", { ascending: true }).limit(PAGE_SIZE);
          return execute(cursor ? query.gt("id", cursor) : query);
        }, signal),
        allRows((cursor) => {
          const query = supabase.from("attendance")
            .select("id,event_id,status,events!inner(team_id,event_date,approval_status,deleted_at)")
            .eq("events.team_id", teamId).eq("events.approval_status", "approved").is("events.deleted_at", null)
            .gte("events.event_date", range.previousStart).lte("events.event_date", range.end)
            .lt("events.event_date", range.today)
            .order("id", { ascending: true }).limit(PAGE_SIZE);
          return execute(cursor ? query.gt("id", cursor) : query);
        }, signal),
      ]);
      return summarizeAvailability(
        events.map((event) => ({ id: event.id, date: event.event_date, type: event.type })),
        responses.map((response) => ({ eventId: response.event_id, status: response.status })),
        range,
      );
    }, signal),
    loadSource("Message volume", async () => {
      const rows = await allRows((cursor) => {
        const query = supabase.from("messages")
          .select("id,channel_id,created_at,scheduled_for,message_channels!inner(name,team_id)")
          .eq("message_channels.team_id", teamId).eq("is_delivered", true)
          .or(`and(scheduled_for.gte.${since},scheduled_for.lt.${until}),and(scheduled_for.is.null,created_at.gte.${since},created_at.lt.${until})`)
          .order("id", { ascending: true }).limit(PAGE_SIZE);
        return execute(cursor ? query.gt("id", cursor) : query);
      }, signal);
      return summarizeChannelVolume(rows.map((row) => {
        const channel = relation(row.message_channels);
        if (!channel || channel.team_id !== teamId) throw new Error("Analytics message channel relationship could not be verified.");
        return { channelId: row.channel_id, name: channel.name, publishedAt: row.scheduled_for ?? row.created_at };
      }), range);
    }, signal),
    loadSource("Recent activity", async () => {
      const readPage = (cursor: { id: string; createdAt: string } | null, limit: number) => {
        const query = supabase.from("activity_logs")
          .select("id,action,target_type,details,created_at,profile:profiles(full_name)")
          .eq("team_id", teamId).gte("created_at", analyticsDayTimestamp(range.start)).lt("created_at", until)
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
        return execute(cursor ? query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`) : query);
      };
      const rows: NonNullable<Awaited<ReturnType<typeof readPage>>['data']> = [];
      let cursor: { id: string; createdAt: string } | null = null;
      while (rows.length < 50) {
        signal?.throwIfAborted();
        const result = await readPage(cursor, 50 - rows.length);
        signal?.throwIfAborted();
        if (result.error) throw result.error;
        if (!result.data || result.data.length > 50 - rows.length) throw new Error("Activity query returned no complete result.");
        if (!result.data.length) break;
        for (const log of result.data) {
          // Both values enter a PostgREST filter on the next page; accept only canonical database scalars.
          if (!/^[a-zA-Z0-9-]+$/.test(log.id) || !Number.isFinite(Date.parse(log.created_at))) throw new Error("Invalid activity cursor.");
          const createdAt = new Date(log.created_at).toISOString();
          if (cursor && (createdAt > cursor.createdAt || createdAt === cursor.createdAt && log.id >= cursor.id)) throw new Error("Activity pagination did not advance.");
          cursor = { id: log.id, createdAt };
        }
        rows.push(...result.data);
      }
      return rows.map((log) => ({
        id: log.id, createdAt: log.created_at,
        category: log.target_type.replaceAll("_", " ").slice(0, 80) || "team",
        description: activityDescription(log.action, log.target_type, log.details),
        actor: relation(log.profile)?.full_name || "Team member",
      }));
    }, signal),
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
      ].map(query => execute(query)));
      signal?.throwIfAborted();
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
  signal?.throwIfAborted();
  return { mode: "live", range, songs, availability, messages, activity, totals };
}


