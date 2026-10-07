import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

const analyticsSchema = z.object({
  mostPlayedSongs: z.array(z.object({ title: z.string(), count: z.number().int().nonnegative() })).max(10),
  attendanceStats: z.array(z.object({ type: z.string(), rate: z.number().min(0).max(100) })),
  mostActiveChannels: z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() })).max(5),
});

export async function loadTeamAnalytics(supabase: SupabaseClient<Database>, teamId: string) {
  const { data, error } = await supabase.rpc("get_team_analytics", { p_team_id: teamId });
  // An unapplied additive migration must not break an older deployment. Other
  // failures (including denied access) never trigger a broader fallback read.
  if (error?.code === "PGRST202" || error?.code === "42883") return loadLegacyAnalytics(supabase, teamId);
  if (error) throw new Error("Team analytics could not be loaded");
  return analyticsSchema.parse(data);
}

type TopSongRow = {
  song_id: string;
  songs: { title: string } | Array<{ title: string }> | null;
};

type EventAttendanceRow = {
  type: string | null;
  attendance: Array<{ status: string | null }>;
};

type RecentMessageRow = {
  channel_id: string;
  message_channels: { name: string } | Array<{ name: string }> | null;
};

async function loadLegacyAnalytics(supabase: SupabaseClient<Database>, teamId: string) {
  const [songResult, attendanceResult, messageResult] = await Promise.all([
    supabase.from("setlist_songs")
    .select(`
      song_id,
      songs(title),
      setlists!inner(team_id)
    `)
    .eq("setlists.team_id", teamId)
    .limit(1000),
    supabase.from("events")
    .select(`
      id,
      type,
      attendance(
        status
      )
    `)
    .eq("team_id", teamId),
    supabase.from("messages")
    .select(`
      channel_id,
      message_channels!inner(name, team_id)
    `)
    .eq("message_channels.team_id", teamId)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);
  const { data: topSongs, error: songsError } = songResult;
  const { data: eventsAndAttendance, error: attendanceError } = attendanceResult;
  const { data: recentMessages, error: messagesError } = messageResult;

  const songCounts: Record<string, { title: string; count: number }> = {};
  if (topSongs) {
    for (const row of topSongs as unknown as TopSongRow[]) {
      const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
      if (song?.title) {
        if (!songCounts[row.song_id]) {
          songCounts[row.song_id] = { title: song.title, count: 0 };
        }
        songCounts[row.song_id].count++;
      }
    }
  }
  const mostPlayedSongs = Object.values(songCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const eventTypeStats: Record<string, { type: string; total: number; confirmed: number }> = {};
  if (eventsAndAttendance) {
    for (const ev of eventsAndAttendance as unknown as EventAttendanceRow[]) {
      const type = ev.type || "sunday_service";
      if (!eventTypeStats[type]) {
        eventTypeStats[type] = { type, total: 0, confirmed: 0 };
      }

      const attendance = ev.attendance || [];
      eventTypeStats[type].total += attendance.length;
      eventTypeStats[type].confirmed += attendance.filter(
        (entry) => entry.status === "available",
      ).length;
    }
  }

  const attendanceStats = Object.values(eventTypeStats).map(stat => ({
    type: stat.type,
    rate: stat.total > 0 ? (stat.confirmed / stat.total) * 100 : 0
  }));

  const channelCounts: Record<string, { name: string; count: number }> = {};
  if (recentMessages) {
    for (const msg of recentMessages as unknown as RecentMessageRow[]) {
      const channel = Array.isArray(msg.message_channels)
        ? msg.message_channels[0]
        : msg.message_channels;
      if (channel?.name) {
        if (!channelCounts[msg.channel_id]) {
          channelCounts[msg.channel_id] = { name: channel.name, count: 0 };
        }
        channelCounts[msg.channel_id].count++;
      }
    }
  }
  const mostActiveChannels = Object.values(channelCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (songsError || attendanceError || messagesError) throw new Error("Team analytics could not be loaded");
  return { mostPlayedSongs, attendanceStats, mostActiveChannels };
}
