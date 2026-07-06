import { ArrowLeft, Edit2, CalendarDays, Music, Video, Sparkles, Users, ExternalLink, Footprints } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/domain/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

function getYoutubeEmbedUrl(url: string | null) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DanceChartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canManageDanceCharts = can(teamContext.role, "dance_notes.manage");

  let chart = null;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    
    // Fetch the main dance note
    const { data: dbNote } = await supabase
      .from("dance_notes")
      .select("id, title, choreography_notes, formation_notes, outfit_notes, song_id, event_id, created_at, song_title, song_artist, song_version, video_url")
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (dbNote) {
      let songDetails = null;
      let eventDetails = null;

      if (dbNote.song_id) {
        const { data: dbSong } = await supabase
          .from("songs")
          .select("title, artist")
          .eq("id", dbNote.song_id)
          .maybeSingle();
        songDetails = dbSong;
      }

      if (dbNote.event_id) {
        const { data: dbEvent } = await supabase
          .from("events")
          .select("name, event_date")
          .eq("id", dbNote.event_id)
          .maybeSingle();
        eventDetails = dbEvent;
      }

      chart = {
        id: dbNote.id,
        title: dbNote.title,
        choreographyNotes: dbNote.choreography_notes ?? "",
        formationNotes: dbNote.formation_notes,
        outfitNotes: dbNote.outfit_notes,
        songTitle: songDetails?.title ?? dbNote.song_title ?? null,
        songArtist: songDetails?.artist ?? dbNote.song_artist ?? null,
        songVersion: dbNote.song_version ?? null,
        videoUrl: dbNote.video_url ?? null,
        eventName: eventDetails?.name ?? null,
        eventDate: eventDetails?.event_date ?? null,
        createdAt: dbNote.created_at,
      };
    }
  }

  if (!chart) {
    notFound();
  }

  const embedUrl = getYoutubeEmbedUrl(chart.videoUrl);

  return (
    <AppShell active="Dance Charts" teamContext={teamContext}>
      <div className="animate-fade-up text-left">
        {/* Navigation row */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dance"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-white transition"
          >
            <ArrowLeft className="size-3.5" />
            Back to Charts
          </Link>

          {canManageDanceCharts && (
            <Link
              href={`/dance/${chart.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] active:scale-[0.98]"
            >
              <Edit2 className="size-3.5" />
              Edit Chart
            </Link>
          )}
        </div>

        {/* Chart Header Details */}
        <div className="mb-6">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-200">Dance Ministry</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">
            {chart.songTitle || chart.title}
          </h1>
          {chart.songTitle && (
            <p className="mt-1 text-sm font-semibold text-zinc-400">({chart.title})</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-zinc-500">
            {chart.songArtist && <span>by {chart.songArtist}</span>}
            {chart.songArtist && <span className="text-zinc-700">·</span>}
            {chart.songVersion && <span className="text-violet-300/80">{chart.songVersion} Version</span>}
            {chart.songVersion && <span className="text-zinc-700">·</span>}
            <span>Added {formatDate(chart.createdAt)}</span>
          </div>

          {/* Badges row */}
          <div className="mt-4 flex flex-wrap gap-2">
            {chart.eventName ? (
              <Badge className="inline-flex items-center gap-1.5 text-xs py-1 px-3 bg-white/[0.04] text-zinc-300 border-white/[0.06] rounded-lg">
                <CalendarDays className="size-3.5 text-violet-400" />
                {chart.eventName}
              </Badge>
            ) : null}
            {chart.videoUrl ? (
              <Badge className="inline-flex items-center gap-1.5 text-xs py-1 px-3 bg-red-500/10 text-red-400 border-red-500/20 rounded-lg">
                <Video className="size-3.5" />
                Video Reference
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Layout details */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-6">
            {/* Steps details */}
            <Card className="p-6 border-white/[0.08] bg-[#111014]/60">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <Footprints className="size-5 text-violet-400" />
                <h3 className="text-lg font-bold text-white">Dance / Tambourine Steps</h3>
              </div>
              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-200">
                {chart.choreographyNotes}
              </p>
            </Card>

            {/* Video Reference */}
            {chart.videoUrl && (
              <Card className="p-6 border-white/[0.08] bg-[#111014]/60">
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                  <Video className="size-5 text-violet-400" />
                  <h3 className="text-lg font-bold text-white">Video Reference</h3>
                </div>
                {embedUrl ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 shadow-lg">
                    <iframe
                      src={embedUrl}
                      title={`YouTube video for ${chart.title}`}
                      className="absolute inset-0 h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={chart.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600/10 border border-red-500/20 px-4 py-2.5 text-xs font-bold text-red-400 hover:bg-red-600/20 transition-all"
                  >
                    <Video className="size-4" />
                    Open Video Link
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {/* Formation details */}
            {chart.formationNotes && (
              <Card className="p-6 border-white/[0.08] bg-[#111014]/60">
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                  <Users className="size-5 text-violet-400" />
                  <h3 className="text-lg font-bold text-white">Formation</h3>
                </div>
                <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-300">
                  {chart.formationNotes}
                </p>
              </Card>
            )}

            {/* Outfit details */}
            {chart.outfitNotes && (
              <Card className="p-6 border-white/[0.08] bg-[#111014]/60">
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                  <Sparkles className="size-5 text-violet-400" />
                  <h3 className="text-lg font-bold text-white">Outfit / Props</h3>
                </div>
                <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-300">
                  {chart.outfitNotes}
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
