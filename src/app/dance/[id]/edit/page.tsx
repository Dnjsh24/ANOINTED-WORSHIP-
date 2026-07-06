import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DanceChartForm, type DanceChartOption } from "@/components/dance-chart-form";
import { can } from "@/lib/domain/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function EditDanceChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (!can(teamContext.role, "dance_notes.manage")) {
    redirect(`/dance/${id}`);
  }

  let chart = null;
  let songOptions: DanceChartOption[] = [];
  let eventOptions: DanceChartOption[] = [];

  if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();

    const [noteResult, songsResult, eventsResult] = await Promise.all([
      supabase
        .from("dance_notes")
        .select("*")
        .eq("id", id)
        .eq("team_id", teamContext.teamId)
        .maybeSingle(),
      supabase
        .from("songs")
        .select("id, title, artist")
        .eq("team_id", teamContext.teamId)
        .order("title", { ascending: true }),
      supabase
        .from("events")
        .select("id, name, event_date")
        .eq("team_id", teamContext.teamId)
        .order("event_date", { ascending: true }),
    ]);

    const dbNote = noteResult.data;
    if (dbNote) {
      chart = {
        id: dbNote.id,
        title: dbNote.title,
        songId: dbNote.song_id ?? "",
        eventId: dbNote.event_id ?? "",
        choreographyNotes: dbNote.choreography_notes ?? "",
        formationNotes: dbNote.formation_notes ?? "",
        outfitNotes: dbNote.outfit_notes ?? "",
        songTitle: dbNote.song_title ?? "",
        songArtist: dbNote.song_artist ?? "",
        songVersion: dbNote.song_version ?? "",
        videoUrl: dbNote.video_url ?? "",
      };
    }

    songOptions = (songsResult.data ?? []).map((song) => ({
      id: song.id,
      label: `${song.title} - ${song.artist}`,
    }));

    eventOptions = (eventsResult.data ?? []).map((event) => ({
      id: event.id,
      label: `${event.name} - ${formatDate(event.event_date)}`,
    }));
  }

  if (!chart) {
    notFound();
  }

  return (
    <AppShell active="Dance Charts" teamContext={teamContext}>
      <div className="mb-6 text-left">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Dance Ministry</p>
        <h1 className="mt-2 text-4xl font-bold">Edit Dance Chart</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">{chart.songTitle || chart.title}</p>
      </div>
      
      <div className="max-w-4xl text-left">
        <DanceChartForm songs={songOptions} events={eventOptions} chart={chart} />
      </div>
    </AppShell>
  );
}
