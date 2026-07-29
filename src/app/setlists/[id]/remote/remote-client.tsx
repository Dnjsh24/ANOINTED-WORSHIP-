"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsDown,
  ChevronsUp,
  Moon,
  Music,
  Play,
  Presentation,
  RefreshCw,
  SkipBack,
  SkipForward,
  SunMedium,
  Tv2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  newRemoteCommand,
  type RemoteCommandAcknowledgement,
  type RemoteLiveState,
  type RemoteStageFlashStyle,
} from "@/lib/presentation/control-protocol";
import { isRemotePairingActive } from "@/lib/presentation/remote-pairing";
import {
  buildLivePresentationSnapshot,
  isLivePresentationSnapshot,
  type LivePresentationSnapshot,
} from "@/lib/presentation/live-snapshot";
import { useDesktopRemoteChannel } from "@/lib/presentation/use-desktop-remote-channel";

type Song = { id: string; song: { title: string; lyricsChords: string } };
type Setlist = {
  id: string;
  name: string;
  songs: Song[];
  presentationSettings?: {
    linesPerSlide?: number;
    draftLyricsBySetlistSongId?: Record<string, string>;
  };
};

const defaultFlashStyle: RemoteStageFlashStyle = {
  fontSize: 56,
  color: "#ffffff",
  backgroundColor: "#dc2626",
};

export default function RemoteClient({
  setlist,
  desktopMode = false,
  cloudTopic,
  cloudExpiresAt,
}: {
  setlist: Setlist;
  desktopMode?: boolean;
  cloudTopic?: string;
  cloudExpiresAt?: string;
}) {
  const [songIndex, setSongIndex] = useState(0);
  const [live, setLive] = useState<RemoteLiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastStateAt, setLastStateAt] = useState(0);
  const [stageMessage, setStageMessage] = useState("");
  const [flashStyle, setFlashStyle] = useState(defaultFlashStyle);
  const [minutes, setMinutes] = useState(5);
  const [lastAcknowledgement, setLastAcknowledgement] = useState<RemoteCommandAcknowledgement | null>(null);
  const [projectorDisplayId, setProjectorDisplayId] = useState("");
  const [confidenceDisplayId, setConfidenceDisplayId] = useState("");
  const [pairingExpired, setPairingExpired] = useState(() => !isRemotePairingActive(cloudExpiresAt));
  const [controllerId, setControllerId] = useState("");
  const controllerIdRef = useRef("");
  useEffect(() => {
    const key = "anointed-worship-remote-controller";
    const existing = window.localStorage.getItem(key);
    if (existing) {
      controllerIdRef.current = existing;
      setControllerId(existing);
      return;
    }
    const next = crypto.randomUUID();
    window.localStorage.setItem(key, next);
    controllerIdRef.current = next;
    setControllerId(next);
  }, []);
  const supabase = useMemo(() => createClient(), []);
  const channel = useMemo(
    () => desktopMode || pairingExpired
      ? null
      : supabase.channel(
          cloudTopic || `worship-remote:${setlist.id}`,
          cloudTopic ? undefined : { config: { private: true } },
        ),
    [cloudTopic, desktopMode, pairingExpired, setlist.id, supabase],
  );
  const desktopChannel = useMemo(
    () => desktopMode && typeof window !== "undefined"
      ? new BroadcastChannel(`setlist_${setlist.id}`)
      : null,
    [desktopMode, setlist.id],
  );
  const [snapshot, setSnapshot] = useState<LivePresentationSnapshot>(() =>
    buildLivePresentationSnapshot({
      setlist: {
        id: setlist.id,
        name: setlist.name,
        songs: setlist.songs.map((item) => ({
          id: item.id,
          song: {
            id: item.id,
            title: item.song.title,
            lyricsChords: item.song.lyricsChords,
          },
        })),
      },
      revision: 0,
      publishedAt: "1970-01-01T00:00:00.000Z",
      linesPerSlide: setlist.presentationSettings?.linesPerSlide || 4,
      draft: {
        lyricsBySetlistSongId: setlist.presentationSettings?.draftLyricsBySetlistSongId,
      },
    }),
  );
  const activeSong = snapshot.items[songIndex];
  const slides = activeSong?.slides || [];
  const activeIndex = live?.activeSlideId
    ? slides.findIndex((slide) => slide.id === live.activeSlideId)
    : -1;
  const controllerReady = Boolean(live?.controllerReady) && connected;
  const remoteHasControl = controllerReady && live?.controller !== "desktop";

  useDesktopRemoteChannel(desktopChannel, (event) => {
    if (event.data?.event === "remote_state") {
      setLive(event.data.payload);
      setSongIndex(event.data.payload?.activeSongIndex ?? 0);
      setConnected(true);
      setLastStateAt(Date.now());
    }
    if (event.data?.event === "presentation_snapshot" && isLivePresentationSnapshot(event.data.payload)) {
      setSnapshot(event.data.payload);
    }
    if (event.data?.event === "remote_ack") setLastAcknowledgement(event.data.payload);
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastStateAt && Date.now() - lastStateAt > 6_000) setConnected(false);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [lastStateAt]);

  useEffect(() => {
    if (!cloudExpiresAt) return;
    const delay = Math.max(0, Date.parse(cloudExpiresAt) - Date.now());
    const timer = window.setTimeout(() => setPairingExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [cloudExpiresAt]);
  const displays = live?.displays || [];

  useEffect(() => {
    if (!displays.length) return;
    setProjectorDisplayId((current) => current || live?.projectorDisplayId || displays.find((display) => !display.primary)?.id || displays[0].id);
    setConfidenceDisplayId((current) => current || live?.confidenceDisplayId || displays.find((display) => !display.primary)?.id || displays[0].id);
  }, [displays, live?.confidenceDisplayId, live?.projectorDisplayId]);

  useEffect(() => {
    if (!channel) return;
    channel
      .on("broadcast", { event: "remote_state" }, (event) => {
        const state = event.payload as RemoteLiveState;
        setLive(state);
        setSongIndex(state.activeSongIndex ?? 0);
        setLastStateAt(Date.now());
      })
      .on("broadcast", { event: "presentation_snapshot" }, (event) => {
        if (isLivePresentationSnapshot(event.payload)) setSnapshot(event.payload);
      })
      .on("broadcast", { event: "remote_ack" }, (event) => setLastAcknowledgement(event.payload as RemoteCommandAcknowledgement))
      .subscribe((status) => {
        const isSubscribed = status === "SUBSCRIBED";
        setConnected(isSubscribed);
        if (isSubscribed && controllerIdRef.current) {
          channel.send({ type: "broadcast", event: "remote_command", payload: newRemoteCommand(setlist.id, "claim-control", undefined, controllerIdRef.current) });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [channel, setlist.id, supabase]);

  const send = (
    kind: Parameters<typeof newRemoteCommand>[1],
    payload?: Parameters<typeof newRemoteCommand>[2],
  ) => {
    if (pairingExpired || !controllerId) return;
    const command = newRemoteCommand(setlist.id, kind, payload, controllerId, snapshot.revision);
    if (desktopChannel) desktopChannel.postMessage({ event: "remote_command", payload: command });
    else channel?.send({ type: "broadcast", event: "remote_command", payload: command });
  };

  const selectSong = (index: number) => {
    setSongIndex(index);
    send("select-song", { songIndex: index, setlistSongId: snapshot.items[index]?.setlistSongId });
  };

  useEffect(() => {
    if (controllerId) send("claim-control");
  // `send` intentionally depends on the current channel/controller state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerId]);

  const sendFlashNote = () => send("stage-message", {
    message: stageMessage,
    stageFlashStyle: flashStyle,
  });

  return <main className="min-h-[100dvh] bg-[#101010] text-zinc-100">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#171717] px-4 py-3">
      <div className="flex items-center gap-2">
        <Music className="size-4 text-violet-300" />
        <div>
          <h1 className="text-sm font-black">Worship Remote</h1>
          <p className="text-[10px] text-zinc-500">{setlist.name}</p>
        </div>
      </div>
      <span className={`rounded px-2 py-1 text-[10px] font-bold ${connected ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
        {pairingExpired ? "Pairing expired" : controllerReady ? "Presenter connected" : connected ? "Waiting for Presenter" : "Presenter not connected"}
      </span>
    </header>

    {live?.controller === "desktop" && <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs font-semibold text-amber-200">
      Desktop has taken control. Live commands from this Remote are temporarily paused.
    </div>}
    {!controllerReady && !pairingExpired && <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
      Keep the Presenter editor open on the controlling PC. Remote commands are disabled until its live controller heartbeat is detected.
    </div>}
    {live?.outputError && <div className="border-b border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-200">
      Output error: {live.outputError}
    </div>}
    {(lastAcknowledgement || live?.lastAcknowledgement) && <div className={`border-b px-4 py-2 text-center text-xs font-semibold ${(lastAcknowledgement || live?.lastAcknowledgement)?.status === "applied" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-red-400/30 bg-red-400/10 text-red-200"}`}>
      {(lastAcknowledgement || live?.lastAcknowledgement)?.message}
    </div>}

    <div className="grid gap-3 p-3 lg:grid-cols-[240px_1fr_260px]">
      <section className="rounded border border-white/10 bg-white/[.03] p-2">
        <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lineup</p>
        {snapshot.items.map((song, index) => <button
          key={song.setlistSongId}
          type="button"
          disabled={!remoteHasControl || pairingExpired}
          onClick={() => selectSong(index)}
          className={`mb-1 block w-full rounded px-3 py-2 text-left text-sm font-bold disabled:opacity-40 ${songIndex === index ? "bg-violet-600 text-white" : "hover:bg-white/10"}`}
        >{index + 1}. {song.title}</button>)}
      </section>

      <section className="rounded border border-white/10 bg-white/[.03] p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-black">{activeSong?.title || "No song"}</h2>
            <p className="text-xs text-zinc-500">{activeIndex >= 0 ? `Slide ${activeIndex + 1} of ${slides.length}` : `${slides.length} slides`}</p>
          </div>
          <button type="button" disabled={!remoteHasControl} onClick={() => send("present")} className="inline-flex items-center gap-1 rounded bg-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-40">
            <Presentation className="size-3.5" /> Present
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {slides.map((slide) => <button
            key={slide.id}
            type="button"
            disabled={!remoteHasControl}
            onClick={() => send("select-slide", { slideId: slide.id })}
            className={`rounded border p-3 text-left disabled:opacity-40 ${live?.activeSlideId === slide.id ? "border-violet-400 bg-violet-400/10" : "border-white/10 hover:bg-white/5"}`}
          >
            <span className="mb-1 block text-[10px] font-bold uppercase text-violet-200">{slide.sectionLabel || "Slide"}</span>
            {slide.content.map((line, index) => <span className="block text-sm font-semibold" key={index}>{line || "(instrumental)"}</span>)}
          </button>)}
        </div>
        {!slides.length && <p className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No lyrics saved for this song.</p>}
      </section>

      <aside className="space-y-3">
        <section className="rounded border border-white/10 bg-white/[.03] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Navigation</p>
          <div className="grid grid-cols-4 gap-1">
            <button type="button" disabled={!remoteHasControl} onClick={() => send("first-slide")} title="First" className="control"><ChevronsUp /></button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("previous-slide")} title="Previous" className="control"><SkipBack /></button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("next-slide")} title="Next" className="control"><SkipForward /></button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("last-slide")} title="Last" className="control"><ChevronsDown /></button>
          </div>
        </section>

        <section className="rounded border border-white/10 bg-white/[.03] p-3">
          <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Outputs</p><button type="button" disabled={!remoteHasControl} onClick={() => send("refresh-displays")} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white" title="Refresh displays"><RefreshCw className="size-3" /></button></div>
          {displays.length > 0 && <>
            <div className="mb-1 grid grid-cols-[1fr_auto] gap-1"><select aria-label="Projector display" value={projectorDisplayId} onChange={(event) => setProjectorDisplayId(event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-white">{displays.map((display) => <option key={display.id} value={display.id}>{display.label} — {display.width}×{display.height}{display.primary ? " (Primary)" : ""}</option>)}</select><button type="button" disabled={!remoteHasControl} onClick={() => send("present-projector", { displayId: projectorDisplayId })} className="control px-2">Present</button></div>
            <div className="mb-2 grid grid-cols-[1fr_auto] gap-1"><select aria-label="Confidence display" value={confidenceDisplayId} onChange={(event) => setConfidenceDisplayId(event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-white">{displays.map((display) => <option key={display.id} value={display.id}>{display.label} — {display.width}×{display.height}{display.primary ? " (Primary)" : ""}</option>)}</select><button type="button" disabled={!remoteHasControl} onClick={() => send("present-confidence", { displayId: confidenceDisplayId })} className="control px-2"><Tv2 className="size-3" /></button></div>
          </>}
          <div className="grid grid-cols-2 gap-1">
            <button type="button" disabled={!remoteHasControl} onClick={() => send("clear")} className="control">Clear</button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("black")} className="control"><Moon className="mr-1 inline size-3" />Black</button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("logo")} className="control"><SunMedium className="mr-1 inline size-3" />Logo</button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("present")} className="control"><Play className="mr-1 inline size-3" />Present</button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">{live?.projectorOpen ? (live.projectorReady ? "Projector ready" : "Projector loading") : "Projector closed"} · {live?.confidenceOpen ? (live.confidenceReady ? "Confidence ready" : "Confidence loading") : "Confidence closed"}{!displays.length && " · Refresh if a screen is missing"}</p>
        </section>

        <section className="rounded border border-white/10 bg-white/[.03] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Stage</p>
          <input value={stageMessage} onChange={(event) => setStageMessage(event.target.value)} placeholder="Flash note" className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-xs" />
          <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-1">
            <input type="number" min="16" max="160" value={flashStyle.fontSize} onChange={(event) => setFlashStyle({ ...flashStyle, fontSize: Math.max(16, Math.min(160, Number(event.target.value) || 56)) })} aria-label="Flash note font size" className="min-w-0 rounded border border-white/10 bg-black/30 px-2 text-xs" />
            <input type="color" value={flashStyle.color} onChange={(event) => setFlashStyle({ ...flashStyle, color: event.target.value })} aria-label="Flash note text color" className="h-8 w-9 rounded bg-transparent" />
            <input type="color" value={flashStyle.backgroundColor} onChange={(event) => setFlashStyle({ ...flashStyle, backgroundColor: event.target.value })} aria-label="Flash note background color" className="h-8 w-9 rounded bg-transparent" />
          </div>
          <button type="button" disabled={!remoteHasControl} onClick={sendFlashNote} className="control w-full">Send flash note</button>
          <div className="mt-2 flex gap-1">
            <input type="number" min="1" max="240" value={minutes} onChange={(event) => setMinutes(Math.max(1, Math.min(240, Number(event.target.value) || 1)))} className="w-16 rounded border border-white/10 bg-black/30 px-2 text-xs" />
            <span className="self-center text-xs text-zinc-500">minutes</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <button type="button" disabled={!remoteHasControl} onClick={() => send("timer", { timerAction: "start", timerMinutes: minutes })} className="control">Start</button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("timer", { timerAction: "pause" })} className="control">Pause</button>
            <button type="button" disabled={!remoteHasControl} onClick={() => send("timer", { timerAction: "reset" })} className="control">Reset</button>
          </div>
        </section>
      </aside>
    </div>
    <style jsx>{`.control{display:flex;min-height:36px;align-items:center;justify-content:center;border-radius:6px;background:rgba(255,255,255,.08);font-size:11px;font-weight:700}.control:hover:not(:disabled){background:rgba(255,255,255,.16)}.control:disabled{cursor:not-allowed;opacity:.4}.control svg{width:16px;height:16px}`}</style>
  </main>;
}
