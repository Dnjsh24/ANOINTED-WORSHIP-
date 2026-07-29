import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import { claimCloudRemotePairing } from "@/app/presenter/remote-pairing-actions";
import RemoteClient from "./remote-client";

function PairingRequired({ setlistName, expired = false }: { setlistName: string; expired?: boolean }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#101010] p-6 text-zinc-100">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#171717] p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Worship Remote</p>
        <h1 className="mt-3 text-2xl font-black">{expired ? "Pairing expired" : "Pair this phone with the PC"}</h1>
        <p className="mt-2 text-sm text-zinc-400">{setlistName}</p>
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          {expired
            ? "This one-time Remote link is no longer valid. Create a new 30-minute pairing code from the Windows Presenter."
            : "Open Presenter on the Windows PC, choose Pair phone, then scan its 30-minute QR code with this phone."}
        </p>
        <p className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Remote controls stay locked until a valid QR pairing is completed.
        </p>
      </section>
    </main>
  );
}

export default async function SetlistRemotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pair?: string }> }) {
  const { id } = await params;
  const { pair } = await searchParams;
  const teamContext = await getRequiredTeamContext();

  if (isDesktopRuntime() && teamContext.teamId) {
    const desktopSetlist = listDesktopSetlists(teamContext.teamId).find((setlist) => setlist.id === id);
    if (!desktopSetlist) notFound();
    return <RemoteClient setlist={{
      id: desktopSetlist.id,
      name: desktopSetlist.name,
      presentationSettings: (desktopSetlist as any).presentationSettings,
      songs: desktopSetlist.songs.map((item) => ({ id: item.id, song: { title: item.song.title, lyricsChords: item.song.rawLyricsChords || "" } })),
    }} desktopMode />;
  }

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data: dbSetlist } = (await supabase
      .from("setlists")
      .select(`
        *,
        setlist_songs (
          id,
          assigned_key,
          song_order,
          song:songs (
            title,
            bpm,
            original_key,
            lyrics_chords
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle()) as any;

    if (dbSetlist) {
      const dbSetlistSongs = dbSetlist.setlist_songs || [];
      dbSetlistSongs.sort((a: any, b: any) => (a.song_order ?? 0) - (b.song_order ?? 0));

      const songsList = dbSetlistSongs.map((ss: any) => ({
        id: ss.id,
        song: {
          title: ss.song?.title || "Unknown Song",
          lyricsChords: ss.song?.lyrics_chords || "",
        },
      }));

      const setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
        songs: songsList,
        presentationSettings: dbSetlist.presentation_settings,
      };

      if (!pair) return <PairingRequired setlistName={setlist.name} />;
      let cloudPairing: Awaited<ReturnType<typeof claimCloudRemotePairing>> | null = null;
      try {
        cloudPairing = await claimCloudRemotePairing(pair);
      } catch {
        cloudPairing = null;
      }
      if (!cloudPairing || cloudPairing.setlistId !== id) return <PairingRequired setlistName={setlist.name} expired />;
      return <RemoteClient setlist={setlist} cloudTopic={cloudPairing.channelTopic} cloudExpiresAt={cloudPairing.expiresAt} />;
    }
  }

  notFound();
}
