import { AppShell } from "@/components/app-shell";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
  const teamContext = await getRequiredTeamContext();
  const isAdminOrOwner = teamContext.role === "admin" || teamContext.role === "owner";
  if (!isAdminOrOwner) {
    redirect("/dashboard");
  }
  const supabase = await createClient();

  // 1. Most played songs (Top 10)
  const { data: topSongs } = await supabase
    .from("setlist_songs")
    .select(`
      song_id,
      songs(title)
    `)
    .limit(1000); // we aggregate in JS since group by is complex via postgrest

  const songCounts: Record<string, { title: string, count: number }> = {};
  if (topSongs) {
    for (const row of topSongs as any) {
      if (row.songs?.title) {
        if (!songCounts[row.song_id]) {
          songCounts[row.song_id] = { title: row.songs.title, count: 0 };
        }
        songCounts[row.song_id].count++;
      }
    }
  }
  const mostPlayedSongs = Object.values(songCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 2. Attendance by event type
  const { data: eventsAndAttendance } = await supabase
    .from("events")
    .select(`
      id,
      type,
      event_assignments(
        status
      )
    `)
    .eq("team_id", teamContext.teamId);

  const eventTypeStats: Record<string, { type: string, total: number, confirmed: number }> = {};
  if (eventsAndAttendance) {
    for (const ev of eventsAndAttendance as any) {
      const type = ev.type || "sunday_service";
      if (!eventTypeStats[type]) {
         eventTypeStats[type] = { type, total: 0, confirmed: 0 };
      }
      
      const assignments = ev.event_assignments || [];
      eventTypeStats[type].total += assignments.length;
      eventTypeStats[type].confirmed += assignments.filter((a: any) => a.status === "available").length;
    }
  }
  
  const attendanceStats = Object.values(eventTypeStats).map(stat => ({
    type: stat.type,
    rate: stat.total > 0 ? (stat.confirmed / stat.total) * 100 : 0
  }));

  // 3. Most active channels
  const { data: recentMessages } = await supabase
    .from("messages")
    .select(`
      channel_id,
      channels(name)
    `)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const channelCounts: Record<string, { name: string, count: number }> = {};
  if (recentMessages) {
    for (const msg of recentMessages as any) {
      if (msg.channels?.name) {
        if (!channelCounts[msg.channel_id]) {
          channelCounts[msg.channel_id] = { name: msg.channels.name, count: 0 };
        }
        channelCounts[msg.channel_id].count++;
      }
    }
  }
  const mostActiveChannels = Object.values(channelCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <AppShell active="analytics">
      <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-4 md:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div>
             <h1 className="text-3xl font-bold tracking-tight text-white">Team Engagement</h1>
             <p className="text-sm text-zinc-400 mt-1">Analytics and insights for {teamContext.teamId}</p>
          </div>
          
          <AnalyticsDashboard 
            mostPlayedSongs={mostPlayedSongs}
            attendanceStats={attendanceStats}
            mostActiveChannels={mostActiveChannels}
          />
        </div>
      </div>
    </AppShell>
  );
}
