import { CalendarDays, Footprints } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DanceChartForm, type DanceChartOption } from "@/components/dance-chart-form";
import { DanceLibraryList } from "@/components/dance-library-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/domain/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

type DanceChart = {
  id: string;
  title: string;
  choreographyNotes: string;
  formationNotes: string | null;
  outfitNotes: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songVersion: string | null;
  videoUrl: string | null;
  eventName: string | null;
  eventDate: string | null;
  createdAt: string;
};

type SongRow = {
  id: string;
  title: string;
  artist: string;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string;
};

type DanceNoteRow = {
  id: string;
  title: string;
  choreography_notes: string | null;
  formation_notes: string | null;
  outfit_notes: string | null;
  song_id: string | null;
  event_id: string | null;
  created_at: string;
  song_title: string | null;
  song_artist: string | null;
  song_version: string | null;
  video_url: string | null;
};



export default async function DanceChartsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const teamContext = await getRequiredTeamContext();
  const canManageDanceCharts = can(teamContext.role, "dance_notes.manage");
  const showForm = isNew === "true" && canManageDanceCharts;

  let charts: DanceChart[] = [];
  let songOptions: DanceChartOption[] = [];
  let eventOptions: DanceChartOption[] = [];

  if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();
    const [notesResult, songsResult, eventsResult] = await Promise.all([
      supabase
        .from("dance_notes")
        .select("id, title, choreography_notes, formation_notes, outfit_notes, song_id, event_id, created_at, song_title, song_artist, song_version, video_url")
        .eq("team_id", teamContext.teamId)
        .order("created_at", { ascending: false }),
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

    const songs = (songsResult.data ?? []) as SongRow[];
    const events = (eventsResult.data ?? []) as EventRow[];
    const songById = new Map(songs.map((song) => [song.id, song]));
    const eventById = new Map(events.map((event) => [event.id, event]));

    songOptions = songs.map((song) => ({ id: song.id, label: `${song.title} - ${song.artist}` }));
    eventOptions = events.map((event) => ({ id: event.id, label: `${event.name} - ${formatDate(event.event_date)}` }));

    charts = ((notesResult.data ?? []) as DanceNoteRow[]).map((note) => {
      const song = note.song_id ? songById.get(note.song_id) : null;
      const event = note.event_id ? eventById.get(note.event_id) : null;

      return {
        id: note.id,
        title: note.title,
        choreographyNotes: note.choreography_notes ?? "",
        formationNotes: note.formation_notes,
        outfitNotes: note.outfit_notes,
        songTitle: song?.title ?? note.song_title ?? null,
        songArtist: song?.artist ?? note.song_artist ?? null,
        songVersion: note.song_version ?? null,
        videoUrl: note.video_url ?? null,
        eventName: event?.name ?? null,
        eventDate: event?.event_date ?? null,
        createdAt: note.created_at,
      };
    });
  }

  return (
    <AppShell active="Dance Charts" teamContext={teamContext}>
      <div className="animate-fade-up text-left">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-200">Dance Ministry</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              {showForm ? "New Dance Chart" : "Dance Charts"}
            </h1>
            <p className="mt-2 text-sm font-semibold text-zinc-400">
              {showForm ? "Create a choreography chart linked to songs or events." : "Choreography, formation, and tambourine notes for the team."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-300">
              <Footprints className="size-4 text-violet-300" />
              {charts.length} {charts.length === 1 ? "chart" : "charts"}
            </div>
            {canManageDanceCharts && (
              showForm ? (
                <Link
                  href="/dance"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  Back to Charts
                </Link>
              ) : (
                <Link
                  href="/dance?new=true"
                  className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] active:scale-[0.98]"
                >
                  + Add Dance Chart
                </Link>
              )
            )}
          </div>
        </div>
      </div>

      <div className="mt-7 text-left">
        {showForm ? (
          <div className="max-w-2xl mx-auto">
            <DanceChartForm songs={songOptions} events={eventOptions} />
          </div>
        ) : (
          <DanceLibraryList charts={charts} canManage={canManageDanceCharts} />
        )}
      </div>
    </AppShell>
  );
}

function DanceNoteBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-200">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-300">{body}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
