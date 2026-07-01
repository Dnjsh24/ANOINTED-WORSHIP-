import { AppShell } from "@/components/app-shell";
import { SetlistsClient } from "@/components/setlists-client";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import type { Setlist } from "@/lib/types";

export default async function SetlistsPage() {
  const teamContext = await getCurrentTeamContext();
  let setlistsList: Setlist[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // 1. Fetch setlists for this team
    const { data: dbSetlists } = (await supabase
      .from("setlists")
      .select("*, leader:team_members(*)")
      .eq("team_id", teamContext.teamId)
      .order("setlist_date", { ascending: false })) as any;

    // 2. Fetch profile names of the leaders
    const leaderProfileIds = (dbSetlists ?? [])
      .map((s: any) => s.leader?.profile_id)
      .filter(Boolean);

    let leaderProfilesMap: Record<string, string> = {};
    if (leaderProfileIds.length > 0) {
      const { data: profiles } = (await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", leaderProfileIds)) as any;
      if (profiles) {
        leaderProfilesMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.full_name || ""]));
      }
    }

    // 3. Fetch setlist songs
    const setlistIds = (dbSetlists ?? []).map((s: any) => s.id);
    let songsMap: Record<string, any[]> = {};
    if (setlistIds.length > 0) {
      const { data: dbSongs } = (await supabase
        .from("setlist_songs")
        .select("*, song:songs(*)")
        .in("setlist_id", setlistIds)
        .order("song_order", { ascending: true })) as any;

      if (dbSongs) {
        dbSongs.forEach((ss: any) => {
          if (!songsMap[ss.setlist_id]) {
            songsMap[ss.setlist_id] = [];
          }
          songsMap[ss.setlist_id].push({
            id: ss.id,
            assignedKey: ss.assigned_key,
            order: ss.song_order,
            song: {
              id: ss.song?.id,
              title: ss.song?.title || "Unknown Song",
              bpm: ss.song?.bpm || 70,
            },
          });
        });
      }
    }

    setlistsList = (dbSetlists ?? []).map((s: any) => {
      const leaderProfileId = s.leader?.profile_id;
      const leaderName = leaderProfileId ? leaderProfilesMap[leaderProfileId] : "Worship Leader";
      return {
        id: s.id,
        name: s.name,
        date: s.setlist_date,
        leader: leaderName || "Worship Leader",
        location: s.location ?? "Main Sanctuary",
        callTime: s.call_time?.slice(0, 5) || "09:00",
        rehearsalTime: s.rehearsal_time?.slice(0, 5) || "08:00",
        serviceTimes: s.service_times || ["Sunday Worship"],
        songs: songsMap[s.id] || [],
      };
    });
  }

  // Fallback to sample data if Supabase is not configured or empty
  if (setlistsList.length === 0) {
    setlistsList = sampleSetlists;
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <SetlistsClient setlists={setlistsList} />
    </AppShell>
  );
}
