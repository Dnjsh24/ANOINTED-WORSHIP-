import { notFound, redirect } from "next/navigation";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import { claimCloudRemotePairing } from "@/app/presenter/remote-pairing-actions";
import RemoteClient from "./remote-client";

type RemotePresentationSettings = {
  linesPerSlide?: number;
  draftLyricsBySetlistSongId?: Record<string, string>;
};

function normalizeRemotePresentationSettings(value: unknown): RemotePresentationSettings | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

  const settings = value as Record<string, unknown>;
  const normalized: RemotePresentationSettings = {};
  if (typeof settings.linesPerSlide === "number" && Number.isFinite(settings.linesPerSlide)) {
    normalized.linesPerSlide = Math.max(1, Math.min(12, Math.round(settings.linesPerSlide)));
  }
  if (
    typeof settings.draftLyricsBySetlistSongId === "object"
    && settings.draftLyricsBySetlistSongId !== null
    && !Array.isArray(settings.draftLyricsBySetlistSongId)
  ) {
    normalized.draftLyricsBySetlistSongId = Object.fromEntries(
      Object.entries(settings.draftLyricsBySetlistSongId).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  return normalized;
}

export default async function SetlistRemotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pair?: string; desktopWindow?: string }>;
}) {
  const { id } = await params;
  const { pair } = await searchParams;

  if (!isDesktopRuntime()) {
    if (!pair) redirect("/worship-remote");
    const pairing = await claimCloudRemotePairing(pair);
    if (pairing.ok && pairing.setlistId === id) {
      redirect(`/worship-remote/session/${encodeURIComponent(pairing.sessionId)}`);
    }
    redirect("/worship-remote?error=expired");
  }

  const teamContext = await getRequiredTeamContext();
  const desktopSetlist = listDesktopSetlists(teamContext.teamId).find((setlist) => setlist.id === id);
  if (!desktopSetlist) notFound();
  const presentationSettings = "presentationSettings" in desktopSetlist
    ? normalizeRemotePresentationSettings(desktopSetlist.presentationSettings)
    : undefined;

  return <RemoteClient setlist={{
    id: desktopSetlist.id,
    name: desktopSetlist.name,
    presentationSettings,
    songs: desktopSetlist.songs.map((item) => ({
      id: item.id,
      song: { title: item.song.title, lyricsChords: item.song.rawLyricsChords || "" },
    })),
  }} desktopMode />;
}
