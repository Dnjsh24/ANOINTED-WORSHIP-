import Link from "next/link";
import { Radio, RotateCcw } from "lucide-react";
import { resumeCloudRemotePairing } from "@/app/presenter/remote-pairing-actions";
import RemoteClient, { type RemoteSetlist } from "@/app/setlists/[id]/remote/remote-client";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type RemotePresentationSettings = {
  linesPerSlide?: number;
  draftLyricsBySetlistSongId?: Record<string, string>;
};

type RemoteSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "song_order"
> & {
  song: Pick<Database["public"]["Tables"]["songs"]["Row"], "title" | "lyrics_chords"> | null;
};

type RemoteSetlistRow = Pick<
  Database["public"]["Tables"]["setlists"]["Row"],
  "id" | "name" | "presentation_settings"
> & {
  setlist_songs: RemoteSetlistSongRow[];
};

function normalizePresentationSettings(value: unknown): RemotePresentationSettings | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const settings = value as Record<string, unknown>;
  const normalized: RemotePresentationSettings = {};
  if (typeof settings.linesPerSlide === "number" && Number.isFinite(settings.linesPerSlide)) {
    normalized.linesPerSlide = Math.max(1, Math.min(12, Math.round(settings.linesPerSlide)));
  }
  if (settings.draftLyricsBySetlistSongId && typeof settings.draftLyricsBySetlistSongId === "object" && !Array.isArray(settings.draftLyricsBySetlistSongId)) {
    normalized.draftLyricsBySetlistSongId = Object.fromEntries(
      Object.entries(settings.draftLyricsBySetlistSongId).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  return normalized;
}

function SessionEnded() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#0d0c12] p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17161b] p-7 text-center shadow-2xl">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-400/10 text-amber-200">
          <Radio className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-black">Remote session ended</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This session expired, was stopped from the PC, or belongs to another team member. Ask the Presenter operator for a new code.
        </p>
        <Link href="/worship-remote" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-black hover:bg-violet-500">
          <RotateCcw className="size-4" aria-hidden="true" /> Pair again
        </Link>
      </section>
    </main>
  );
}

export default async function WorshipRemoteSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const pairing = await resumeCloudRemotePairing(sessionId);
  if (!pairing.ok) return <SessionEnded />;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setlists")
    .select(`
      id,
      name,
      presentation_settings,
      setlist_songs (
        id,
        song_order,
        song:songs (
          title,
          lyrics_chords
        )
      )
    `)
    .eq("id", pairing.setlistId)
    .eq("team_id", pairing.teamId)
    .maybeSingle();
  const dbSetlist = data as unknown as RemoteSetlistRow | null;
  if (error || !dbSetlist) return <SessionEnded />;

  const setlistSongs = [...(dbSetlist.setlist_songs || [])]
    .sort((left, right) => (left.song_order ?? 0) - (right.song_order ?? 0));
  const setlist: RemoteSetlist = {
    id: dbSetlist.id,
    name: dbSetlist.name,
    presentationSettings: normalizePresentationSettings(dbSetlist.presentation_settings),
    songs: setlistSongs.map((item) => ({
      id: item.id,
      song: {
        title: item.song?.title || "Unknown Song",
        lyricsChords: item.song?.lyrics_chords || "",
      },
    })),
  };

  return (
    <RemoteClient
      setlist={setlist}
      cloudTopic={pairing.channelTopic}
      cloudPrivate={pairing.privateChannel}
      cloudExpiresAt={pairing.expiresAt}
    />
  );
}
