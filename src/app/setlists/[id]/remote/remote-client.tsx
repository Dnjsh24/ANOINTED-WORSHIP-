"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronsDown,
  ChevronsUp,
  FolderOpen,
  Loader2,
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
import { createOptionalClient } from "@/lib/supabase/client";
import {
  newRemoteCommand,
  isRemoteContentLibrary,
  type RemoteCommandAcknowledgement,
  type RemoteContentLibrary,
  type RemoteLiveState,
  type RemoteStageFlashStyle,
} from "@/lib/presentation/control-protocol";
import { BIBLE_BOOKS, BIBLE_TRANSLATIONS, bibleBookChapterCount, type BibleTranslation } from "@/lib/bible/catalog";
import { isRemotePairingActive } from "@/lib/presentation/remote-pairing";
import {
  buildLivePresentationSnapshot,
  isLivePresentationSnapshot,
  type LivePresentationSnapshot,
} from "@/lib/presentation/live-snapshot";
import { useDesktopRemoteChannel } from "@/lib/presentation/use-desktop-remote-channel";
import {
  authenticateRealtimeClient,
  realtimeConnectionErrorMessage,
} from "@/lib/presentation/authenticated-realtime-channel";
import { isAllowedLyricShortcut, lyricShortcutLabel, resolveLyricShortcuts } from "@/lib/presentation/lyric-shortcuts";

type Song = { id: string; song: { title: string; lyricsChords: string } };
export type RemoteSetlist = {
  id: string;
  name: string;
  songs: Song[];
  presentationSettings?: {
    linesPerSlide?: number;
    draftLyricsBySetlistSongId?: Record<string, string>;
  };
};
type RemoteSourcePanel = "lineup" | "presentation" | "bible";
type BibleVerse = { reference: string; text: string };

const defaultFlashStyle: RemoteStageFlashStyle = {
  fontSize: 56,
  color: "#ffffff",
  backgroundColor: "#dc2626",
};

export default function RemoteClient({
  setlist,
  desktopMode = false,
  cloudTopic,
  cloudPrivate = false,
  cloudExpiresAt,
}: {
  setlist: RemoteSetlist;
  desktopMode?: boolean;
  cloudTopic?: string;
  cloudPrivate?: boolean;
  cloudExpiresAt?: string;
}) {
  const [songIndex, setSongIndex] = useState(0);
  const [activeSourcePanel, setActiveSourcePanel] = useState<RemoteSourcePanel>("lineup");
  const [remoteLibrary, setRemoteLibrary] = useState<RemoteContentLibrary | null>(null);
  const [selectedPresentationId, setSelectedPresentationId] = useState("");
  const [bibleTranslation, setBibleTranslation] = useState<BibleTranslation>("kjv");
  const [selectedBibleBook, setSelectedBibleBook] = useState("");
  const [selectedBibleChapter, setSelectedBibleChapter] = useState<number | null>(null);
  const [bibleVerses, setBibleVerses] = useState<BibleVerse[]>([]);
  const [isFetchingBible, setIsFetchingBible] = useState(false);
  const [bibleError, setBibleError] = useState("");
  const workspaceRef = useRef<HTMLElement>(null);
  const [live, setLive] = useState<RemoteLiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [lastStateAt, setLastStateAt] = useState(0);
  const [stageMessage, setStageMessage] = useState("");
  const [flashStyle, setFlashStyle] = useState(defaultFlashStyle);
  const [minutes, setMinutes] = useState(5);
  const [lastAcknowledgement, setLastAcknowledgement] = useState<RemoteCommandAcknowledgement | null>(null);
  const [projectorDisplayId, setProjectorDisplayId] = useState("");
  const [confidenceDisplayId, setConfidenceDisplayId] = useState("");
  const [pairingExpired, setPairingExpired] = useState(() => !isRemotePairingActive(cloudExpiresAt));
  const [controllerId, setControllerId] = useState("");
  const [capturingShortcutSlideId, setCapturingShortcutSlideId] = useState("");
  const controllerIdRef = useRef("");
  useEffect(() => {
    const key = "anointed-worship-remote-controller";
    const existing = window.localStorage.getItem(key);
    if (existing) {
      controllerIdRef.current = existing;
      queueMicrotask(() => setControllerId(existing));
      return;
    }
    const next = crypto.randomUUID();
    window.localStorage.setItem(key, next);
    controllerIdRef.current = next;
    queueMicrotask(() => setControllerId(next));
  }, []);
  const supabase = useMemo(() => createOptionalClient(), []);
  const channel = useMemo(
    () => desktopMode || pairingExpired || !supabase
      ? null
        : supabase.channel(
          cloudTopic || `worship-remote:${setlist.id}`,
          cloudTopic && !cloudPrivate ? undefined : { config: { private: true } },
        ),
    [cloudPrivate, cloudTopic, desktopMode, pairingExpired, setlist.id, supabase],
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
  const slides = useMemo(() => activeSong?.slides || [], [activeSong?.slides]);
  const activeIndex = live?.activeSlideId
    ? slides.findIndex((slide) => slide.id === live.activeSlideId)
    : -1;
  const controllerReady = !pairingExpired && Boolean(live?.controllerReady) && connected;
  const remoteHasControl = controllerReady && live?.controller !== "desktop";
  const selectedPresentation = remoteLibrary?.presentations.find((presentation) => presentation.id === selectedPresentationId)
    || remoteLibrary?.presentations[0];
  const activeShortcutBindings = useMemo(() => {
    const bindings = remoteLibrary?.lyricShortcuts?.find((item) => item.setlistSongId === activeSong?.setlistSongId)?.bindings;
    return bindings
      ? Object.fromEntries(bindings.map((binding) => [binding.slideId, binding.keyCode]))
      : resolveLyricShortcuts(slides.map((slide) => slide.id), {});
  }, [activeSong?.setlistSongId, remoteLibrary?.lyricShortcuts, slides]);

  useDesktopRemoteChannel(desktopChannel, (event) => {
    if (event.data?.event === "remote_state") {
      setLive(event.data.payload);
      setSongIndex(event.data.payload?.activeSongIndex ?? 0);
      setConnected(true);
      setConnectionError("");
      setLastStateAt(Date.now());
    }
    if (event.data?.event === "presentation_snapshot" && isLivePresentationSnapshot(event.data.payload)) {
      setSnapshot(event.data.payload);
    }
    if (event.data?.event === "remote_library" && isRemoteContentLibrary(event.data.payload) && event.data.payload.setlistId === setlist.id) {
      setRemoteLibrary(event.data.payload);
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
  const displays = useMemo(() => live?.displays || [], [live?.displays]);

  useEffect(() => {
    if (!displays.length) return;
    const timer = window.setTimeout(() => {
      setProjectorDisplayId((current) => current || live?.projectorDisplayId || displays.find((display) => !display.primary)?.id || displays[0].id);
      setConfidenceDisplayId((current) => current || live?.confidenceDisplayId || displays.find((display) => !display.primary)?.id || displays[0].id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [displays, live?.confidenceDisplayId, live?.projectorDisplayId]);

  useEffect(() => {
    if (!channel || !supabase) return;
    let active = true;
    channel
      .on("broadcast", { event: "remote_state" }, (event) => {
        const state = event.payload as RemoteLiveState;
        setLive(state);
        setSongIndex(state.activeSongIndex ?? 0);
        setConnected(true);
        setConnectionError("");
        setLastStateAt(Date.now());
      })
      .on("broadcast", { event: "presentation_snapshot" }, (event) => {
        if (isLivePresentationSnapshot(event.payload)) setSnapshot(event.payload);
      })
      .on("broadcast", { event: "remote_library" }, (event) => {
        if (isRemoteContentLibrary(event.payload) && event.payload.setlistId === setlist.id) setRemoteLibrary(event.payload);
      })
      .on("broadcast", { event: "remote_ack" }, (event) => setLastAcknowledgement(event.payload as RemoteCommandAcknowledgement));
    void authenticateRealtimeClient(supabase)
      .then(() => {
        if (!active) return;
        channel.subscribe((status, error) => {
          const isSubscribed = status === "SUBSCRIBED";
          setConnected(isSubscribed);
          setConnectionError(isSubscribed ? "" : error ? realtimeConnectionErrorMessage(error) : "");
          if (isSubscribed && controllerIdRef.current) {
            channel.send({ type: "broadcast", event: "remote_command", payload: newRemoteCommand(setlist.id, "claim-control", undefined, controllerIdRef.current) });
          }
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setConnected(false);
        setConnectionError(realtimeConnectionErrorMessage(error));
      });
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channel, setlist.id, supabase]);

  const send = useCallback((
    kind: Parameters<typeof newRemoteCommand>[1],
    payload?: Parameters<typeof newRemoteCommand>[2],
  ) => {
    if (pairingExpired || !controllerId) return;
    const command = newRemoteCommand(setlist.id, kind, payload, controllerId, snapshot.revision);
    if (desktopChannel) desktopChannel.postMessage({ event: "remote_command", payload: command });
    else channel?.send({ type: "broadcast", event: "remote_command", payload: command });
  }, [channel, controllerId, desktopChannel, pairingExpired, setlist.id, snapshot.revision]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const isTyping = target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']");

      if (capturingShortcutSlideId) {
        if (event.code === "Escape") {
          event.preventDefault();
          setCapturingShortcutSlideId("");
          return;
        }
        if (event.code === "Backspace" || event.code === "Delete") {
          event.preventDefault();
          send("set-lyric-shortcut", {
            setlistSongId: activeSong?.setlistSongId,
            slideId: capturingShortcutSlideId,
          });
          setCapturingShortcutSlideId("");
          return;
        }
        if (!isAllowedLyricShortcut(event.code) || !activeSong?.setlistSongId) return;
        event.preventDefault();
        send("set-lyric-shortcut", {
          setlistSongId: activeSong.setlistSongId,
          slideId: capturingShortcutSlideId,
          keyCode: event.code,
        });
        setCapturingShortcutSlideId("");
        return;
      }

      if (isTyping || activeSourcePanel !== "lineup" || !remoteHasControl) return;
      const slideId = Object.entries(activeShortcutBindings).find(([, keyCode]) => keyCode === event.code)?.[0];
      if (!slideId) return;
      event.preventDefault();
      send("select-slide", { slideId });
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeShortcutBindings, activeSong?.setlistSongId, activeSourcePanel, capturingShortcutSlideId, remoteHasControl, send]);

  const selectSong = (index: number) => {
    setActiveSourcePanel("lineup");
    setSongIndex(index);
    send("select-song", { songIndex: index, setlistSongId: snapshot.items[index]?.setlistSongId });
  };

  const openSourcePanel = (source: RemoteSourcePanel) => {
    setActiveSourcePanel(source);
    if (source !== "lineup" && typeof window !== "undefined" && window.innerWidth < 1024) {
      window.requestAnimationFrame(() => workspaceRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
  };

  const fetchBibleChapter = async (book: string, chapter: number, translation: BibleTranslation = bibleTranslation) => {
    setSelectedBibleChapter(chapter);
    setIsFetchingBible(true);
    setBibleError("");
    setBibleVerses([]);
    try {
      const params = new URLSearchParams({ q: `${book} ${chapter}`, translation });
      const response = await fetch(`/api/bible?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Bible passage unavailable.");
      const verses = Array.isArray(data?.verses)
        ? data.verses.map((verse: { book_name?: string; chapter?: number; verse?: number; text?: string }) => ({
            reference: `${verse.book_name || book} ${verse.chapter || chapter}:${verse.verse || ""}`.replace(/:$/, ""),
            text: String(verse.text || "").trim(),
          })).filter((verse: BibleVerse) => verse.text)
        : [];
      if (!verses.length) throw new Error("No verses were found for this chapter.");
      setBibleVerses(verses);
    } catch (error) {
      setBibleError(error instanceof Error ? error.message : "Failed to load this Bible chapter.");
    } finally {
      setIsFetchingBible(false);
    }
  };

  const presentBibleVerse = (verse: BibleVerse) => {
    send("present-bible-verse", {
      reference: verse.reference,
      text: verse.text,
      translation: bibleTranslation,
    });
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
        {pairingExpired ? "Pairing expired" : controllerReady ? "Presenter connected" : connectionError ? "Connection blocked" : connected ? "Waiting for Presenter" : "Presenter not connected"}
      </span>
    </header>

    {live?.controller === "desktop" && <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs font-semibold text-amber-200">
      Desktop has taken control. Live commands from this Remote are temporarily paused.
    </div>}
    {!controllerReady && !pairingExpired && <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
      {connectionError || "Keep the Presenter editor open on the controlling PC. Remote commands are disabled until its live controller heartbeat is detected."}
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
          className={`mb-1 block w-full rounded px-3 py-2 text-left text-sm font-bold disabled:opacity-40 ${activeSourcePanel === "lineup" && songIndex === index ? "bg-violet-600 text-white" : "hover:bg-white/10"}`}
        >{index + 1}. {song.title}</button>)}

        <div className="mt-3 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => openSourcePanel("presentation")}
            aria-pressed={activeSourcePanel === "presentation"}
            className={`mb-1 flex w-full items-center gap-3 rounded border px-3 py-3 text-left ${activeSourcePanel === "presentation" ? "border-violet-400 bg-violet-500/15 text-white" : "border-white/10 hover:bg-white/10"}`}
          >
            <FolderOpen className="size-4 text-violet-300" />
            <span><span className="block text-sm font-bold">Presentation</span><span className="block text-[10px] text-zinc-500">{remoteLibrary?.presentations.length ?? 0} saved deck{remoteLibrary?.presentations.length === 1 ? "" : "s"}</span></span>
          </button>
          <button
            type="button"
            onClick={() => openSourcePanel("bible")}
            aria-pressed={activeSourcePanel === "bible"}
            className={`flex w-full items-center gap-3 rounded border px-3 py-3 text-left ${activeSourcePanel === "bible" ? "border-violet-400 bg-violet-500/15 text-white" : "border-white/10 hover:bg-white/10"}`}
          >
            <BookOpen className="size-4 text-violet-300" />
            <span><span className="block text-sm font-bold">Bible</span><span className="block text-[10px] text-zinc-500">KJV · WEB · BBE</span></span>
          </button>
        </div>
      </section>

      <section ref={workspaceRef} tabIndex={-1} aria-label={`${activeSourcePanel} controls`} className="scroll-mt-16 rounded border border-white/10 bg-white/[.03] p-3 outline-none">
        {activeSourcePanel === "lineup" && <>
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
            {slides.map((slide) => <div key={slide.id} className={`relative rounded border ${live?.activeSlideId === slide.id ? "border-violet-400 bg-violet-400/10" : "border-white/10 hover:bg-white/5"}`}>
              <button
                type="button"
                disabled={!remoteHasControl}
                onClick={() => send("select-slide", { slideId: slide.id })}
                className="w-full rounded p-3 pr-14 text-left disabled:opacity-40"
              >
                <span className="mb-1 block text-[10px] font-bold uppercase text-violet-200">{slide.sectionLabel || "Slide"}</span>
                {slide.content.map((line, index) => <span className="block text-sm font-semibold" key={index}>{line || "(instrumental)"}</span>)}
              </button>
              <button
                type="button"
                disabled={!remoteHasControl}
                aria-label={`Change keyboard shortcut for ${slide.sectionLabel || "slide"}`}
                title="Change shortcut. Press Backspace to reset."
                onClick={() => setCapturingShortcutSlideId(slide.id)}
                className={`absolute right-2 top-2 min-w-9 rounded border px-2 py-1 font-mono text-xs font-black disabled:opacity-40 ${capturingShortcutSlideId === slide.id ? "border-amber-300 bg-amber-400/20 text-amber-100" : "border-violet-400/30 bg-violet-500/15 text-violet-100"}`}
              >
                {capturingShortcutSlideId === slide.id ? "…" : lyricShortcutLabel(activeShortcutBindings[slide.id] || "—")}
              </button>
            </div>)}
          </div>
          {capturingShortcutSlideId && <p role="status" className="mt-2 rounded border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Press a number or letter. Escape cancels; Backspace restores the default.</p>}
          {!slides.length && <p className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No lyrics saved for this song.</p>}
        </>}

        {activeSourcePanel === "presentation" && <>
          <div className="mb-3">
            <h2 className="font-black">Presentation</h2>
            <p className="text-xs text-zinc-500">Saved decks stay on the Presenter PC. Tap a slide to present it.</p>
          </div>
          {!remoteLibrary && <p role="status" className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">Waiting for the Presenter library…</p>}
          {remoteLibrary && !remoteLibrary.capabilities.presentations && <p className="rounded border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Saved presentations require the Windows Presenter.</p>}
          {remoteLibrary?.capabilities.presentations && remoteLibrary.presentations.length === 0 && <p className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No saved presentations are available. Import a PDF or PowerPoint file under Teaching on the Presenter PC.</p>}
          {remoteLibrary && remoteLibrary.presentations.length > 0 && <>
            <label className="mb-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Saved deck
              <select value={selectedPresentation?.id || ""} onChange={(event) => setSelectedPresentationId(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-[#181818] px-3 py-2 text-sm text-white">
                {remoteLibrary.presentations.map((presentation) => <option key={presentation.id} value={presentation.id}>{presentation.name} ({presentation.slides.length})</option>)}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedPresentation?.slides.map((slide) => <button
                key={slide.id}
                type="button"
                disabled={!remoteHasControl}
                onClick={() => send("present-presentation-slide", { presentationId: selectedPresentation.id, slideId: slide.id })}
                className={`rounded border p-3 text-left disabled:opacity-40 ${live?.activeSource?.kind === "presentation" && live.activeSource.presentationId === selectedPresentation.id && live.activeSlideId === slide.id ? "border-violet-400 bg-violet-400/10" : "border-white/10 hover:bg-white/5"}`}
              >
                <span className="mb-1 block text-[10px] font-bold uppercase text-violet-200">{slide.label}</span>
                <span className="block text-sm font-semibold text-zinc-200">{slide.preview || "Visual or media slide"}</span>
              </button>)}
            </div>
            {selectedPresentation && !selectedPresentation.slides.length && <p className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">This presentation has no slides.</p>}
          </>}
        </>}

        {activeSourcePanel === "bible" && <>
          <div className="mb-3">
            <h2 className="font-black">Bible</h2>
            <p className="text-xs text-zinc-500">Browse freely. Only tapping a verse changes live output.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Translation
              <select value={bibleTranslation} onChange={(event) => {
                const translation = event.target.value as BibleTranslation;
                setBibleTranslation(translation);
                if (selectedBibleBook && selectedBibleChapter) void fetchBibleChapter(selectedBibleBook, selectedBibleChapter, translation);
              }} className="mt-1 w-full rounded border border-white/10 bg-[#181818] px-3 py-2 text-sm text-white">
                {BIBLE_TRANSLATIONS.map((translation) => <option key={translation.id} value={translation.id}>{translation.label}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Book
              <select value={selectedBibleBook} onChange={(event) => {
                setSelectedBibleBook(event.target.value);
                setSelectedBibleChapter(null);
                setBibleVerses([]);
                setBibleError("");
              }} className="mt-1 w-full rounded border border-white/10 bg-[#181818] px-3 py-2 text-sm text-white">
                <option value="">Choose a book</option>
                <optgroup label="Old Testament">{BIBLE_BOOKS.filter((book) => book.testament === "old").map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}</optgroup>
                <optgroup label="New Testament">{BIBLE_BOOKS.filter((book) => book.testament === "new").map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}</optgroup>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chapter
              <select disabled={!selectedBibleBook || isFetchingBible} value={selectedBibleChapter || ""} onChange={(event) => void fetchBibleChapter(selectedBibleBook, Number(event.target.value))} className="mt-1 w-full rounded border border-white/10 bg-[#181818] px-3 py-2 text-sm text-white disabled:opacity-40">
                <option value="">Choose a chapter</option>
                {Array.from({ length: bibleBookChapterCount(selectedBibleBook) }, (_, index) => index + 1).map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
              </select>
            </label>
          </div>
          {isFetchingBible && <p role="status" className="mt-4 flex items-center justify-center gap-2 rounded border border-white/10 p-6 text-sm text-zinc-400"><Loader2 className="size-4 animate-spin" /> Loading chapter…</p>}
          {bibleError && <p role="alert" className="mt-4 rounded border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{bibleError}</p>}
          {!isFetchingBible && !bibleError && selectedBibleChapter && bibleVerses.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {bibleVerses.map((verse) => <button
              key={verse.reference}
              type="button"
              disabled={!remoteHasControl}
              onClick={() => presentBibleVerse(verse)}
              className={`rounded border p-3 text-left disabled:opacity-40 ${live?.activeSource?.kind === "bible" && live.activeSource.reference === verse.reference ? "border-violet-400 bg-violet-400/10" : "border-white/10 hover:bg-white/5"}`}
            >
              <span className="mb-1 block text-[10px] font-bold uppercase text-violet-200">{verse.reference}</span>
              <span className="block text-sm leading-relaxed text-zinc-200">{verse.text}</span>
            </button>)}
          </div>}
          {!selectedBibleBook && <p className="mt-4 rounded border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">Choose a translation, book, and chapter.</p>}
        </>}
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
