"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Save, X, Music, LayoutTemplate, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Smartphone, Type, BookOpen, Upload } from "lucide-react";
import { createOptionalClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, defaultPresentationSettings, resolveBlockMotion, type BlockMotion, type LiveProp, type PresentationSlide, type PresentationSettings, type SceneLayer, type SlideBlock } from "@/lib/domain/presentation";
import KineticCanvas from "./kinetic-canvas";
import TimelineEditor from "./timeline-editor";
import { MediaUploader } from "@/components/media-uploader";
import { DesktopBackgroundLibrary, type DesktopBackgroundAssetClient, type DesktopBackgroundCollectionClient } from "@/components/desktop-background-library";
import { DesktopLiveSourcePanel } from "@/components/desktop-live-source-panel";
import { persistDesktopPresenterLiveState } from "./desktop-live-actions";
import { createCloudRemotePairing, revokeCloudRemotePairing } from "./remote-pairing-actions";
import { deleteDesktopMotionPresetAction, saveDesktopMotionPresetAction } from "./desktop-motion-preset-actions";
import { saveDesktopSceneLayersAction } from "./desktop-scene-layer-actions";
import { deleteDesktopPptxAction, renameDesktopPptxAction, setDesktopPptxSlideViewModeAction } from "./desktop-pptx-actions";
import { setDesktopLyricShortcutAction } from "./desktop-lyric-shortcut-actions";
import { deleteDesktopLivePropPresetAction, saveDesktopLivePropPresetAction } from "./desktop-live-prop-actions";
import { isRemoteCommand, REMOTE_PROTOCOL_VERSION, type RemoteCommandAcknowledgement, type RemoteContentLibrary, type RemoteLiveSource, type RemoteLiveState } from "@/lib/presentation/control-protocol";
import { stageLayoutPreset, type StageLayoutPresetId } from "@/lib/desktop/stage-layout";
import type { AudienceLookLayout } from "@/lib/desktop/audience-looks";
import { formatRemotePairingPin, resolveRemoteChannelTarget } from "@/lib/presentation/remote-pairing";
import {
  buildLivePresentationSnapshot,
  isLivePresentationSnapshot,
  namespacedSlideId,
  type LivePresentationSnapshot,
  type PublishedPresentationSlide,
} from "@/lib/presentation/live-snapshot";
import { useRemoteCommandSubscription } from "@/lib/presentation/use-remote-command-subscription";
import { realtimeConnectionErrorMessage } from "@/lib/presentation/authenticated-realtime-channel";
import { savePresenterDraftAction } from "./presentation-draft-actions";
import { BIBLE_BOOKS } from "@/lib/bible/catalog";
import { resolveLyricShortcuts } from "@/lib/presentation/lyric-shortcuts";

const PRESENTER_TABS = ["Lyrics", "Property", "Layers", "Motion", "Stage"] as const;
type PresenterTab = (typeof PRESENTER_TABS)[number];

type BibleApiVerse = {
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
};

function isBibleApiVerse(value: unknown): value is BibleApiVerse {
  if (!value || typeof value !== "object") return false;
  const verse = value as Record<string, unknown>;
  return typeof verse.book_name === "string"
    && typeof verse.chapter === "number"
    && typeof verse.verse === "number"
    && typeof verse.text === "string";
}

type DesktopTeachingPresentation = {
  id: string;
  name: string;
  kind: "pptx" | "pdf";
  sizeBytes: number;
  slides: Array<{
    id: string;
    layers: SceneLayer[];
    mediaUrl?: string;
    renderedMediaUrl?: string;
    viewMode?: "original" | "edited";
    pdfPage?: number;
    preview?: string;
  }>;
  report: { importedText: number; warnings: string[] };
};

export type PresenterSetlist = {
  id: string;
  name: string;
  date: string;
  type: string;
  songs: Array<{
    id: string;
    order: number;
    assignedKey: string | null;
    song: {
      id?: string;
      title: string;
      bpm: number;
      originalKey: string;
      lyricsChords: string;
      notes?: string;
    };
  }>;
  presentationSettings?: {
    settings?: PresentationSettings;
    linesPerSlide?: number;
    slideOverrides?: Record<string, SlideBlock[]>;
    draftLyricsBySetlistSongId?: Record<string, string>;
    publishedRevision?: number;
    publishedSnapshot?: unknown;
  } | null;
};

function teachingPresentationSlides(presentation?: DesktopTeachingPresentation): PresentationSlide[] {
  if (!presentation) return [];
  return presentation.slides.map((slide) => ({
    id: slide.id,
    type: "teaching",
    content: [],
    sectionLabel: slide.pdfPage ? `${presentation.name} · Page ${slide.pdfPage}` : presentation.name,
    sceneLayers: slide.renderedMediaUrl && slide.viewMode !== "edited" ? [] : slide.layers,
    mediaUrl: slide.renderedMediaUrl && slide.viewMode !== "edited" ? slide.renderedMediaUrl : slide.mediaUrl,
    mediaKind: slide.pdfPage ? "pdf-page" : slide.renderedMediaUrl || slide.mediaUrl ? "image" : undefined,
    pdfPage: slide.pdfPage,
    teachingViewMode: slide.renderedMediaUrl ? slide.viewMode || "original" : undefined,
  }));
}

export default function GlobalPresenterClient({
  setlists,
  initialSetlistId,
  desktopMode = false,
  desktopBackgrounds = [],
  desktopBackgroundCollections = [],
  desktopSetlistBackgrounds = {},
  desktopMotionPresets = [],
  desktopSceneLayers = {},
  desktopLivePropPresets = [],
  desktopImportedPresentations = {},
  desktopLyricShortcuts = {},
}: {
  setlists: PresenterSetlist[];
  initialSetlistId?: string;
  desktopMode?: boolean;
  desktopBackgrounds?: DesktopBackgroundAssetClient[];
  desktopBackgroundCollections?: DesktopBackgroundCollectionClient[];
  desktopSetlistBackgrounds?: Record<string, DesktopBackgroundAssetClient | null>;
  desktopMotionPresets?: Array<{ id: string; name: string; motion: BlockMotion; updatedAt: string }>;
  desktopSceneLayers?: Record<string, Record<string, SceneLayer[]>>;
  desktopAudienceLooks?: Array<{ id: string; name: string; layout: AudienceLookLayout }>;
  desktopOutputConfigs?: Array<{ id: string; name: string; displayId: string | null; lookId: string | null; route: "projector" | "confidence" | "stream" | "lobby"; enabled: boolean }>;
  desktopLivePropPresets?: Array<{ id: string; name: string; prop: LiveProp; updatedAt: string }>;
  desktopImportedPresentations?: Record<string, DesktopTeachingPresentation[]>;
  desktopLyricShortcuts?: Record<string, Array<{ setlistSongId: string; slideId: string; keyCode: string }>>;
}) {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>(
    setlists.some((setlist) => setlist.id === initialSetlistId) ? initialSetlistId! : setlists[0]?.id || "",
  );
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectedSceneLayerId, setSelectedSceneLayerId] = useState<string | null>(null);
  const [selectedSceneLayerIds, setSelectedSceneLayerIds] = useState<string[]>([]);
  const [captureSources, setCaptureSources] = useState<Array<{ id: string; name: string; thumbnail?: string }>>([]);
  const [cameraSources, setCameraSources] = useState<Array<{ id: string; name: string }>>([]);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<PresenterTab>("Lyrics");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [playKey, setPlayKey] = useState<number>(0);
  const [outputMode, setOutputMode] = useState<"slide" | "clear" | "black" | "logo">("clear");
  const [outputStateVersion, setOutputStateVersion] = useState(0);
  const [lanPairing, setLanPairing] = useState<{ url?: string; qrDataUrl?: string } | null>(null);
  const [cloudPairing, setCloudPairing] = useState<Awaited<ReturnType<typeof createCloudRemotePairing>> | null>(null);
  const [cloudRemoteTopic, setCloudRemoteTopic] = useState<string | null>(null);
  const [cloudRemotePrivate, setCloudRemotePrivate] = useState(false);
  const [cloudRemoteExpiresAt, setCloudRemoteExpiresAt] = useState<string | null>(null);
  const [pairingClock, setPairingClock] = useState(() => Date.now());
  const [controllerLease, setControllerLease] = useState<{ owner: "remote" | "desktop"; id?: string; expiresAt: number } | null>(null);
  const [lastRemoteAcknowledgement, setLastRemoteAcknowledgement] = useState<RemoteCommandAcknowledgement | null>(null);
  const [remoteConnectionError, setRemoteConnectionError] = useState("");
  const [motionPresets, setMotionPresets] = useState(desktopMotionPresets);
  const [motionPresetName, setMotionPresetName] = useState("");
  const [selectedMotionPresetId, setSelectedMotionPresetId] = useState("");
  
  const setlist = useMemo(() => setlists.find(s => s.id === selectedSetlistId) || setlists[0], [selectedSetlistId, setlists]);
  
  // Presentation Settings
  const [settings, setSettings] = useState<PresentationSettings>(setlist?.presentationSettings?.settings || defaultPresentationSettings);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(setlist?.presentationSettings?.linesPerSlide || 4);
  const [slideOverrides, setSlideOverrides] = useState<Record<string, SlideBlock[]>>(setlist?.presentationSettings?.slideOverrides || {});
  const [sceneLayers, setSceneLayers] = useState<Record<string, SceneLayer[]>>(desktopSceneLayers[setlist?.id] || {});
  const [draftLyricsBySetlistSongId, setDraftLyricsBySetlistSongId] = useState<Record<string, string>>(
    setlist?.presentationSettings?.draftLyricsBySetlistSongId || {},
  );
  const [publishedRevision, setPublishedRevision] = useState<number>(setlist?.presentationSettings?.publishedRevision || 0);
  const [liveSongIndex, setLiveSongIndex] = useState(0);
  const [liveSlideId, setLiveSlideId] = useState<string | null>(null);
  const [liveSource, setLiveSource] = useState<RemoteLiveSource>({ kind: "lineup" });
  const [liveAuxiliarySlide, setLiveAuxiliarySlide] = useState<PresentationSlide | null>(null);
  const [publishedSnapshot, setPublishedSnapshot] = useState<LivePresentationSnapshot>(() => {
    const storedSnapshot = setlist?.presentationSettings?.publishedSnapshot;
    const localBackground = desktopMode ? desktopSetlistBackgrounds[setlist?.id] : undefined;
    if (isLivePresentationSnapshot(storedSnapshot) && storedSnapshot.setlistId === setlist?.id) {
      return {
        ...storedSnapshot,
        settings: {
          ...storedSnapshot.settings,
          backgroundMediaUrl: localBackground?.url,
          backgroundMediaType: localBackground?.mediaType,
        },
      };
    }
    return buildLivePresentationSnapshot({
      setlist: setlist || { id: "", name: "No setlist", songs: [] },
      revision: setlist?.presentationSettings?.publishedRevision || 0,
      linesPerSlide: setlist?.presentationSettings?.linesPerSlide || 4,
      settings: setlist?.presentationSettings?.settings || defaultPresentationSettings,
      draft: {
        lyricsBySetlistSongId: setlist?.presentationSettings?.draftLyricsBySetlistSongId || {},
        slideOverrides: setlist?.presentationSettings?.slideOverrides || {},
        sceneLayers: desktopSceneLayers[setlist?.id] || {},
      },
    });
  });

  // --- History & Undo/Redo State ---
  type HistoryState = { settings: PresentationSettings; slideOverrides: Record<string, SlideBlock[]> };
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  
  // --- Stage Display Controls ---
  const [stageMessageInput, setStageMessageInput] = useState("");
  const [stageFlashStyle, setStageFlashStyle] = useState({ fontSize: 56, color: "#ffffff", backgroundColor: "#dc2626" });
  const [stageLayoutPresetId, setStageLayoutPresetId] = useState<StageLayoutPresetId>("full");

  useEffect(() => {
    if (!desktopMode) return;
    void window.anointedDesktop?.listCaptureSources().then(setCaptureSources).catch(() => setCaptureSources([]));
    void navigator.mediaDevices?.enumerateDevices?.().then((devices) => setCameraSources(devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ id: device.deviceId, name: device.label || `Camera ${index + 1}` })))).catch(() => setCameraSources([]));
  }, [desktopMode]);
  const [countdownInput, setCountdownInput] = useState(5);
  const [countdownTarget, setCountdownTarget] = useState<number | null>(null);
  const [pausedCountdownMs, setPausedCountdownMs] = useState<number | null>(null);
  const [liveProp, setLiveProp] = useState<LiveProp | null>(null);
  const [propText, setPropText] = useState("");
  const [propSubtitle, setPropSubtitle] = useState("");
  const [propPresetName, setPropPresetName] = useState("");
  const [livePropPresets, setLivePropPresets] = useState(desktopLivePropPresets);
  const initialTeachingPresentations = desktopImportedPresentations[setlist?.id] || [];
  const teachingPresentationsBySetlistRef = useRef({ ...desktopImportedPresentations });
  const lyricShortcutsBySetlistRef = useRef({ ...desktopLyricShortcuts });
  const [pptxReport, setPptxReport] = useState<{ importedText: number; warnings: string[] } | null>(() => initialTeachingPresentations[0]?.report || null);
  const [isImportingPptx, setIsImportingPptx] = useState(false);
  const [teachingError, setTeachingError] = useState("");
  const [isTeachingDragActive, setIsTeachingDragActive] = useState(false);
  const [savedPptxPresentations, setSavedPptxPresentations] = useState<DesktopTeachingPresentation[]>(initialTeachingPresentations);
  const [selectedTeachingPresentationId, setSelectedTeachingPresentationId] = useState(initialTeachingPresentations[0]?.id || "");
  const [importedPptxSlides, setImportedPptxSlides] = useState<PresentationSlide[]>(() => teachingPresentationSlides(initialTeachingPresentations[0]));
  const [lyricShortcutOverrides, setLyricShortcutOverrides] = useState(() => desktopLyricShortcuts[setlist?.id] || []);
  const remoteContentLibrary = useMemo<RemoteContentLibrary>(() => ({
    version: 1,
    setlistId: setlist?.id || "",
    capabilities: { presentations: desktopMode, bible: true },
    presentations: desktopMode ? savedPptxPresentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      slides: presentation.slides.map((slide, index) => {
        const preview = slide.preview || slide.layers
          .filter((layer) => layer.kind === "text")
          .map((layer) => layer.text || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);
        return { id: slide.id, label: `Slide ${index + 1}`, preview };
      }),
    })) : [],
    lyricShortcuts: desktopMode ? publishedSnapshot.items.map((item) => {
      const custom = Object.fromEntries(
        lyricShortcutOverrides
          .filter((shortcut) => shortcut.setlistSongId === item.setlistSongId)
          .map((shortcut) => [shortcut.slideId, shortcut.keyCode]),
      );
      const resolved = resolveLyricShortcuts(item.slides.map((slide) => slide.id), custom);
      return {
        setlistSongId: item.setlistSongId,
        bindings: item.slides.flatMap((slide) => resolved[slide.id] ? [{ slideId: slide.id, keyCode: resolved[slide.id] }] : []),
      };
    }) : undefined,
    updatedAt: new Date().toISOString(),
  }), [desktopMode, lyricShortcutOverrides, publishedSnapshot.items, savedPptxPresentations, setlist?.id]);

  // A controller lease must visibly expire even when no other command arrives.
  useEffect(() => {
    if (!controllerLease) return;
    const delay = Math.max(0, controllerLease.expiresAt - Date.now());
    const timer = window.setTimeout(() => setControllerLease((current) => current?.expiresAt === controllerLease.expiresAt ? null : current), delay);
    return () => window.clearTimeout(timer);
  }, [controllerLease]);

  useEffect(() => {
    if (!cloudRemoteExpiresAt) return;
    const delay = Math.max(0, Date.parse(cloudRemoteExpiresAt) - Date.now());
    const timer = window.setTimeout(() => { setCloudRemoteTopic(null); setCloudRemotePrivate(false); setCloudRemoteExpiresAt(null); setCloudPairing(null); }, delay);
    return () => window.clearTimeout(timer);
  }, [cloudRemoteExpiresAt]);

  useEffect(() => {
    if (!cloudPairing) return;
    const timer = window.setInterval(() => setPairingClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [cloudPairing]);

  // --- Bible Controls ---
  const [bibleTranslation, setBibleTranslation] = useState("kjv");
  const [bibleVerses, setBibleVerses] = useState<{ reference: string, text: string }[]>([]);
  const [isFetchingBible, setIsFetchingBible] = useState(false);
  const [selectedBibleBook, setSelectedBibleBook] = useState("");
  const [selectedBibleChapter, setSelectedBibleChapter] = useState<number | null>(null);

  const saveHistoryState = () => {
    setPast(prev => [...prev.slice(-49), { settings, slideOverrides }]);
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [{ settings, slideOverrides }, ...prev]);
    setSettings(previous.settings);
    setSlideOverrides(previous.slideOverrides);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(prev => prev.slice(1));
    setPast(prev => [...prev, { settings, slideOverrides }]);
    setSettings(next.settings);
    setSlideOverrides(next.slideOverrides);
  };

  // Update local state when setlist changes
  useEffect(() => {
    if (!setlist) return;
    const nextSettings = { ...(setlist.presentationSettings?.settings || defaultPresentationSettings) } as PresentationSettings;
    if (desktopMode) {
      const localBackground = desktopSetlistBackgrounds[setlist.id];
      nextSettings.backgroundMediaUrl = localBackground?.url;
      nextSettings.backgroundMediaType = localBackground?.mediaType;
    }
    const nextDraftLyrics = setlist.presentationSettings?.draftLyricsBySetlistSongId || {};
    const nextRevision = setlist.presentationSettings?.publishedRevision || 0;
    const nextTeachingPresentations = teachingPresentationsBySetlistRef.current[setlist.id] || [];
    const storedSnapshot = setlist.presentationSettings?.publishedSnapshot;
    const timer = window.setTimeout(() => {
      setSettings(nextSettings);
      if (setlist.presentationSettings?.linesPerSlide) setLinesPerSlide(setlist.presentationSettings.linesPerSlide);
      if (setlist.presentationSettings?.slideOverrides) setSlideOverrides(setlist.presentationSettings.slideOverrides);
      setSceneLayers(desktopSceneLayers[setlist.id] || {});
      setDraftLyricsBySetlistSongId(nextDraftLyrics);
      setPublishedRevision(nextRevision);
      setLiveSongIndex(0);
      setLiveSlideId(null);
      setLiveSource({ kind: "lineup", setlistSongId: setlist.songs[0]?.id });
      setLiveAuxiliarySlide(null);
      setSavedPptxPresentations(nextTeachingPresentations);
      setSelectedTeachingPresentationId(nextTeachingPresentations[0]?.id || "");
      setImportedPptxSlides(teachingPresentationSlides(nextTeachingPresentations[0]));
      setPptxReport(nextTeachingPresentations[0]?.report || null);
      setLyricShortcutOverrides(lyricShortcutsBySetlistRef.current[setlist.id] || []);
      setPublishedSnapshot(isLivePresentationSnapshot(storedSnapshot) && storedSnapshot.setlistId === setlist.id
        ? { ...storedSnapshot, settings: nextSettings }
        : buildLivePresentationSnapshot({
            setlist,
            revision: nextRevision,
            linesPerSlide: setlist.presentationSettings?.linesPerSlide || 4,
            settings: nextSettings,
            draft: {
              lyricsBySetlistSongId: nextDraftLyrics,
              slideOverrides: setlist.presentationSettings?.slideOverrides || {},
              sceneLayers: desktopSceneLayers[setlist.id] || {},
            },
          }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [desktopMode, desktopSceneLayers, desktopSetlistBackgrounds, setlist]);
  
  const supabase = useMemo(() => createOptionalClient(), []);
  const channel = useMemo(() => supabase?.channel(`setlist_${setlist?.id}`) ?? null, [setlist?.id, supabase]);
  const remoteChannelTarget = useMemo(
    () => resolveRemoteChannelTarget({
      setlistId: setlist?.id,
      cloudTopic: cloudRemoteTopic,
      cloudPrivate: cloudRemotePrivate,
      expiresAt: cloudRemoteExpiresAt,
    }),
    [cloudRemoteExpiresAt, cloudRemotePrivate, cloudRemoteTopic, setlist?.id],
  );
  const remoteChannel = useMemo(
    () => supabase?.channel(remoteChannelTarget.topic, remoteChannelTarget.options) ?? null,
    [remoteChannelTarget, supabase],
  );
  const applyRemoteCommandRef = useRef<(candidate: unknown) => Promise<void>>(async () => {});
  const desktopChannel = useMemo(
    () => typeof window !== "undefined" && window.anointedDesktop && setlist?.id ? new BroadcastChannel(`setlist_${setlist.id}`) : null,
    [setlist],
  );
  const broadcast = useCallback((event: string, payload: unknown) => {
    if (desktopChannel) desktopChannel.postMessage({ event, payload });
    else channel?.send({ type: "broadcast", event, payload });
  }, [channel, desktopChannel]);

  useEffect(() => {
    if (!setlist) return;
    if (desktopChannel) return () => desktopChannel.close();
    if (!channel || !supabase) return;
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channel, desktopChannel, supabase, setlist]);

  const saveDraft = async (revision = publishedRevision, snapshot = publishedSnapshot) => {
    if (!setlist) return;
    setIsSaving(true);
    setDraftMessage("");
    const syncableSettings = { ...settings };
    delete syncableSettings.backgroundMediaUrl;
    delete syncableSettings.backgroundMediaType;
    const payload = {
      settings: desktopMode ? syncableSettings : settings,
      linesPerSlide,
      slideOverrides,
      draftLyricsBySetlistSongId,
      publishedRevision: revision,
      publishedSnapshot: desktopMode
        ? { ...snapshot, settings: syncableSettings }
        : snapshot,
    };
    try {
      await savePresenterDraftAction(setlist.id, payload);
      setDraftMessage(desktopMode ? "Draft saved on this PC and queued for sync." : "Draft saved.");
      return payload;
    } catch (error) {
      console.error("Failed to save Presenter draft:", error);
      setDraftMessage(error instanceof Error ? error.message : "Failed to save the Presenter draft.");
      return undefined;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = () => saveDraft();

  const liveItem = publishedSnapshot.items[liveSongIndex];
  const liveSlides = useMemo(() => liveItem?.slides || [], [liveItem]);
  const liveActiveSlide = liveSlideId
    ? liveSlides.find((slide) => slide.id === liveSlideId) || null
    : null;
  const currentOutputSlide = liveSource.kind === "lineup" ? liveActiveSlide : liveAuxiliarySlide;
  const remoteLiveSlides = useMemo(
    () => liveSource.kind === "lineup" ? liveSlides : liveAuxiliarySlide ? [liveAuxiliarySlide] : [],
    [liveAuxiliarySlide, liveSlides, liveSource.kind],
  );

  const pushToProjector = async (
    slide: PresentationSlide | null,
    nextOutputMode: "slide" | "clear" | "black" | "logo" = "slide",
    snapshot = publishedSnapshot,
    ownerIndexOverride?: number,
  ) => {
    const ownerIndex = ownerIndexOverride ?? (slide
      ? snapshot.items.findIndex((item) => item.slides.some((candidate) => candidate.id === slide.id))
      : liveSongIndex);
    const owner = snapshot.items[Math.max(0, ownerIndex)] || snapshot.items[0];
    const ownerSlides = owner?.slides || [];
    const slideIndex = slide ? ownerSlides.findIndex((item) => item.id === slide.id) : -1;
    if (ownerIndex >= 0) setLiveSongIndex(ownerIndex);
    setLiveSlideId(slide?.id || null);
    setOutputMode(nextOutputMode);
    const payload = {
      slide,
      nextSlide: slideIndex >= 0 ? ownerSlides[slideIndex + 1] ?? null : null,
      speakerNotes: owner?.notes || "",
      settings: snapshot.settings,
      outputMode: nextOutputMode,
      activeSlideId: slide?.id || null,
      snapshotRevision: snapshot.revision,
    };
    broadcast("projector_sync", payload);
    if (desktopMode) await persistDesktopPresenterLiveState(setlist.id, payload);
    return payload;
  };

  const activeItem = setlist?.songs[activeItemIndex];
  
  const slides = useMemo(() => {
    if (activeItemIndex === -3) {
      return importedPptxSlides;
    }
    if (activeItemIndex === -2) {
      return bibleVerses.map(v => ({
         id: `bible-${v.reference.replace(/\s+/g, '-')}`,
         type: "lyrics",
         content: [v.text],
         sectionLabel: v.reference
      } as PresentationSlide));
    }
    if (!activeItem) return [];
    const lyricsChords = draftLyricsBySetlistSongId[activeItem.id] ?? activeItem.song.lyricsChords;
    return generateSongSlides(lyricsChords, linesPerSlide).map((slide) => ({
      ...slide,
      id: namespacedSlideId(activeItem.id, slide.id),
    }));
  }, [activeItem, activeItemIndex, bibleVerses, draftLyricsBySetlistSongId, importedPptxSlides, linesPerSlide]);

  const activeSlide = useMemo(() => slides.find(s => s.id === activeSlideId), [slides, activeSlideId]);
  const activeSlideIndex = useMemo(() => slides.findIndex((slide) => slide.id === activeSlideId), [slides, activeSlideId]);
  const openTeachingPresentation = (presentation: DesktopTeachingPresentation) => {
    const nextSlides = teachingPresentationSlides(presentation);
    setSelectedTeachingPresentationId(presentation.id);
    setImportedPptxSlides(nextSlides);
    setPptxReport(presentation.report);
    setActiveItemIndex(-3);
    setActiveSlideId(nextSlides[0]?.id || null);
    setTeachingError("");
  };

  const importTeachingFiles = async (files: FileList | File[]) => {
    if (!desktopMode || !setlist || isImportingPptx) return;
    const candidates = Array.from(files);
    if (!candidates.length) return;
    setIsImportingPptx(true);
    setTeachingError("");
    try {
      let latest: DesktopTeachingPresentation | undefined;
      const importedItems: DesktopTeachingPresentation[] = [];
      for (const file of candidates) {
        if (!/\.(?:pdf|pptx)$/i.test(file.name)) throw new Error(`${file.name}: choose a PDF or PowerPoint .pptx file.`);
        if (!file.size) throw new Error(`${file.name}: the selected file is empty.`);
        if (file.size > 500 * 1024 * 1024) throw new Error(`${file.name}: Teaching files must be smaller than 500 MB.`);
        const parameters = new URLSearchParams({ setlistId: setlist.id, name: file.name });
        const response = await fetch(`/api/desktop/teaching?${parameters}`, {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || `${file.name} could not be imported.`);
        latest = result as DesktopTeachingPresentation;
        importedItems.push(latest);
      }
      setSavedPptxPresentations((current) => {
        const next = [...current, ...importedItems];
        teachingPresentationsBySetlistRef.current[setlist.id] = next;
        return next;
      });
      if (latest) openTeachingPresentation(latest);
      setDraftMessage(`${importedItems.length} Teaching file${importedItems.length === 1 ? "" : "s"} saved to ${setlist.name}. Live output was not changed.`);
    } catch (error) {
      setTeachingError(error instanceof Error ? error.message : "The Teaching file could not be imported.");
    } finally {
      setIsImportingPptx(false);
      setIsTeachingDragActive(false);
    }
  };

  const removeTeachingPresentation = async (presentation: DesktopTeachingPresentation) => {
    if (!setlist) return;
    try {
      await deleteDesktopPptxAction(setlist.id, presentation.id);
      const remaining = savedPptxPresentations.filter((item) => item.id !== presentation.id);
      teachingPresentationsBySetlistRef.current[setlist.id] = remaining;
      setSavedPptxPresentations(remaining);
      if (selectedTeachingPresentationId === presentation.id) {
        setSelectedTeachingPresentationId("");
        setImportedPptxSlides([]);
        setPptxReport(null);
        setActiveSlideId(null);
        setActiveItemIndex(-1);
      }
      setDraftMessage(`${presentation.name} was removed from ${setlist.name}.`);
    } catch (error) {
      setTeachingError(error instanceof Error ? error.message : "The Teaching file could not be removed.");
    }
  };

  const changeTeachingSlideViewMode = async (viewMode: "original" | "edited") => {
    if (!selectedTeachingPresentationId || !activeSlideId) return;
    const presentation = savedPptxPresentations.find((item) => item.id === selectedTeachingPresentationId);
    const storedSlide = presentation?.slides.find((slide) => slide.id === activeSlideId);
    if (!presentation || !storedSlide?.renderedMediaUrl || storedSlide.viewMode === viewMode) return;
    setTeachingError("");
    try {
      await setDesktopPptxSlideViewModeAction(presentation.id, storedSlide.id, viewMode);
      const updatedPresentation: DesktopTeachingPresentation = {
        ...presentation,
        slides: presentation.slides.map((slide) => slide.id === storedSlide.id ? { ...slide, viewMode } : slide),
      };
      for (const [setlistId, teachingFiles] of Object.entries(teachingPresentationsBySetlistRef.current)) {
        teachingPresentationsBySetlistRef.current[setlistId] = teachingFiles.map((item) =>
          item.id === presentation.id ? updatedPresentation : item
        );
      }
      setSavedPptxPresentations((current) => current.map((item) => item.id === presentation.id ? updatedPresentation : item));
      setImportedPptxSlides(teachingPresentationSlides(updatedPresentation));
      setSelectedSceneLayerId(null);
      setSelectedSceneLayerIds([]);
      if (viewMode === "edited") setActiveTab("Layers");
      setDraftMessage(viewMode === "original"
        ? "Showing the exact PowerPoint slide. Live output was not changed."
        : "Edit mode opened. Changes stay local until you present this slide.");
    } catch (error) {
      setTeachingError(error instanceof Error ? error.message : "The PowerPoint view could not be changed.");
    }
  };

  const sendRemoteEvent = useCallback((event: string, payload: unknown) => {
    if (desktopChannel) desktopChannel.postMessage({ event, payload });
    if (!desktopMode || cloudRemoteTopic) {
      void remoteChannel?.send({ type: "broadcast", event, payload });
    }
  }, [cloudRemoteTopic, desktopChannel, desktopMode, remoteChannel]);

  const handlePublishSnapshot = async () => {
    if (!setlist || isPublishing) return;
    setIsPublishing(true);
    setDraftMessage("");
    const nextRevision = publishedRevision + 1;
    const nextSnapshot = buildLivePresentationSnapshot({
      setlist,
      revision: nextRevision,
      linesPerSlide,
      settings,
      draft: {
        lyricsBySetlistSongId: draftLyricsBySetlistSongId,
        slideOverrides,
        sceneLayers,
      },
    });
    const saved = await saveDraft(nextRevision, nextSnapshot);
    if (!saved) {
      setIsPublishing(false);
      return;
    }
    const matchingLiveSlide = liveSlideId
      ? nextSnapshot.items.flatMap((item) => item.slides).find((slide) => slide.id === liveSlideId)
      : undefined;
    setPublishedRevision(nextRevision);
    setPublishedSnapshot(nextSnapshot);
    sendRemoteEvent("presentation_snapshot", nextSnapshot);
    if (matchingLiveSlide) {
      await pushToProjector(matchingLiveSlide, outputMode, nextSnapshot);
      setDraftMessage(`Update ${nextRevision} published to Worship Remote and the current live slide.`);
    } else {
      setDraftMessage(liveSlideId
        ? `Update ${nextRevision} published to Worship Remote. The live slide was removed, so the current output was left unchanged.`
        : `Update ${nextRevision} published to Worship Remote.`);
    }
    setIsPublishing(false);
  };

  const handleCreateCloudPairing = async () => {
    try {
      setDraftMessage("");
      const pairing = await createCloudRemotePairing(setlist.id);
      setCloudRemoteTopic(pairing.channelTopic);
      setCloudRemotePrivate(pairing.privateChannel);
      setCloudRemoteExpiresAt(pairing.expiresAt);
      setPairingClock(Date.now());
      setCloudPairing(pairing);
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : "Could not create the phone pairing code.");
    }
  };

  const handleStopCloudPairing = async () => {
    const sessionId = cloudPairing?.sessionId;
    setCloudPairing(null);
    setCloudRemoteTopic(null);
    setCloudRemotePrivate(false);
    setCloudRemoteExpiresAt(null);
    if (!sessionId) return;
    const revoked = await revokeCloudRemotePairing(sessionId);
    if (!revoked) setDraftMessage("The phone session ended locally, but the server could not confirm revocation.");
  };

  const ensureProjector = async (displayId?: string) => {
    if (!desktopMode || !window.anointedDesktop) return;
    const status = await window.anointedDesktop.getOutputStatus();
    if (status.projectorOpen && status.projectorReady && !displayId) return;
    const result = await window.anointedDesktop.openProjector(setlist.id, displayId);
    if (!result?.opened || result.ready === false) throw new Error(result?.error || "The projector window could not be opened.");
    setOutputStateVersion((version) => version + 1);
  };
  const projectorActionsRef = useRef({ ensureProjector, pushToProjector });
  useEffect(() => {
    projectorActionsRef.current = { ensureProjector, pushToProjector };
  });

  // The Presenter editor remains open as the trusted executor. Remote owns the
  // live controls and only operates the last explicitly published snapshot.
  useEffect(() => {
    if (!setlist) return;
    const applyCommand = async (candidate: unknown) => {
      if (!isRemoteCommand(candidate) || candidate.setlistId !== setlist.id) return;
      const command = candidate;
      const acknowledge = (status: RemoteCommandAcknowledgement["status"], message: string) => {
        const acknowledgement: RemoteCommandAcknowledgement = {
          commandId: command.id,
          status,
          message,
          snapshotRevision: publishedSnapshot.revision,
          updatedAt: new Date().toISOString(),
        };
        setLastRemoteAcknowledgement(acknowledgement);
        sendRemoteEvent("remote_ack", acknowledgement);
      };
      try {
        const now = Date.now();
        const currentLease = controllerLease && controllerLease.expiresAt > now ? controllerLease : null;
        if (command.kind === "claim-control") {
          if (!command.controllerId) { acknowledge("rejected", "Remote identity is missing."); return; }
          if (currentLease?.owner === "desktop") { acknowledge("rejected", "Desktop has taken control."); return; }
          if (currentLease?.owner === "remote" && currentLease.id !== command.controllerId) { acknowledge("rejected", "Another Remote is controlling this service."); return; }
          setControllerLease({ owner: "remote", id: command.controllerId, expiresAt: now + 5 * 60_000 });
          sendRemoteEvent("presentation_snapshot", publishedSnapshot);
          sendRemoteEvent("remote_library", remoteContentLibrary);
          acknowledge("applied", "Remote control granted.");
          return;
        }
        if (!command.controllerId) { acknowledge("rejected", "Remote identity is missing."); return; }
        if (currentLease?.owner === "desktop") { acknowledge("rejected", "Desktop has taken control."); return; }
        if (currentLease?.owner === "remote" && currentLease.id !== command.controllerId) { acknowledge("rejected", "Another Remote is controlling this service."); return; }
        if (command.snapshotRevision !== undefined && command.snapshotRevision !== publishedSnapshot.revision) {
          sendRemoteEvent("presentation_snapshot", publishedSnapshot);
          acknowledge("rejected", "The Presenter was updated. Remote content has been refreshed; try the command again.");
          return;
        }
        setControllerLease({ owner: "remote", id: command.controllerId, expiresAt: now + 5 * 60_000 });

        if (command.kind === "select-song") {
          const requestedIndex = command.payload?.setlistSongId
            ? publishedSnapshot.items.findIndex((item) => item.setlistSongId === command.payload?.setlistSongId)
            : Number(command.payload?.songIndex);
          if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= publishedSnapshot.items.length) {
            acknowledge("rejected", "That lineup item is unavailable.");
            return;
          }
          setLiveSongIndex(requestedIndex);
          setLiveSource({ kind: "lineup", setlistSongId: publishedSnapshot.items[requestedIndex]?.setlistSongId });
          setLiveAuxiliarySlide(null);
          await projectorActionsRef.current.pushToProjector(null, "clear", publishedSnapshot, requestedIndex);
          acknowledge("applied", "Lineup item selected and output cleared.");
          return;
        }

        if (command.kind === "present-presentation-slide") {
          const presentation = savedPptxPresentations.find((item) => item.id === command.payload?.presentationId);
          const storedSlide = presentation?.slides.find((slide) => slide.id === command.payload?.slideId);
          if (!presentation || !storedSlide) {
            acknowledge("rejected", "That presentation slide is unavailable on this PC.");
            return;
          }
          const slide = teachingPresentationSlides(presentation).find((item) => item.id === storedSlide.id)!;
          await projectorActionsRef.current.ensureProjector();
          setLiveSource({ kind: "presentation", presentationId: presentation.id, presentationName: presentation.name });
          setLiveAuxiliarySlide(slide);
          await projectorActionsRef.current.pushToProjector(slide);
          acknowledge("applied", `${presentation.name} presented on the projector.`);
          return;
        }

        if (command.kind === "set-lyric-shortcut") {
          if (!desktopMode) { acknowledge("rejected", "Lyric shortcuts require the Windows Presenter."); return; }
          const setlistSongId = command.payload?.setlistSongId;
          const slideId = command.payload?.slideId;
          const item = publishedSnapshot.items.find((candidate) => candidate.setlistSongId === setlistSongId);
          if (!setlistSongId || !item || !slideId || !item.slides.some((slide) => slide.id === slideId)) {
            acknowledge("rejected", "That lyric slide is unavailable in the published lineup.");
            return;
          }
          await setDesktopLyricShortcutAction({
            setlistId: setlist.id,
            setlistSongId,
            slideId,
            keyCode: command.payload?.keyCode,
          });
          setLyricShortcutOverrides((current) => {
            const next = [
              ...current.filter((shortcut) => !(shortcut.setlistSongId === setlistSongId && shortcut.slideId === slideId)
                && !(command.payload?.keyCode && shortcut.setlistSongId === setlistSongId && shortcut.keyCode === command.payload.keyCode)),
              ...(command.payload?.keyCode ? [{ setlistSongId, slideId, keyCode: command.payload.keyCode }] : []),
            ];
            lyricShortcutsBySetlistRef.current[setlist.id] = next;
            return next;
          });
          acknowledge("applied", command.payload?.keyCode ? "Lyric shortcut saved." : "Lyric shortcut reset to its default.");
          return;
        }

        if (command.kind === "present-bible-verse") {
          const reference = command.payload?.reference?.trim();
          const text = command.payload?.text?.trim();
          const translation = command.payload?.translation;
          if (!reference || !text || !translation) {
            acknowledge("rejected", "That Bible verse is incomplete.");
            return;
          }
          const slide: PresentationSlide = {
            id: `remote-bible:${translation}:${reference.replace(/\s+/g, "-")}`,
            type: "lyrics",
            content: [text],
            sectionLabel: `${reference} (${translation.toUpperCase()})`,
          };
          await projectorActionsRef.current.ensureProjector();
          setLiveSource({ kind: "bible", reference, translation });
          setLiveAuxiliarySlide(slide);
          await projectorActionsRef.current.pushToProjector(slide);
          acknowledge("applied", `${reference} presented on the projector.`);
          return;
        }

        const currentItem = publishedSnapshot.items[liveSongIndex] || publishedSnapshot.items[0];
        const activePresentation = liveSource.kind === "presentation"
          ? savedPptxPresentations.find((item) => item.id === liveSource.presentationId)
          : undefined;
        const activePresentationSlides = teachingPresentationSlides(activePresentation);
        const currentSlides: PresentationSlide[] = liveSource.kind === "presentation"
          ? activePresentationSlides
          : liveSource.kind === "bible" && liveAuxiliarySlide
            ? [liveAuxiliarySlide]
            : currentItem?.slides || [];
        const currentIndex = currentSlides.findIndex((slide) => slide.id === liveSlideId);
        if (command.kind === "select-slide" && command.payload?.slideId) {
          let selectedSlide: PublishedPresentationSlide | undefined;
          for (const item of publishedSnapshot.items) {
            selectedSlide = item.slides.find((slide) => slide.id === command.payload?.slideId);
            if (selectedSlide) break;
          }
          if (!selectedSlide) { acknowledge("rejected", "That slide is unavailable in the published lineup."); return; }
          await projectorActionsRef.current.ensureProjector();
          setLiveSource({ kind: "lineup", setlistSongId: selectedSlide.setlistSongId });
          setLiveAuxiliarySlide(null);
          await projectorActionsRef.current.pushToProjector(selectedSlide);
          acknowledge("applied", "Slide presented on the projector.");
          return;
        }
        if (command.kind === "first-slide" || command.kind === "last-slide" || command.kind === "previous-slide" || command.kind === "next-slide" || command.kind === "present") {
          const target = command.kind === "first-slide"
            ? currentSlides[0]
            : command.kind === "last-slide"
              ? currentSlides[currentSlides.length - 1]
              : command.kind === "previous-slide"
                ? currentSlides[Math.max(0, currentIndex - 1)] ?? currentSlides[0]
                : command.kind === "next-slide"
                  ? currentSlides[Math.min(currentSlides.length - 1, Math.max(0, currentIndex) + 1)]
                : currentOutputSlide ?? currentSlides[0];
          if (!target) { acknowledge("rejected", "There are no published slides to present."); return; }
          await projectorActionsRef.current.ensureProjector();
          if (liveSource.kind !== "lineup") setLiveAuxiliarySlide(target);
          await projectorActionsRef.current.pushToProjector(target);
          acknowledge("applied", `${command.kind === "present" ? "Live output" : "Slide"} presented on the projector.`);
          return;
        }
        if (command.kind === "clear" || command.kind === "black" || command.kind === "logo") {
          await projectorActionsRef.current.ensureProjector();
          await projectorActionsRef.current.pushToProjector(null, command.kind);
          acknowledge("applied", `${command.kind[0].toUpperCase()}${command.kind.slice(1)} output applied.`);
          return;
        }
        if (command.kind === "refresh-displays") {
          await window.anointedDesktop?.listDisplays();
          setOutputStateVersion((version) => version + 1);
          acknowledge("applied", "Displays refreshed.");
          return;
        }
        if (command.kind === "present-projector") {
          await projectorActionsRef.current.ensureProjector(command.payload?.displayId);
          await projectorActionsRef.current.pushToProjector(currentOutputSlide, outputMode);
          acknowledge("applied", "Projector is open and synchronized.");
          return;
        }
        if (command.kind === "present-confidence") {
          const result = await window.anointedDesktop?.openConfidence(setlist.id, command.payload?.displayId);
          if (desktopMode && (!result?.opened || result.ready === false)) throw new Error(result?.error || "The confidence display could not be opened.");
          setOutputStateVersion((version) => version + 1);
          acknowledge("applied", "Confidence display is open and synchronized.");
          return;
        }
        if (command.kind === "stage-message") {
          const stageMessage = command.payload?.message || "";
          const requestedStyle = command.payload?.stageFlashStyle;
          const nextStageFlashStyle = requestedStyle && Number.isFinite(requestedStyle.fontSize)
            ? {
                fontSize: Math.max(16, Math.min(160, requestedStyle.fontSize)),
                color: requestedStyle.color,
                backgroundColor: requestedStyle.backgroundColor,
              }
            : stageFlashStyle;
          setStageMessageInput(stageMessage);
          setStageFlashStyle(nextStageFlashStyle);
          broadcast("stage_sync", { stageMessage, stageFlashStyle: nextStageFlashStyle });
          acknowledge("applied", stageMessage ? "Flash note sent." : "Flash note cleared.");
          return;
        }
        if (command.kind === "timer") {
          if (command.payload?.timerAction === "reset") { setCountdownTarget(null); setPausedCountdownMs(null); broadcast("stage_sync", { countdownTarget: null, countdownPausedMs: null }); }
          if (command.payload?.timerAction === "pause" && countdownTarget) { const remaining = Math.max(0, countdownTarget - Date.now()); setPausedCountdownMs(remaining); setCountdownTarget(null); broadcast("stage_sync", { countdownTarget: null, countdownPausedMs: remaining }); }
          if (command.payload?.timerAction === "start") { const duration = Math.max(1, Math.min(240, command.payload?.timerMinutes ?? countdownInput)) * 60_000; const target = Date.now() + (pausedCountdownMs ?? duration); setCountdownTarget(target); setPausedCountdownMs(null); broadcast("stage_sync", { countdownTarget: target, countdownPausedMs: null }); }
          acknowledge("applied", "Countdown updated.");
          return;
        }
        acknowledge("rejected", "That command is incomplete or unavailable.");
      } catch (error) {
        acknowledge("rejected", error instanceof Error ? error.message : "The live output command failed.");
      }
    };
    applyRemoteCommandRef.current = applyCommand;
    let removeDesktopListener: (() => void) | undefined;
    if (desktopChannel) {
      const listener = (event: MessageEvent) => {
        if (event.data?.event === "remote_command") void applyCommand(event.data.payload);
        if (event.data?.event === "remote_state_request" || event.data?.event === "presentation_state_request") {
          sendRemoteEvent("presentation_snapshot", publishedSnapshot);
          sendRemoteEvent("remote_library", remoteContentLibrary);
          void projectorActionsRef.current.pushToProjector(currentOutputSlide, outputMode);
          broadcast("stage_sync", {
            stageMessage: stageMessageInput,
            stageFlashStyle,
            countdownTarget,
            countdownPausedMs: pausedCountdownMs,
            stageLayout: stageLayoutPreset(stageLayoutPresetId),
          });
        }
      };
      desktopChannel.addEventListener("message", listener);
      const removeLanListener = window.anointedDesktop?.onLanRemoteCommand((command) => { void applyCommand(command); });
      removeDesktopListener = () => { desktopChannel.removeEventListener("message", listener); removeLanListener?.(); };
    }
    return () => { removeDesktopListener?.(); };
  }, [broadcast, controllerLease, countdownInput, countdownTarget, currentOutputSlide, desktopChannel, desktopMode, liveAuxiliarySlide, liveSlideId, liveSongIndex, liveSource, outputMode, pausedCountdownMs, publishedSnapshot, remoteContentLibrary, savedPptxPresentations, sendRemoteEvent, setlist, stageFlashStyle, stageLayoutPresetId, stageMessageInput]);

  useRemoteCommandSubscription(
    remoteChannel,
    supabase,
    (candidate) => applyRemoteCommandRef.current(candidate),
    (status, error) => {
      if (status === "SUBSCRIBED") {
        setRemoteConnectionError("");
      } else if (error) {
        setRemoteConnectionError(realtimeConnectionErrorMessage(error));
      }
    },
  );

  useEffect(() => {
    if (!setlist) return;
    const publishState = async () => {
      const [desktopStatus, displays] = desktopMode && window.anointedDesktop
        ? await Promise.all([window.anointedDesktop.getOutputStatus(), window.anointedDesktop.listDisplays()])
        : [undefined, undefined];
      const state: RemoteLiveState = {
        version: REMOTE_PROTOCOL_VERSION,
        setlistId: setlist.id,
        activeSongIndex: liveSongIndex,
        activeSlideId: liveSlideId,
        snapshotRevision: publishedSnapshot.revision,
        outputMode,
        controllerReady: true,
        projectorOpen: Boolean(desktopStatus?.projectorOpen),
        projectorReady: Boolean(desktopStatus?.projectorReady ?? desktopStatus?.projectorOpen),
        confidenceOpen: Boolean(desktopStatus?.confidenceOpen),
        confidenceReady: Boolean(desktopStatus?.confidenceReady ?? desktopStatus?.confidenceOpen),
        outputError: desktopStatus?.outputError ?? null,
        projectorDisplayId: desktopStatus?.projectorDisplayId,
        confidenceDisplayId: desktopStatus?.confidenceDisplayId,
        displays,
        controller: controllerLease && controllerLease.expiresAt > Date.now() ? controllerLease.owner : null,
        activeSource: liveSource,
        lastAcknowledgement: lastRemoteAcknowledgement,
        updatedAt: new Date().toISOString(),
      };
      sendRemoteEvent("remote_state", state);
      if (desktopMode && window.anointedDesktop) {
        window.anointedDesktop.publishLanRemoteState({
          ...state,
          setlistName: publishedSnapshot.setlistName,
          lineup: publishedSnapshot.items.map((item) => ({ title: item.title, setlistSongId: item.setlistSongId })),
          slides: remoteLiveSlides.map((slide) => ({ id: slide.id, type: slide.type, content: slide.content, sectionLabel: slide.sectionLabel })),
          remoteLibrary: remoteContentLibrary,
        });
      }
    };
    void publishState();
    const heartbeat = window.setInterval(() => { void publishState(); }, 2_000);
    return () => window.clearInterval(heartbeat);
  }, [controllerLease, desktopChannel, desktopMode, lastRemoteAcknowledgement, liveSlideId, liveSongIndex, liveSource, outputMode, outputStateVersion, publishedSnapshot, remoteChannel, remoteContentLibrary, remoteLiveSlides, sendRemoteEvent, setlist]);

  useEffect(() => {
    sendRemoteEvent("presentation_snapshot", publishedSnapshot);
  }, [publishedSnapshot, sendRemoteEvent]);

  useEffect(() => {
    sendRemoteEvent("remote_library", remoteContentLibrary);
  }, [remoteContentLibrary, sendRemoteEvent]);
  
  const defaultBlocks = useMemo(() => {
     if (!activeSlide || activeSlide.content.length === 0) return [];
     const totalLines = activeSlide.content.length;
     
     // Auto-fit: same formula as projector — fill the canvas both horizontally and vertically
     const maxLineLength = Math.max(...activeSlide.content.map(line => line.length), 1);
     // Horizontal: safe max font size (pt) is approx 2200 / chars
     const hFit = 2200 / maxLineLength;
     // Vertical: screen height is ~810pt. Lines take (fontSize * 1.3) each
     const vFit = 810 / (totalLines * 1.3);
     const autoFontSize = Math.min(hFit, vFit, settings.fontSize);
     const effectiveFontSize = Math.max(8, Math.round(autoFontSize));
     
     // Gap is percentage of screen height: (fontSize * 1.3 / 810) * 100 ≈ fontSize * 0.16
     const gap = effectiveFontSize * 0.16;
     const startY = 50 - ((totalLines - 1) * (gap / 2));
     return activeSlide.content.map((line, idx) => ({
        id: `default-${activeSlide.id}-${idx}`,
        text: line,
        x: 50,
        y: startY + (idx * gap),
        startTime: idx * 0.5,
        duration: 2
     } as SlideBlock));
  }, [activeSlide, settings.fontSize]);

  const activeBlocks = useMemo(
    () => activeSlideId ? slideOverrides[activeSlideId] || defaultBlocks : [],
    [activeSlideId, defaultBlocks, slideOverrides],
  );
  const selectedBlock = useMemo(() => {
    if (selectedBlockIds.length === 0 || !activeBlocks) return null;
    return activeBlocks.find(b => selectedBlockIds.includes(b.id)) || null;
  }, [selectedBlockIds, activeBlocks]);

  const displayFontSize = useMemo(() => {
    if (selectedBlock?.fontSize !== undefined) return selectedBlock.fontSize;
    if (selectedBlock && activeBlocks) {
      const maxBlockLen = Math.max(...activeBlocks.map(b => b.text.length), 1);
      const hFit = 2200 / maxBlockLen;
      const vFit = 810 / (activeBlocks.length * 1.3);
      return Math.max(8, Math.round(Math.min(settings.fontSize, hFit, vFit)));
    }
    return settings.fontSize;
  }, [selectedBlock, settings.fontSize, activeBlocks]);

  const handleUpdateSelectedBlock = (updates: Partial<SlideBlock>) => {
    if (selectedBlockIds.length === 0 || !activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || defaultBlocks;
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => selectedBlockIds.includes(b.id) ? { ...b, ...updates } : b)
      };
    });
  };
  const selectedMotion = useMemo(() => selectedBlock ? resolveBlockMotion(selectedBlock, settings) : null, [selectedBlock, settings]);
  const applyMotionPreset = (motion: BlockMotion, toAllLayers: boolean) => {
    if (!activeSlideId || activeBlocks.length === 0) return;
    const targetIds = toAllLayers ? new Set(activeBlocks.map((block) => block.id)) : new Set(selectedBlockIds);
    if (targetIds.size === 0) return;
    saveHistoryState();
    setSlideOverrides((previous) => {
      const currentBlocks = previous[activeSlideId] || defaultBlocks;
      return {
        ...previous,
        [activeSlideId]: currentBlocks.map((block) => targetIds.has(block.id) ? { ...block, ...motion } : block),
      };
    });
  };
  const saveMotionPreset = async () => {
    if (!selectedMotion || !motionPresetName.trim()) return;
    const presets = await saveDesktopMotionPresetAction(motionPresetName, selectedMotion);
    setMotionPresets(presets);
    setMotionPresetName("");
  };
  const handleUpdateBlock = (blockId: string, updates: Partial<SlideBlock>) => {
    if (!activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || defaultBlocks;
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
      };
    });
  };
  const updateSceneLayers = async (nextLayers: SceneLayer[]) => {
    if (!desktopMode || !setlist || !activeSlideId) return;
    setSceneLayers((previous) => ({ ...previous, [activeSlideId]: nextLayers }));
    const saved = await saveDesktopSceneLayersAction(setlist.id, activeSlideId, nextLayers);
    setSceneLayers(saved);
  };
  const addSceneLayer = (kind: SceneLayer["kind"], captureSourceId?: string) => {
    if (!activeSlideId) return;
    const current = sceneLayers[activeSlideId] || [];
    const number = current.length + 1;
    const layer: SceneLayer = {
      id: crypto.randomUUID(), kind, name: `${kind[0].toUpperCase()}${kind.slice(1)} ${number}`,
      x: 10 + (number % 5) * 4, y: 10 + (number % 5) * 4, width: kind === "text" ? 50 : 30, height: kind === "text" ? 14 : 20, rotation: 0,
      text: kind === "text" ? "New text" : undefined, captureSourceId, color: "#ffffff", backgroundColor: kind === "shape" ? "#6d28d9" : "#000000", fontSize: 56, borderRadius: 0, zIndex: current.length,
    };
    void updateSceneLayers([...current, layer]);
    setSelectedSceneLayerId(layer.id);
    setSelectedSceneLayerIds([layer.id]);
  };
  const activeSceneLayers = useMemo(
    () => activeSlideId && activeSlide?.teachingViewMode !== "original"
      ? sceneLayers[activeSlideId] ?? activeSlide?.sceneLayers ?? []
      : [],
    [activeSlide?.sceneLayers, activeSlide?.teachingViewMode, activeSlideId, sceneLayers],
  );
  const selectedSceneLayer = activeSceneLayers.find((layer) => layer.id === selectedSceneLayerId) || null;
  const updateSelectedSceneLayer = (updates: Partial<SceneLayer>) => {
    if (!selectedSceneLayer) return;
    void updateSceneLayers(activeSceneLayers.map((layer) => layer.id === selectedSceneLayer.id ? { ...layer, ...updates } : layer));
  };
  const moveSelectedSceneLayer = (direction: -1 | 1) => {
    if (!selectedSceneLayer) return;
    const index = activeSceneLayers.findIndex((layer) => layer.id === selectedSceneLayer.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activeSceneLayers.length) return;
    const next = [...activeSceneLayers];
    [next[index], next[target]] = [next[target], next[index]];
    void updateSceneLayers(next.map((layer, zIndex) => ({ ...layer, zIndex })));
  };
  const duplicateSelectedSceneLayer = () => {
    if (!selectedSceneLayer) return;
    const copy = { ...selectedSceneLayer, id: crypto.randomUUID(), name: `${selectedSceneLayer.name} copy`, x: Math.min(90, selectedSceneLayer.x + 3), y: Math.min(90, selectedSceneLayer.y + 3), zIndex: activeSceneLayers.length };
    void updateSceneLayers([...activeSceneLayers, copy]);
    setSelectedSceneLayerId(copy.id);
    setSelectedSceneLayerIds([copy.id]);
  };
  const selectSceneLayer = (id: string | null, additive = false) => {
    setSelectedSceneLayerId(id);
    if (!id) { setSelectedSceneLayerIds([]); return; }
    setSelectedSceneLayerIds((previous) => additive ? (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]) : [id]);
  };
  const setSceneLayerGroup = (grouped: boolean) => {
    const ids = new Set(selectedSceneLayerIds.length ? selectedSceneLayerIds : selectedSceneLayer ? [selectedSceneLayer.id] : []);
    if (!ids.size) return;
    const groupId = selectedSceneLayer?.groupId || crypto.randomUUID();
    void updateSceneLayers(activeSceneLayers.map((layer) => ids.has(layer.id) ? { ...layer, groupId: grouped ? groupId : undefined } : layer));
  };
  const applySceneLayerMotionPreset = (motion: BlockMotion, toAllLayers: boolean) => {
    if (!selectedSceneLayer) return;
    const targetIds = toAllLayers ? new Set(activeSceneLayers.map((layer) => layer.id)) : new Set([selectedSceneLayer.id]);
    void updateSceneLayers(activeSceneLayers.map((layer) => targetIds.has(layer.id) ? { ...layer, motion: { ...motion } } : layer));
  };
  const saveSceneLayerMotionPreset = async () => {
    if (!selectedSceneLayer || !motionPresetName.trim()) return;
    const motion = resolveBlockMotion(selectedSceneLayer.motion ?? {}, settings);
    const presets = await saveDesktopMotionPresetAction(motionPresetName, motion);
    setMotionPresets(presets);
    setMotionPresetName("");
  };
  const handleUpdateBlocks = (updatesMap: Record<string, Partial<SlideBlock>>) => {
    if (!activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || defaultBlocks;
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => updatesMap[b.id] ? { ...b, ...updatesMap[b.id] } : b)
      };
    });
  };

  const handleChopToWords = () => {
    if (!activeSlide) return;
    
    // If we already have blocks, skip
    if (activeBlocks.length > 0) return;
    
    // Split lyrics into words
    const newBlocks: SlideBlock[] = [];
    let wordCounter = 0;
    
    const totalLines = activeSlide.content.length;
    
    // Calculate effective font size to correctly space lines vertically without breaking bounds
    const maxLineLength = Math.max(...activeSlide.content.map(line => line.length), 1);
    const maxAllowedFontSize = 2800 / maxLineLength;
    const effectiveFontSize = Math.min(settings.fontSize, maxAllowedFontSize);
    
    const gap = Math.max(15, effectiveFontSize * 0.25);
    const startY = 50 - ((totalLines - 1) * (gap / 2));
    
    activeSlide.content.forEach((line, lineIdx) => {
      const words = line.split(/\s+/).filter(Boolean);
      const numWords = words.length;
      
      // Center horizontally, assuming ~12% width per word
      const startX = 50 - ((numWords - 1) * 6);
      
      words.forEach((word, wordIdxInLine) => {
        const x = startX + (wordIdxInLine * 12);
        const y = startY + (lineIdx * gap);
        const startTime = wordCounter * 0.5; // Sequential start times, 0.5s apart
        
        newBlocks.push({
          id: `block-${wordCounter}-${Date.now()}`,
          text: word,
          x,
          y,
          startTime,
          duration: 2 // 2s duration default
        });
        
        wordCounter++;
      });
    });
    
    saveHistoryState();
    setSlideOverrides(prev => ({
      ...prev,
      [activeSlide.id]: newBlocks
    }));
  };

  const handleResetBlocks = () => {
    if (!activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const next = { ...prev };
      delete next[activeSlideId];
      return next;
    });
  };

  const handleDuplicateBlock = () => {
    if (!activeSlideId || selectedBlockIds.length === 0) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || [];
      const newBlocks: SlideBlock[] = [];
      
      currentBlocks.forEach(b => {
        if (selectedBlockIds.includes(b.id)) {
          newBlocks.push({
            ...b,
            id: `block-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            startTime: b.startTime + 0.5,
            x: b.x + 2,
            y: b.y + 2
          });
        }
      });
      
      return {
        ...prev,
        [activeSlideId]: [...currentBlocks, ...newBlocks]
      };
    });
  };

  const handleDeleteBlock = () => {
    if (!activeSlideId || selectedBlockIds.length === 0) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || [];
      return {
        ...prev,
        [activeSlideId]: currentBlocks.filter(b => !selectedBlockIds.includes(b.id))
      };
    });
    setSelectedBlockIds([]);
  };

  const handleUpdateDuration = (duration: number) => {
    if (!activeSlideId) return;
    saveHistoryState();
    const clampedDuration = Math.min(300, Math.max(1, duration));
    setSettings(prev => ({
      ...prev,
      slideDurations: {
        ...(prev.slideDurations || {}),
        [activeSlideId]: clampedDuration
      }
    }));
  };
  const keyboardActionsRef = useRef({
    handleDeleteBlock,
    handleDuplicateBlock,
    redo,
    saveHistoryState,
    setSceneLayerGroup,
    undo,
  });
  useEffect(() => {
    keyboardActionsRef.current = {
      handleDeleteBlock,
      handleDuplicateBlock,
      redo,
      saveHistoryState,
      setSceneLayerGroup,
      undo,
    };
  });

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (desktopMode && (e.ctrlKey || e.metaKey) && e.code === "KeyG" && selectedSceneLayerIds.length > 0) {
        e.preventDefault();
        keyboardActionsRef.current.setSceneLayerGroup(!e.shiftKey);
      } else if (desktopMode && selectedBlockIds.length === 0 && (e.code === "ArrowRight" || e.code === "ArrowLeft")) {
        const target = e.code === "ArrowRight"
          ? slides[Math.max(0, activeSlideIndex + 1)]
          : slides[Math.max(0, activeSlideIndex - 1)];
        if (target) {
          e.preventDefault();
          setActiveSlideId(target.id);
        }
      } else if (e.code === "Space") {
        e.preventDefault();
        setPlayKey(Date.now());
      } else if (e.code === "Backspace" || e.code === "Delete") {
        e.preventDefault();
        keyboardActionsRef.current.handleDeleteBlock();
      } else if (e.ctrlKey && e.code === "KeyD") {
        e.preventDefault();
        keyboardActionsRef.current.handleDuplicateBlock();
      } else if (e.ctrlKey && e.code === "KeyZ") {
        if (e.shiftKey) keyboardActionsRef.current.redo();
        else keyboardActionsRef.current.undo();
      } else if (e.ctrlKey && e.code === "KeyY") {
        keyboardActionsRef.current.redo();
      } else if (e.code.startsWith("Arrow") && selectedBlockIds.length > 0 && activeSlideId) {
        e.preventDefault();
        keyboardActionsRef.current.saveHistoryState();
        setSlideOverrides(prev => {
          const currentBlocks = prev[activeSlideId] || [];
          return {
            ...prev,
            [activeSlideId]: currentBlocks.map(b => {
              if (selectedBlockIds.includes(b.id)) {
                let dx = 0;
                let dy = 0;
                if (e.code === "ArrowUp") dy = -0.5;
                if (e.code === "ArrowDown") dy = 0.5;
                if (e.code === "ArrowLeft") dx = -0.5;
                if (e.code === "ArrowRight") dx = 0.5;
                return { ...b, x: b.x + dx, y: b.y + dy };
              }
              return b;
            })
          };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSlideIndex, desktopMode, future, past, selectedBlockIds, selectedSceneLayerIds, activeSlideId, slideOverrides, slides, activeSceneLayers, selectedSceneLayer]);

  const handleFetchChapter = async (book: string, chapter: number) => {
    setSelectedBibleChapter(chapter);
    setIsFetchingBible(true);
    try {
      const query = `${book} ${chapter}`;
      const params = new URLSearchParams({ q: query, translation: bibleTranslation });
      const res = await fetch(`/api/bible?${params}`);
       const data: unknown = await res.json();
       if (!res.ok) {
         const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
           ? data.error
           : "Chapter not found";
         throw new Error(message);
       }
       const verses = data && typeof data === "object" && "verses" in data && Array.isArray(data.verses)
         ? data.verses.filter(isBibleApiVerse)
         : [];
       if (verses.length > 0) {
          const newVerses = verses.map((verse) => ({
           reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
           text: verse.text.trim()
          }));
         setBibleVerses(newVerses);
         setActiveItemIndex(-2);
      } else {
        alert("Chapter not found.");
      }
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to fetch chapter.");
    } finally {
      setIsFetchingBible(false);
    }
  };

  if (!setlist) {
    return <div className="p-8 text-white">No upcoming setlists found.</div>;
  }

  const cloudPairingSecondsRemaining = cloudPairing
    ? Math.max(0, Math.ceil((Date.parse(cloudPairing.claimExpiresAt) - pairingClock) / 1_000))
    : 0;
  const cloudPairingCountdown = `${Math.floor(cloudPairingSecondsRemaining / 60)}:${String(cloudPairingSecondsRemaining % 60).padStart(2, "0")}`;
  const cloudPhoneConnected = controllerLease?.owner === "remote" && controllerLease.expiresAt > pairingClock;

  return (
    <div className="fixed inset-0 h-[100dvh] bg-[#0A0A0A] text-zinc-300 flex flex-col font-sans overflow-hidden">
      {/* Top Navbar */}
      <div className="h-14 border-b border-white/10 bg-[#121212] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-white">
            <X className="size-5" />
          </Link>
          <div className="flex items-center gap-3">
             <span className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Presenter</span>
             <select 
               value={selectedSetlistId} 
               onChange={(e) => {
                  setSelectedSetlistId(e.target.value);
                  setActiveItemIndex(0);
                  setActiveSlideId(null);
               }}
               className="bg-[#1a1a1a] border border-white/10 text-white text-sm font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-500"
             >
                {setlists.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({new Date(s.date).toLocaleDateString()})</option>
                ))}
             </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {desktopMode && <button onClick={() => void window.anointedDesktop?.openRemote(setlist.id)} className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold transition text-zinc-300">
            <Smartphone className="size-4" />
            Worship Remote
          </button>}
          {desktopMode && <button onClick={() => void handleCreateCloudPairing()} className="rounded border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-100 hover:bg-violet-500/25">Pair phone</button>}
          {desktopMode && <button onClick={() => { void window.anointedDesktop?.startLanRemote(setlist.id).then((pairing) => { if (pairing) setLanPairing(pairing); }); }} className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10">Pair Wi-Fi</button>}
          <button onClick={handleSaveSettings} disabled={isSaving || isPublishing} className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-40">
            {isSaving && !isPublishing ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />} Save Draft
          </button>
          <button onClick={handlePublishSnapshot} disabled={isSaving || isPublishing} className="inline-flex items-center gap-1 rounded bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-40">
            {isPublishing ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} Push Update
          </button>
        </div>
      </div>
      {lanPairing && <div className="absolute right-4 top-16 z-50 w-72 rounded-lg border border-violet-400/30 bg-[#181818] p-3 shadow-2xl"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-white">Pair phone on this Wi-Fi</p><p className="mt-1 text-[10px] text-zinc-400">Scan the one-time QR code. Pairing ends when you stop it or close the app.</p></div><button onClick={() => void window.anointedDesktop?.stopLanRemote().then(() => setLanPairing(null))} className="text-zinc-400 hover:text-white"><X className="size-4" /></button></div>{lanPairing.qrDataUrl ? <Image unoptimized width={176} height={176} src={lanPairing.qrDataUrl} alt="Phone Remote pairing QR code" className="mx-auto my-3 size-44 rounded bg-white p-2" /> : <p className="mt-3 text-xs text-amber-300">No active Wi-Fi address was detected.</p>}{lanPairing.url && <button onClick={() => void navigator.clipboard?.writeText(lanPairing.url!)} className="w-full truncate rounded bg-white/10 px-2 py-2 text-[10px] text-zinc-200 hover:bg-white/20">Copy pairing link</button>}</div>}
      {cloudPairing && <div className="absolute right-4 top-16 z-50 w-80 rounded-xl border border-violet-400/30 bg-[#181818] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-white">Pair Worship Remote</p>
            <p className="mt-1 text-[10px] leading-4 text-zinc-400">Scan or enter the PIN on the website. Sign-in and membership in this team are required.</p>
          </div>
          <button type="button" aria-label="Stop phone pairing" onClick={() => void handleStopCloudPairing()} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
        </div>
        <div role="status" className={`mt-3 rounded px-2 py-1.5 text-center text-[10px] font-bold ${cloudPhoneConnected ? "bg-emerald-500/15 text-emerald-200" : remoteConnectionError ? "bg-red-500/10 text-red-200" : cloudPairingSecondsRemaining > 0 ? "bg-amber-400/10 text-amber-100" : "bg-red-500/10 text-red-200"}`}>
          {cloudPhoneConnected ? "Phone connected · session active for up to 8 hours" : remoteConnectionError || (cloudPairingSecondsRemaining > 0 ? `Waiting for phone · code expires in ${cloudPairingCountdown}` : "Pairing code expired · create a new code")}
        </div>
        <Image unoptimized width={192} height={192} src={cloudPairing.qrDataUrl} alt="Internet Worship Remote pairing QR code" className="mx-auto my-3 size-48 rounded-lg bg-white p-2" />
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Six-digit PIN</p>
          <p className="mt-1 font-mono text-2xl font-black tracking-[0.18em] text-white">{formatRemotePairingPin(cloudPairing.pinCode)}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {cloudPairingSecondsRemaining > 0 || cloudPhoneConnected
            ? <button type="button" onClick={() => void navigator.clipboard?.writeText(cloudPairing.url)} className="truncate rounded-lg bg-white/10 px-2 py-2 text-[10px] font-bold text-zinc-200 hover:bg-white/20">Copy pairing link</button>
            : <button type="button" onClick={() => void handleCreateCloudPairing()} className="rounded-lg bg-violet-600 px-2 py-2 text-[10px] font-bold text-white hover:bg-violet-500">Create new code</button>}
          <button type="button" onClick={() => void handleStopCloudPairing()} className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-2 text-[10px] font-bold text-red-200 hover:bg-red-500/20">Stop Remote</button>
        </div>
      </div>}
      {draftMessage && activeTab !== "Lyrics" && <div role="status" className="absolute left-1/2 top-16 z-40 max-w-lg -translate-x-1/2 rounded border border-white/10 bg-[#181818] px-4 py-2 text-xs text-zinc-200 shadow-xl">{draftMessage}</div>}

      <div className="flex flex-1 overflow-hidden">
        
        {/* The website keeps its legacy icon rail; desktop navigation lives in the lineup. */}
        {!desktopMode && <div className="w-14 border-r border-white/5 bg-[#0a0a0a] flex flex-col items-center py-4 gap-4 shrink-0 z-10">
           <button onClick={() => setActiveItemIndex(-1)} className={`p-2 rounded-lg ${activeItemIndex === -1 ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}><LayoutTemplate className="size-5" /></button>
           <button onClick={() => setActiveItemIndex(0)} className={`p-2 rounded-lg ${activeItemIndex >= 0 ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}><Music className="size-5" /></button>
           <button onClick={() => setActiveItemIndex(-2)} className={`p-2 rounded-lg ${activeItemIndex === -2 ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}><BookOpen className="size-5" /></button>
        </div>}

        {/* Keynotes Sidebar: Line up */}
        <div className="w-64 border-r border-white/5 bg-[#121212] flex flex-col shrink-0">
          <div className="px-4 pt-4 border-b border-white/5 flex gap-4 shrink-0">
             <button className="text-xs font-bold pb-2 border-b-2 text-white border-white">Line up</button>
             <button className="text-xs font-bold pb-2 border-b-2 text-zinc-600 border-transparent hover:text-zinc-400">Notes</button>
          </div>
          
          <div className="p-2 border-b border-white/5 bg-[#0a0a0a]">
             <button className="flex items-center gap-2 py-1.5 px-3 bg-[#18181b] border border-white/10 rounded text-xs font-bold text-zinc-300"><Music className="size-3"/> Song</button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {setlist.songs.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => { setActiveItemIndex(idx); setActiveSlideId(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                  activeItemIndex === idx 
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30" 
                    : "hover:bg-white/5 text-zinc-400 border border-transparent"
                )}
              >
                {/* Thumbnail placeholder */}
                <div className="size-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                   <Music className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate text-white">{item.song.title}</p>
                  <p className="text-xs font-semibold opacity-70 truncate">{item.song.originalKey}</p>
                </div>
              </button>
            ))}
            
            <div className="pt-4 mt-4 border-t border-white/5">
               <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-3 mb-2">{desktopMode ? "Teaching" : "Teaching & Media"}</h3>
               <button
                  onClick={() => setActiveItemIndex(-1)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                    activeItemIndex === -1 
                      ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30" 
                      : "hover:bg-white/5 text-zinc-400 border border-transparent"
                  )}
               >
                  <div className="size-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                     <LayoutTemplate className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white">{desktopMode ? "Teaching" : "Media Viewer"}</p>
                    <p className="text-xs font-semibold opacity-70 truncate">{desktopMode ? "PDF / PowerPoint" : "PDF / Image"}</p>
                  </div>
               </button>
               {desktopMode && savedPptxPresentations.map((presentation) => (
                 <button
                   key={presentation.id}
                   type="button"
                   onClick={() => openTeachingPresentation(presentation)}
                   className={cn(
                     "mt-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                     activeItemIndex === -3 && selectedTeachingPresentationId === presentation.id
                       ? "border-emerald-500/30 bg-emerald-600/15 text-emerald-200"
                       : "border-transparent text-zinc-400 hover:bg-white/5",
                   )}
                 >
                   <div className="flex size-8 shrink-0 items-center justify-center rounded bg-white/10">
                     <span className="text-[9px] font-black uppercase">{presentation.kind}</span>
                   </div>
                   <div className="min-w-0">
                     <p className="truncate text-xs font-bold text-white">{presentation.name}</p>
                     <p className="text-[10px] font-semibold opacity-70">{presentation.slides.length} slide{presentation.slides.length === 1 ? "" : "s"}</p>
                   </div>
                 </button>
               ))}
               {desktopMode && <button
                 type="button"
                 onClick={() => { setActiveItemIndex(-2); setActiveSlideId(null); }}
                 className={cn(
                   "mt-3 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                   activeItemIndex === -2
                     ? "border-blue-500/30 bg-blue-600/20 text-blue-300"
                     : "border-transparent text-zinc-400 hover:bg-white/5",
                 )}
               >
                 <div className="flex size-8 shrink-0 items-center justify-center rounded bg-white/10"><BookOpen className="size-4" /></div>
                 <div className="min-w-0"><p className="truncate text-sm font-bold text-white">Bible</p><p className="truncate text-xs font-semibold opacity-70">KJV / WEB / BBE</p></div>
               </button>}
            </div>
          </div>
        </div>

        {/* Lyrics Reflow (Slides) */}
        {activeItemIndex !== -1 && (
           <div className="w-64 border-r border-white/5 bg-[#121212] flex flex-col shrink-0">
               {activeItemIndex === -2 ? (
                <div className="p-4 border-b border-white/5 bg-[#18181b] flex flex-col gap-4 max-h-[50vh] overflow-y-auto">
                   
                   <div>
                     <label className="text-[10px] font-bold text-zinc-500 uppercase">Translation</label>
                     <select 
                       value={bibleTranslation}
                       onChange={e => setBibleTranslation(e.target.value)}
                       className="w-full mt-1 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                     >
                       <option value="kjv">KJV</option>
                       <option value="web">WEB</option>
                       <option value="bbe">BBE</option>
                     </select>
                   </div>

                   <div>
                     <label className="text-[10px] font-bold text-zinc-500 uppercase">Book</label>
                     <select
                       value={selectedBibleBook}
                       onChange={e => {
                         setSelectedBibleBook(e.target.value);
                         setSelectedBibleChapter(null);
                         setBibleVerses([]);
                       }}
                       className="w-full mt-1 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                     >
                       <option value="">— Select a Book —</option>
                       <optgroup label="── Old Testament ──">
                          {BIBLE_BOOKS.filter(b => b.testament === "old").map(b => (
                           <option key={b.name} value={b.name}>{b.name}</option>
                         ))}
                       </optgroup>
                       <optgroup label="── New Testament ──">
                          {BIBLE_BOOKS.filter(b => b.testament === "new").map(b => (
                           <option key={b.name} value={b.name}>{b.name}</option>
                         ))}
                       </optgroup>
                     </select>
                   </div>
                   
                   {selectedBibleBook && (
                     <div>
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center justify-between">
                         Chapter
                         {isFetchingBible && <Loader2 className="size-3 animate-spin text-violet-500" />}
                       </label>
                       <div className="grid grid-cols-5 gap-1 mt-2">
                         {Array.from({ length: BIBLE_BOOKS.find(b => b.name === selectedBibleBook)?.chapters || 0 }).map((_, i) => {
                            const chapter = i + 1;
                            return (
                              <button 
                                key={chapter}
                                onClick={() => handleFetchChapter(selectedBibleBook, chapter)}
                                className={cn(
                                  "py-1 text-xs rounded border transition-colors",
                                  selectedBibleChapter === chapter 
                                    ? "bg-violet-600 border-violet-500 text-white font-bold" 
                                    : "bg-black/30 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                {chapter}
                              </button>
                            );
                         })}
                       </div>
                     </div>
                   )}

                   {selectedBibleChapter && bibleVerses.length > 0 && (
                     <div>
                       <label className="text-[10px] font-bold text-zinc-500 uppercase">Verse</label>
                       <div className="grid grid-cols-5 gap-1 mt-2">
                         {bibleVerses.map((v, i) => {
                            const verseNum = i + 1;
                            const slideId = `bible-${v.reference.replace(/\s+/g, '-')}`;
                            const isActive = activeSlideId === slideId;
                            return (
                              <button 
                                key={verseNum}
                                onClick={() => {
                                   const slide = slides.find(s => s.id === slideId);
                                   if (slide) setActiveSlideId(slide.id);
                                   const el = document.getElementById(slideId);
                                   if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                className={cn(
                                  "py-1 text-xs rounded border transition-colors",
                                  isActive 
                                    ? "bg-blue-600 border-blue-500 text-white font-bold" 
                                    : "bg-black/30 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                {verseNum}
                              </button>
                            );
                         })}
                       </div>
                     </div>
                   )}
                </div>
              ) : (
                <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 shrink-0 bg-[#18181b]">
                   <div className="flex flex-col justify-center min-w-0">
                     <span className="text-xs font-bold text-white truncate">{activeItemIndex === -3 ? savedPptxPresentations.find((presentation) => presentation.id === selectedTeachingPresentationId)?.name : activeItem?.song.title}</span>
                     <span className="text-[10px] font-semibold text-zinc-500">{activeItemIndex === -3 ? "Teaching slides" : "Lyrics Reflow"}</span>
                   </div>
                   {activeItemIndex >= 0 && <div className="flex bg-black/50 rounded p-0.5 border border-white/10 shrink-0">
                      {[1, 2, 4, 8].map(num => (
                        <button
                          key={num}
                          onClick={() => setLinesPerSlide(num)}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold transition",
                            linesPerSlide === num ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                   </div>}
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                 {slides.map((slide) => {
                    const isActive = activeSlideId === slide.id;
                    const label = slide.sectionLabel || "Lyrics";
                    const initial = label.charAt(0).toUpperCase();

                    let colorClass = "text-[#3b82f6]"; 
                    let bgClass = "bg-[#3b82f6]";
                    let borderClass = "border-[#10b981]"; 
                    
                    const lowerLabel = label.toLowerCase();
                    if (lowerLabel.includes("verse")) {
                      borderClass = "border-[#10b981]";
                      colorClass = "text-[#10b981]";
                      bgClass = "bg-[#10b981]";
                    } else if (lowerLabel.includes("chorus")) {
                      borderClass = "border-[#3b82f6]";
                      colorClass = "text-[#3b82f6]";
                      bgClass = "bg-[#3b82f6]";
                    } else if (lowerLabel.includes("intro") || lowerLabel.includes("instrumental") || lowerLabel.includes("intrumental")) {
                      borderClass = "border-[#8b5cf6]";
                      colorClass = "text-[#8b5cf6]";
                      bgClass = "bg-[#8b5cf6]";
                    } else if (lowerLabel.includes("bridge")) {
                      borderClass = "border-[#eab308]";
                      colorClass = "text-[#eab308]";
                      bgClass = "bg-[#eab308]";
                    }
                    
                    return (
                      <button 
                        key={slide.id}
                        onClick={() => setActiveSlideId(slide.id)}
                        className={cn(
                          "w-full flex flex-col rounded-lg overflow-hidden transition text-left border bg-[#18181b]",
                          isActive 
                            ? "ring-2 ring-white/30" 
                            : "hover:brightness-110",
                          borderClass
                        )}
                      >
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 w-full border-b border-white/5">
                          <div className={cn("size-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white", bgClass)}>
                            {initial}
                          </div>
                          <span className={cn("text-xs font-bold tracking-wide", colorClass)}>
                            {label}
                          </span>
                        </div>
                        
                        <div className="p-3 w-full">
                           {slide.content.map((line, lIdx) => (
                             <span key={lIdx} className={cn(
                               "text-sm font-bold block w-full leading-snug",
                               isActive ? "text-white" : "text-zinc-200"
                             )}>
                               {line || "(Instrumental)"}
                             </span>
                           ))}
                        </div>
                      </button>
                    );
                  })}
              </div>
           </div>
        )}

        {/* Center: Canvas & Timeline */}
        <div className="flex-1 flex flex-col bg-[#0f0f11] overflow-hidden">
          {activeItemIndex === -1 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
               {desktopMode ? <div className="w-full max-w-3xl space-y-5">
                 <div>
                   <LayoutTemplate className="mx-auto size-14 text-emerald-400/60" />
                   <h2 className="mt-3 text-2xl font-bold text-white">Teaching</h2>
                   <p className="mt-1 text-sm text-zinc-400">PDF and PowerPoint files are saved with {setlist.name} on this PC.</p>
                 </div>
                 <div
                   onDragEnter={(event) => { event.preventDefault(); setIsTeachingDragActive(true); }}
                   onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsTeachingDragActive(true); }}
                   onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsTeachingDragActive(false); }}
                   onDrop={(event) => { event.preventDefault(); setIsTeachingDragActive(false); void importTeachingFiles(event.dataTransfer.files); }}
                   className={cn(
                     "rounded-xl border-2 border-dashed p-8 transition-colors",
                     isTeachingDragActive ? "border-emerald-400 bg-emerald-500/10" : "border-white/15 bg-white/[.02]",
                   )}
                 >
                   <Upload className="mx-auto size-8 text-emerald-400" />
                   <p className="mt-3 text-sm font-bold text-white">{isImportingPptx ? "Importing Teaching file…" : "Drag and drop PDF or PPTX files here"}</p>
                   <p className="mt-1 text-xs text-zinc-500">Up to 500 MB per file. Importing never changes live output.</p>
                   <label className={cn("mx-auto mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500", isImportingPptx && "pointer-events-none opacity-50")}>
                     {isImportingPptx ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                     Browse on PC
                     <input
                       type="file"
                       multiple
                       accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                       className="hidden"
                       disabled={isImportingPptx}
                       onChange={(event) => {
                         const files = event.currentTarget.files;
                         if (files) void importTeachingFiles(files);
                         event.currentTarget.value = "";
                       }}
                     />
                   </label>
                 </div>
                 {teachingError && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200">{teachingError}</p>}
                 {savedPptxPresentations.length ? <div className="grid gap-2 text-left sm:grid-cols-2">
                   {savedPptxPresentations.map((presentation) => (
                     <div key={presentation.id} className="rounded-lg border border-white/10 bg-[#181818] p-3">
                       <button type="button" onClick={() => openTeachingPresentation(presentation)} className="w-full text-left">
                         <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">{presentation.kind} · {presentation.slides.length} slides</span>
                         <span className="mt-1 block truncate text-sm font-bold text-white">{presentation.name}</span>
                       </button>
                       <div className="mt-3 flex gap-2">
                         <button type="button" onClick={() => openTeachingPresentation(presentation)} className="flex-1 rounded bg-emerald-600/20 px-2 py-1.5 text-[10px] font-bold text-emerald-100 hover:bg-emerald-600/30">Open</button>
                         <button type="button" onClick={async () => {
                           const nextName = window.prompt("Teaching file name", presentation.name);
                           if (!nextName?.trim()) return;
                           try {
                             await renameDesktopPptxAction(presentation.id, nextName);
                             setSavedPptxPresentations((current) => {
                               const renamedName = nextName.trim().slice(0, 120);
                               for (const [setlistId, teachingFiles] of Object.entries(teachingPresentationsBySetlistRef.current)) {
                                 teachingPresentationsBySetlistRef.current[setlistId] = teachingFiles.map((item) =>
                                   item.id === presentation.id ? { ...item, name: renamedName } : item
                                 );
                               }
                               const next = current.map((item) => item.id === presentation.id ? { ...item, name: renamedName } : item);
                               teachingPresentationsBySetlistRef.current[setlist.id] = next;
                               return next;
                             });
                           } catch (error) {
                             setTeachingError(error instanceof Error ? error.message : "The Teaching file could not be renamed.");
                           }
                         }} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold text-zinc-200 hover:bg-white/15">Rename</button>
                         <button type="button" onClick={() => void removeTeachingPresentation(presentation)} className="rounded bg-red-500/10 px-2 py-1.5 text-[10px] font-bold text-red-200 hover:bg-red-500/20">Remove</button>
                       </div>
                     </div>
                   ))}
                 </div> : <p className="rounded-lg border border-dashed border-white/10 p-5 text-sm text-zinc-500">No Teaching files are saved for this setlist yet.</p>}
               </div> : <div className="max-w-md w-full space-y-6">
                 <LayoutTemplate className="size-16 text-emerald-500/50 mx-auto" />
                 <h2 className="text-2xl font-bold text-white">Media & Teaching</h2>
                 <p className="text-sm text-zinc-400">
                   Paste a URL to an image or PDF to display it on the projector.
                 </p>
                 <div className="flex flex-col gap-3">
                   <input 
                     type="text" 
                     placeholder="https://example.com/slide.jpg" 
                     className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                     value={mediaUrl}
                     onChange={(e) => setMediaUrl(e.target.value)}
                   />
	                   <button 
	                     onClick={() => {
	                        const mediaSlide: PresentationSlide = { id: "media-url", type: "teaching", content: [], mediaUrl };
	                        setImportedPptxSlides([mediaSlide]);
	                        setActiveItemIndex(-3);
	                        setActiveSlideId(mediaSlide.id);
	                        setDraftMessage("Media added to the editor draft. Live output remains controlled by Worship Remote.");
	                     }}
                     className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition"
                   >
	                     Add to Editor Draft
                   </button>
                 </div>
               </div>}
            </div>
          ) : (
            <>
               {/* Center Canvas Area */}
               <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
                  {activeSlideId && activeSlide ? (
                     <KineticCanvas 
                       blocks={activeBlocks} 
                       settings={settings} 
                       onUpdateBlock={handleUpdateBlock}
                       onUpdateBlocks={handleUpdateBlocks}
                       slide={activeSlide}
                       playKey={playKey}
                       selectedBlockIds={selectedBlockIds}
                       onSelectBlock={setSelectedBlockIds}
                       sceneLayers={desktopMode ? activeSceneLayers : []}
                       selectedSceneLayerId={selectedSceneLayerId}
                       selectedSceneLayerIds={selectedSceneLayerIds}
                       onSelectSceneLayer={selectSceneLayer}
                       onUpdateSceneLayer={(id, updates) => void updateSceneLayers(activeSceneLayers.map((layer) => layer.id === id ? { ...layer, ...updates } : layer))}
                       onUpdateSceneLayers={(updates) => void updateSceneLayers(activeSceneLayers.map((layer) => updates[layer.id] ? { ...layer, ...updates[layer.id] } : layer))}
                     />
                  ) : activeItem && (draftLyricsBySetlistSongId[activeItem.id] ?? activeItem.song.lyricsChords ?? "").trim().length === 0 ? (
                     <div className="max-w-sm text-center"><p className="font-bold text-amber-300">No lyrics saved for this song</p><p className="mt-2 text-sm text-zinc-500">Add lyrics/chords in the Songs page, then sync this PC.</p></div>
                  ) : (
                     <div className="text-zinc-600 font-bold">Select a slide to edit</div>
                  )}
                  {desktopMode && <div className="absolute right-4 top-4 rounded border border-white/10 bg-black/40 px-3 py-2 text-right text-[10px]"><p className="font-bold text-zinc-300">Published live: {liveActiveSlide ? `${Math.max(0, liveSlides.findIndex((slide) => slide.id === liveActiveSlide.id)) + 1}/${liveSlides.length}` : outputMode}</p><p className="mt-1 max-w-48 truncate text-zinc-500">Remote revision {publishedSnapshot.revision}</p></div>}
                  
                  {/* Floating properties quick toggle (optional) */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                     <span className="rounded border border-white/10 bg-black/50 px-2 py-1 text-[10px] font-bold text-zinc-400">
                       {activeSlide?.teachingViewMode === "original" ? "Exact PowerPoint preview" : "Editor preview"}
                     </span>
                     {activeItemIndex === -3 && activeSlide && !activeSlide.teachingViewMode && savedPptxPresentations.find((item) => item.id === selectedTeachingPresentationId)?.kind === "pptx" && (
                       <span className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                         Re-import this older PowerPoint to add Original view
                       </span>
                     )}
                     {activeItemIndex === -3 && activeSlide?.teachingViewMode && (
                       <div role="group" aria-label="PowerPoint slide view" className="flex rounded border border-white/10 bg-black/60 p-0.5">
                         <button
                           type="button"
                           aria-pressed={activeSlide.teachingViewMode === "original"}
                           onClick={() => void changeTeachingSlideViewMode("original")}
                           className={cn("rounded px-2 py-1 text-[10px] font-bold", activeSlide.teachingViewMode === "original" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white")}
                         >
                           Original
                         </button>
                         <button
                           type="button"
                           aria-pressed={activeSlide.teachingViewMode === "edited"}
                           onClick={() => void changeTeachingSlideViewMode("edited")}
                           className={cn("rounded px-2 py-1 text-[10px] font-bold", activeSlide.teachingViewMode === "edited" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white")}
                         >
                           Edit slide
                         </button>
                       </div>
                     )}
                  </div>
               </div>

               {/* Bottom Timeline */}
               <TimelineEditor 
                 blocks={activeBlocks} 
                 onUpdateBlock={handleUpdateBlock}
                 onUpdateBlocks={handleUpdateBlocks}
                 onChopToWords={handleChopToWords}
                 onReset={handleResetBlocks}
                 onPlay={() => setPlayKey(Date.now())}
                 playKey={playKey}
                 selectedBlockIds={selectedBlockIds}
                 onSelectBlock={setSelectedBlockIds}
                 onDuplicateBlock={handleDuplicateBlock}
                 onDeleteBlock={handleDeleteBlock}
                 totalDuration={activeSlideId ? (settings.slideDurations?.[activeSlideId] || 10) : 10}
                 onUpdateDuration={handleUpdateDuration}
                 onUndo={undo}
                 onRedo={redo}
                 canUndo={past.length > 0}
                 canRedo={future.length > 0}
               />
            </>
          )}
        </div>

        {/* Right Sidebar: Properties & Motion & Stage */}
        <div className="w-[300px] border-l border-white/10 bg-[#121212] flex flex-col shrink-0">
           {/* Tabs */}
           <div className="px-4 pt-4 border-b border-white/5 flex gap-4 shrink-0 overflow-x-auto">
              {PRESENTER_TABS.map((tab) => (
               <button 
                 key={tab}
                  onClick={() => setActiveTab(tab)}
                 className={cn(
                   "text-xs font-bold pb-2 border-b-2 transition-colors whitespace-nowrap",
                   activeTab === tab ? "text-white border-white" : "text-zinc-600 border-transparent hover:text-zinc-400"
                 )}
               >
                 {tab}
               </button>
             ))}
           </div>
           
           <div className="flex-1 overflow-y-auto">
              {activeTab === "Lyrics" && (
                <div className="space-y-4 p-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">Setlist lyric draft</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Changes apply only to this setlist. Save the draft, then push an update when the Worship Remote should receive it.</p>
                  </div>
                  {activeItemIndex >= 0 && activeItem ? <>
                    <p className="text-sm font-black text-white">{activeItem.song.title}</p>
                    <textarea
                      value={draftLyricsBySetlistSongId[activeItem.id] ?? activeItem.song.lyricsChords ?? ""}
                      onChange={(event) => setDraftLyricsBySetlistSongId((current) => ({ ...current, [activeItem.id]: event.target.value }))}
                      spellCheck
                      className="min-h-80 w-full resize-y rounded border border-white/10 bg-[#181818] p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:border-violet-500 focus:outline-none"
                      placeholder="Add lyrics and chords for this setlist item…"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleSaveSettings} disabled={isSaving || isPublishing} className="inline-flex items-center justify-center gap-1 rounded bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"><Save className="size-3" /> Save Draft</button>
                      <button onClick={handlePublishSnapshot} disabled={isSaving || isPublishing} className="inline-flex items-center justify-center gap-1 rounded bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-40"><Upload className="size-3" /> Push Update</button>
                    </div>
                    {draftMessage && <p role="status" className="rounded border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-zinc-300">{draftMessage}</p>}
                  </> : <p className="rounded border border-dashed border-white/10 p-4 text-xs text-zinc-500">Select a song from the lineup to edit its lyrics.</p>}
                </div>
              )}
              {activeTab === "Property" && (
                <div className="p-4 space-y-6">
                  {/* Global Shortcut */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-[10px] font-bold uppercase text-zinc-500">Global Song Properties</p>
                       <button onClick={handleSaveSettings} disabled={isSaving} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white flex items-center gap-1 transition">
                         {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                         Save for Setlist
                       </button>
                    </div>
                    {desktopMode && <DesktopLiveSourcePanel screens={captureSources} cameras={cameraSources} onAdd={(kind, sourceId) => { setActiveTab("Layers"); addSceneLayer(kind, sourceId); }} />}
                    <p className="rounded border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-[10px] leading-relaxed text-violet-100">Live output controls are in Worship Remote. This page edits the draft and publishes deliberate updates.</p>
                  </div>

                  <hr className="border-white/5" />

                  {/* Character Properties */}
                  <div className="space-y-4">
                     <p className="text-[10px] flex items-center justify-between font-bold text-zinc-500 uppercase tracking-wider">
                       Character {selectedBlock && <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Block Override</span>}
                     </p>
                     
                     <div className="space-y-2">
                       {selectedBlock && (
                         <input 
                           type="text" 
                           value={selectedBlock.text}
                           onChange={(e) => handleUpdateSelectedBlock({ text: e.target.value })}
                           className="w-full bg-zinc-900 border border-emerald-500/50 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 mb-2"
                           placeholder="Edit text..."
                         />
                       )}
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                         value={selectedBlock?.fontFamily || settings.fontFamily}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ fontFamily: e.target.value });
                           else setSettings({...settings, fontFamily: e.target.value});
                         }}
                       >
                         <option value="Arial">Arial</option>
                         <option value="Arial Black">Arial Black</option>
                         <option value="Inter">Inter (Sans)</option>
                         <option value="Roboto">Roboto</option>
                         <option value="Open Sans">Open Sans</option>
                         <option value="Montserrat">Montserrat</option>
                         <option value="Lato">Lato</option>
                         <option value="Poppins">Poppins</option>
                         <option value="Playfair Display">Playfair Display</option>
                         <option value="Oswald">Oswald</option>
                         <option value="Raleway">Raleway</option>
                         <option value="Nunito">Nunito</option>
                         <option value="Ubuntu">Ubuntu</option>
                         <option value="Merriweather">Merriweather</option>
                         <option value="PT Serif">PT Serif</option>
                         <option value="Lora">Lora</option>
                         <option value="Times New Roman">Times New Roman</option>
                         <option value="Courier New">Courier New</option>
                         <option value="Georgia">Georgia</option>
                       </select>
                       
                       <div className="flex gap-2">
                         <div className="flex-1 flex items-center bg-[#1a1a1a] border border-white/10 rounded px-2">
                            <input 
                              type="number" 
                              value={displayFontSize} 
                              onChange={(e) => {
                                if (selectedBlock) handleUpdateSelectedBlock({ fontSize: Number(e.target.value) });
                                else setSettings({...settings, fontSize: Number(e.target.value)});
                              }}
                              className="w-full bg-transparent text-white text-sm py-1.5 focus:outline-none"
                            />
                            <span className="text-xs text-zinc-500 font-bold ml-2">pt</span>
                         </div>
                       </div>

                       <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden mt-2">
                         <button onClick={() => {
                           if (selectedBlock) handleUpdateSelectedBlock({ bold: !(selectedBlock.bold ?? settings.bold) });
                           else setSettings({...settings, bold: !settings.bold});
                         }} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition border-r border-white/5", (selectedBlock?.bold ?? settings.bold) && "bg-white/10 text-white")}><Bold className="size-4" /></button>
                         <button onClick={() => {
                           if (selectedBlock) handleUpdateSelectedBlock({ italic: !(selectedBlock.italic ?? settings.italic) });
                           else setSettings({...settings, italic: !settings.italic});
                         }} className={cn("flex-1 py-1.5 flex items-center justify-center border-r border-white/5 hover:bg-white/5 transition", (selectedBlock?.italic ?? settings.italic) && "bg-white/10 text-white")}><Italic className="size-4" /></button>
                         <button onClick={() => {
                           if (selectedBlock) handleUpdateSelectedBlock({ underline: !(selectedBlock.underline ?? settings.underline) });
                           else setSettings({...settings, underline: !settings.underline});
                         }} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", (selectedBlock?.underline ?? settings.underline) && "bg-white/10 text-white")}><Underline className="size-4" /></button>
                       </div>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Paragraph Properties */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Paragraph</p>
                     <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden">
                         <button onClick={() => setSettings({...settings, align: 'left'})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition border-r border-white/5", settings.align === 'left' && "bg-white/10 text-white")}><AlignLeft className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, align: 'center'})} className={cn("flex-1 py-1.5 flex items-center justify-center border-r border-white/5 hover:bg-white/5 transition", settings.align === 'center' && "bg-white/10 text-white")}><AlignCenter className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, align: 'right'})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", settings.align === 'right' && "bg-white/10 text-white")}><AlignRight className="size-4" /></button>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Appearance Properties */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Appearance</p>
                     
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-semibold text-zinc-400">Color</span>
                       <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded border border-white/5">
                         {["#ffffff", "#e5e7eb", "#fcd34d", "#f87171", "#60a5fa", "#4ade80", "#fbbf24"].map(color => (
                           <button 
                             key={color} 
                             onClick={() => setSettings({...settings, color})}
                             className={cn("size-3 rounded-sm border border-white/20 transition-transform hover:scale-110", settings.color === color && "ring-1 ring-white")}
                             style={{ backgroundColor: color }}
                           />
                         ))}
                       </div>
                     </div>
                     
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-semibold text-zinc-400">Background</span>
                       <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded border border-white/5">
                         {["#000000", "#111827", "#312e81", "#14532d", "#7f1d1d"].map(color => (
                           <button 
                             key={color} 
                             onClick={() => setSettings({...settings, backgroundColor: color})}
                             className={cn("size-3 rounded-sm border border-white/20 transition-transform hover:scale-110", settings.backgroundColor === color && "ring-1 ring-white")}
                             style={{ backgroundColor: color }}
                           />
                         ))}
                       </div>
                     </div>
                     
                     <div className="pt-2">
                       {desktopMode ? (
                         <DesktopBackgroundLibrary
                           key={setlist.id}
                           setlistId={setlist.id}
                           initialAssets={desktopBackgrounds}
                           initialCollections={desktopBackgroundCollections}
                           selectedAssetId={desktopSetlistBackgrounds[setlist.id]?.id}
                           onSelect={(asset) => setSettings({ ...settings, backgroundMediaUrl: asset?.url, backgroundMediaType: asset?.mediaType })}
                         />
                       ) : (
                         <MediaUploader
                           currentUrl={settings.backgroundMediaUrl}
                           currentType={settings.backgroundMediaType}
                           onUpload={(url, type) => setSettings({ ...settings, backgroundMediaUrl: url, backgroundMediaType: type })}
                           onClear={() => setSettings({ ...settings, backgroundMediaUrl: undefined, backgroundMediaType: undefined })}
                         />
                       )}
                     </div>

                     <div className="flex items-center justify-between pt-2">
                       <span className="text-xs font-semibold text-zinc-400">Drop Shadow</span>
                       <button 
                         onClick={() => setSettings({...settings, showShadow: !settings.showShadow})}
                         className={cn("w-8 h-4 rounded-full transition-colors flex items-center px-0.5", settings.showShadow ? "bg-white justify-end" : "bg-zinc-700 justify-start")}
                       >
                         <div className={cn("size-3 rounded-full shadow-sm", settings.showShadow ? "bg-black" : "bg-white")} />
                       </button>
                     </div>
                  </div>
                </div>
              )}

              {activeTab === "Layers" && (
                <div className="p-2 space-y-1">
                   {desktopMode && pptxReport?.warnings.length ? <section className="mb-3 rounded border border-amber-400/20 bg-amber-500/5 p-2"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">PowerPoint import report</p><ul className="mt-1 space-y-1 text-[9px] text-amber-100/80">{pptxReport.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section> : null}
                   {desktopMode && activeSlideId && <section className="mb-3 rounded border border-violet-400/20 bg-violet-500/5 p-2"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-200">Local Scene Layers</p><div className="grid grid-cols-2 gap-1"><button onClick={() => addSceneLayer("text")} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">+ Text</button><button onClick={() => addSceneLayer("shape")} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">+ Shape</button><button onClick={() => addSceneLayer("image")} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">+ Image</button><button onClick={() => addSceneLayer("video")} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">+ Video</button></div><p className="mt-2 text-[9px] text-zinc-500">Shift-click layers on the canvas to select several before grouping.</p>{activeSceneLayers.map((layer, index) => <button key={layer.id} onClick={(event) => selectSceneLayer(layer.id, event.shiftKey)} className={cn("mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px]", selectedSceneLayerIds.includes(layer.id) ? "bg-violet-600/30" : "bg-black/20 hover:bg-white/5")}><span className="min-w-0 flex-1 truncate font-semibold">{index + 1}. {layer.name}</span><span onClick={(event) => { event.stopPropagation(); void updateSceneLayers(activeSceneLayers.map((item) => item.id === layer.id ? { ...item, hidden: !item.hidden } : item)); }} className="text-zinc-400 hover:text-white">{layer.hidden ? "Show" : "Hide"}</span><span onClick={(event) => { event.stopPropagation(); void updateSceneLayers(activeSceneLayers.filter((item) => item.id !== layer.id)); }} className="text-red-300 hover:text-red-200">Delete</span></button>)}</section>}
                   {desktopMode && selectedSceneLayer && <section className="mb-3 space-y-2 rounded border border-white/10 bg-black/20 p-2"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Layer editor</p><select value={selectedSceneLayerId || ""} onChange={(event) => setSelectedSceneLayerId(event.target.value)} className="w-full rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-[10px] text-white">{activeSceneLayers.map((layer, index) => <option key={layer.id} value={layer.id}>{index + 1}. {layer.name}</option>)}</select><input value={selectedSceneLayer.name} onChange={(event) => updateSelectedSceneLayer({ name: event.target.value.slice(0, 80) })} aria-label="Layer name" className="w-full rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-xs text-white" />{selectedSceneLayer.kind === "text" && <textarea value={selectedSceneLayer.text || ""} onChange={(event) => updateSelectedSceneLayer({ text: event.target.value })} aria-label="Layer text" className="min-h-16 w-full rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-xs text-white" />}{(selectedSceneLayer.kind === "image" || selectedSceneLayer.kind === "video") && <><select value={selectedSceneLayer.mediaUrl || ""} onChange={(event) => updateSelectedSceneLayer({ mediaUrl: event.target.value })} aria-label="Choose local background media" className="w-full rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-xs text-white"><option value="">Choose PC media</option>{desktopBackgrounds.filter((asset) => asset.mediaType === selectedSceneLayer.kind).map((asset) => <option key={asset.id} value={asset.url}>{asset.displayName}</option>)}</select><input value={selectedSceneLayer.mediaUrl || ""} onChange={(event) => updateSelectedSceneLayer({ mediaUrl: event.target.value })} placeholder="Local media URL" aria-label="Layer media URL" className="w-full rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-xs text-white" /></>}<div className="grid grid-cols-2 gap-1">{([ ["x", "X"], ["y", "Y"], ["width", "Width"], ["height", "Height"], ["rotation", "Rotation"], ["fontSize", "Font size"] ] as const).map(([field, label]) => <label key={field} className="text-[9px] text-zinc-500">{label}<input type="number" value={selectedSceneLayer[field] ?? 0} onChange={(event) => updateSelectedSceneLayer({ [field]: Number(event.target.value) || 0 })} className="mt-0.5 w-full rounded border border-white/10 bg-[#171717] px-2 py-1 text-xs text-white" /></label>)}</div><div className="flex gap-1"><button onClick={() => moveSelectedSceneLayer(-1)} className="flex-1 rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">Bring forward</button><button onClick={() => moveSelectedSceneLayer(1)} className="flex-1 rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">Send back</button><button onClick={() => updateSelectedSceneLayer({ locked: !selectedSceneLayer.locked })} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">{selectedSceneLayer.locked ? "Unlock" : "Lock"}</button></div></section>}
                   {desktopMode && selectedSceneLayer && <><div className="mb-3 flex gap-1"><button onClick={duplicateSelectedSceneLayer} className="flex-1 rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">Duplicate selected layer</button><button onClick={() => updateSelectedSceneLayer({ groupId: selectedSceneLayer.groupId ? undefined : crypto.randomUUID() })} className="flex-1 rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold hover:bg-white/15">{selectedSceneLayer.groupId ? "Ungroup" : "Group"}</button></div><section className="mb-3 space-y-1.5 rounded border border-violet-400/20 bg-violet-500/5 p-2"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">Scene layer motion</p><div className="grid grid-cols-2 gap-1"><label className="text-[9px] text-zinc-500">Start (seconds)<input type="number" min="0" value={selectedSceneLayer.startTime || 0} onChange={(event) => updateSelectedSceneLayer({ startTime: Math.max(0, Number(event.target.value) || 0) })} className="mt-0.5 w-full rounded border border-white/10 bg-[#171717] px-2 py-1 text-xs text-white" /></label><label className="text-[9px] text-zinc-500">Duration (seconds)<input type="number" min="0" value={selectedSceneLayer.duration || 0} onChange={(event) => updateSelectedSceneLayer({ duration: Math.max(0, Number(event.target.value) || 0) })} className="mt-0.5 w-full rounded border border-white/10 bg-[#171717] px-2 py-1 text-xs text-white" /></label></div><div className="flex gap-1"><input value={motionPresetName} onChange={(event) => setMotionPresetName(event.target.value)} placeholder="Save current motion as…" className="min-w-0 flex-1 rounded border border-white/10 bg-[#171717] px-2 py-1 text-[10px] text-white" /><button onClick={() => void saveSceneLayerMotionPreset()} disabled={!motionPresetName.trim()} className="rounded bg-violet-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40">Save</button></div>{motionPresets.length > 0 && <div className="flex gap-1"><select value={selectedMotionPresetId} onChange={(event) => setSelectedMotionPresetId(event.target.value)} className="min-w-0 flex-1 rounded border border-white/10 bg-[#171717] px-2 py-1 text-[10px] text-white"><option value="">Apply saved motion…</option>{motionPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button onClick={() => { const preset = motionPresets.find((item) => item.id === selectedMotionPresetId); if (preset) applySceneLayerMotionPreset(preset.motion, false); }} disabled={!selectedMotionPresetId} className="rounded bg-white/10 px-2 py-1 text-[10px] font-bold">Layer</button><button onClick={() => { const preset = motionPresets.find((item) => item.id === selectedMotionPresetId); if (preset) applySceneLayerMotionPreset(preset.motion, true); }} disabled={!selectedMotionPresetId} className="rounded bg-white/10 px-2 py-1 text-[10px] font-bold">All</button></div>}</section></>}
                   {activeBlocks.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-500">
                         Click &quot;Chop to Words&quot; to see layers.
                      </div>
                   ) : (
                      activeBlocks.map((block) => (
                         <div key={block.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-[#1a1a1a] hover:bg-white/5 transition group">
                            <Type className="size-4 text-zinc-500 group-hover:text-zinc-300" />
                            <span className="text-sm font-bold text-zinc-300 truncate">{block.text}</span>
                         </div>
                      ))
                   )}
                </div>
              )}

              {activeTab === "Motion" && (
                <div className="p-4 space-y-6">
                  <div className="flex justify-between items-center mb-2">
                     <p className="text-xs font-bold text-blue-500">{selectedBlock ? "Layer Override" : "Global Animation"}</p>
                     <button onClick={() => setSettings(defaultPresentationSettings)} className="text-[10px] font-bold text-zinc-400 hover:text-white transition">Reset to Global</button>
                  </div>

                  {desktopMode && <section className="space-y-2 rounded border border-violet-400/20 bg-violet-500/5 p-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">Local Motion Presets</p><span className="text-[9px] text-zinc-500">PC only</span></div>
                    {selectedBlock ? <>
                      <div className="flex gap-1"><input value={motionPresetName} onChange={(event) => setMotionPresetName(event.target.value)} placeholder="Preset name" className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" /><button onClick={() => void saveMotionPreset()} disabled={!motionPresetName.trim()} className="rounded bg-violet-600 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Save</button></div>
                      <p className="text-[9px] text-zinc-500">Saves this layer’s effective entrance and exit motion. Existing slides never change when a preset is edited.</p>
                    </> : <p className="text-[10px] text-zinc-500">Select a layer to save a reusable motion preset.</p>}
                    {motionPresets.length > 0 && <div className="flex gap-1"><select value={selectedMotionPresetId} onChange={(event) => setSelectedMotionPresetId(event.target.value)} className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"><option value="">Choose a preset</option>{motionPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button onClick={() => { const preset = motionPresets.find((item) => item.id === selectedMotionPresetId); if (preset) applyMotionPreset(preset.motion, false); }} disabled={!selectedMotionPresetId || selectedBlockIds.length === 0} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Apply layer</button><button onClick={() => { const preset = motionPresets.find((item) => item.id === selectedMotionPresetId); if (preset) applyMotionPreset(preset.motion, true); }} disabled={!selectedMotionPresetId || activeBlocks.length === 0} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Apply all</button></div>}
                    {selectedMotionPresetId && <button onClick={async () => { const presets = await deleteDesktopMotionPresetAction(selectedMotionPresetId); setMotionPresets(presets); setSelectedMotionPresetId(""); }} className="text-[10px] font-semibold text-red-300 hover:text-red-200">Delete selected preset</button>}
                  </section>}

                  {/* SLIDE TRANSITION (Global Only) */}
                  {!selectedBlock && (
                     <div className="space-y-3 pb-4 border-b border-white/5">
                         <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Slide Transition</p>
                         <select 
                           className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                           value={settings.slideTransition || "None"}
                            onChange={(e) => setSettings({...settings, slideTransition: e.target.value as PresentationSettings["slideTransition"]})}
                         >
                           <option value="None">None (Cut)</option>
                           <option value="Crossfade">Crossfade</option>
                           <option value="Slide Up">Slide Up</option>
                           <option value="Slide Down">Slide Down</option>
                           <option value="Slide Left">Slide Left</option>
                           <option value="Slide Right">Slide Right</option>
                           <option value="Zoom In">Zoom In</option>
                           <option value="Zoom Out">Zoom Out</option>
                           <option value="Blur">Blur</option>
                           <option value="Flip">Flip</option>
                         </select>
                      </div>
                  )}

                  {/* ENTRANCE ANIMATION */}
                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Entrance Animation</p>
                     
                     <div className="space-y-1">
                        <p className="text-xs text-zinc-400 font-semibold">Effect</p>
                        <select 
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                          value={selectedBlock?.entranceAnimation ?? settings.entranceAnimation}
                          onChange={(e) => {
                            if (selectedBlock) handleUpdateSelectedBlock({ entranceAnimation: e.target.value });
                            else setSettings({...settings, entranceAnimation: e.target.value as PresentationSettings["entranceAnimation"]});
                          }}
                        >
                          <option value="None">None</option>
                          <optgroup label="── Fade">
                            <option value="Appear">Appear (Flash)</option>
                            <option value="Fade In">Fade In</option>
                            <option value="Blur In">Blur In</option>
                          </optgroup>
                          <optgroup label="── Slide">
                            <option value="Slide In Up">Slide In Up</option>
                            <option value="Slide In Down">Slide In Down</option>
                            <option value="Slide In Left">Slide In Left</option>
                            <option value="Slide In Right">Slide In Right</option>
                            <option value="Rise Up">Rise Up (Big)</option>
                            <option value="Drop Down">Drop Down (Big)</option>
                            <option value="Mask In Up">Mask In Up</option>
                          </optgroup>
                          <optgroup label="── Zoom">
                            <option value="Zoom In">Zoom In</option>
                            <option value="Zoom In Bounce">Zoom In Bounce</option>
                            <option value="Bounce In">Bounce In</option>
                          </optgroup>
                          <optgroup label="── Flip / Rotate">
                            <option value="Flip In X">Flip In X (Horizontal)</option>
                            <option value="Flip In Y">Flip In Y (Vertical)</option>
                            <option value="Rotate In">Rotate In</option>
                            <option value="Roll In">Roll In</option>
                            <option value="Swing In">Swing In</option>
                          </optgroup>
                          <optgroup label="── Skew">
                            <option value="Skew In Left">Skew In Left</option>
                            <option value="Skew In Right">Skew In Right</option>
                          </optgroup>
                        </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Duration: {selectedBlock?.entranceDuration ?? settings.entranceDuration}s</p>
                       <input 
                         type="range" min="0" max="5" step="0.1"
                         value={selectedBlock?.entranceDuration ?? settings.entranceDuration}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ entranceDuration: Number(e.target.value) });
                           else setSettings({...settings, entranceDuration: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Delay: {selectedBlock?.entranceDelay ?? settings.entranceDelay}s</p>
                       <input 
                         type="range" min="0" max="5" step="0.1"
                         value={selectedBlock?.entranceDelay ?? settings.entranceDelay}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ entranceDelay: Number(e.target.value) });
                           else setSettings({...settings, entranceDelay: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Easing Curve</p>
                        <select 
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                          value={selectedBlock?.entranceCurve ?? settings.entranceCurve}
                          onChange={(e) => {
                            if (selectedBlock) handleUpdateSelectedBlock({ entranceCurve: e.target.value });
                            else setSettings({...settings, entranceCurve: e.target.value});
                          }}
                        >
                          <option value="Ease Out">Ease Out</option>
                          <option value="Ease In">Ease In</option>
                          <option value="Ease In Out">Ease In Out</option>
                          <option value="Linear">Linear</option>
                          <option value="Spring">Spring (Bounce)</option>
                          <option value="Sharp">Sharp</option>
                        </select>
                        <div className="h-8 mt-2 w-full border-b border-l border-white/10 relative overflow-hidden">
                          <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                            {(() => {
                              const c = selectedBlock?.entranceCurve ?? settings.entranceCurve;
                              if (c === "Ease Out")    return <path d="M0,100 C10,100 30,0 100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Ease In")     return <path d="M0,100 C70,100 90,0 100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Ease In Out") return <path d="M0,100 C30,100 70,0 100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Spring")      return <path d="M0,100 C20,0 40,120 60,90 S80,-10 100,0" fill="none" stroke="#a78bfa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Sharp")       return <path d="M0,100 C0,100 0,0 100,0" fill="none" stroke="#f472b6" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              return <path d="M0,100 L100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                            })()}
                          </svg>
                        </div>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* EXIT ANIMATION */}
                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Exit Animation</p>
                     
                     <div className="space-y-1">
                        <p className="text-xs text-zinc-400 font-semibold">Effect</p>
                        <select 
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                          value={selectedBlock?.exitAnimation ?? settings.exitAnimation}
                          onChange={(e) => {
                            if (selectedBlock) handleUpdateSelectedBlock({ exitAnimation: e.target.value });
                            else setSettings({...settings, exitAnimation: e.target.value as PresentationSettings["exitAnimation"]});
                          }}
                        >
                          <option value="None">None</option>
                          <optgroup label="── Fade">
                            <option value="Disappear">Disappear (Flash)</option>
                            <option value="Fade Out">Fade Out</option>
                            <option value="Blur Out">Blur Out</option>
                          </optgroup>
                          <optgroup label="── Slide">
                            <option value="Slide Out Up">Slide Out Up</option>
                            <option value="Slide Out Down">Slide Out Down</option>
                            <option value="Slide Out Left">Slide Out Left</option>
                            <option value="Slide Out Right">Slide Out Right</option>
                            <option value="Shrink Up">Shrink Up</option>
                            <option value="Mask Out Up">Mask Out Up</option>
                          </optgroup>
                          <optgroup label="── Zoom">
                            <option value="Zoom Out">Zoom Out</option>
                            <option value="Zoom Out Blow">Zoom Out Blow</option>
                            <option value="Bounce Out">Bounce Out</option>
                          </optgroup>
                          <optgroup label="── Flip / Rotate">
                            <option value="Flip Out X">Flip Out X (Horizontal)</option>
                            <option value="Flip Out Y">Flip Out Y (Vertical)</option>
                            <option value="Rotate Out">Rotate Out</option>
                          </optgroup>
                          <optgroup label="── Skew">
                            <option value="Skew Out Left">Skew Out Left</option>
                            <option value="Skew Out Right">Skew Out Right</option>
                          </optgroup>
                        </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Duration: {selectedBlock?.exitDuration ?? settings.exitDuration}s</p>
                       <input 
                         type="range" min="0" max="5" step="0.1"
                         value={selectedBlock?.exitDuration ?? settings.exitDuration}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ exitDuration: Number(e.target.value) });
                           else setSettings({...settings, exitDuration: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Delay: {selectedBlock?.exitDelay ?? settings.exitDelay}s</p>
                       <input 
                         type="range" min="0" max="10" step="0.1"
                         value={selectedBlock?.exitDelay ?? settings.exitDelay}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ exitDelay: Number(e.target.value) });
                           else setSettings({...settings, exitDelay: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Easing Curve</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={selectedBlock?.exitCurve ?? settings.exitCurve}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ exitCurve: e.target.value });
                           else setSettings({...settings, exitCurve: e.target.value});
                         }}
                       >
                         <option value="Ease Out">Ease Out</option>
                         <option value="Ease In">Ease In</option>
                         <option value="Ease In Out">Ease In Out</option>
                         <option value="Linear">Linear</option>
                       </select>
                       <div className="h-8 mt-2 w-full border-b border-l border-white/10 relative overflow-hidden">
                         <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                           <path d={(selectedBlock?.exitCurve ?? settings.exitCurve) === "Ease Out" ? "M0,100 Q20,10 100,0" : "M0,100 L100,0"} fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
                         </svg>
                       </div>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* KINETIC TEXT */}
                  <div className="space-y-3 pb-8">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Kinetic Text</p>
                     
                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Kinetic Mode</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticMode}
                         onChange={(e) => setSettings({...settings, kineticMode: e.target.value})}
                       >
                         <option value="Word by Word">Word by Word</option>
                         <option value="Line by Line">Line by Line</option>
                         <option value="Character">Character</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Animation Order</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticAnimationOrder}
                         onChange={(e) => setSettings({...settings, kineticAnimationOrder: e.target.value})}
                       >
                         <option value="Forward">Forward</option>
                         <option value="Backward">Backward</option>
                         <option value="Random">Random</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Stagger Delay: {settings.kineticStaggerDelay}s</p>
                       <input 
                         type="range" min="0" max="1" step="0.05"
                         value={settings.kineticStaggerDelay}
                         onChange={(e) => setSettings({...settings, kineticStaggerDelay: Number(e.target.value)})}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Smoothing Curve</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticSmoothingCurve}
                         onChange={(e) => setSettings({...settings, kineticSmoothingCurve: e.target.value})}
                       >
                         <option value="Smooth">Smooth</option>
                         <option value="Linear">Linear</option>
                         <option value="Spring">Spring</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Direction</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticDirection}
                         onChange={(e) => setSettings({...settings, kineticDirection: e.target.value})}
                       >
                         <option value="Fly Up">Fly Up</option>
                         <option value="Fly Down">Fly Down</option>
                         <option value="Fly Left">Fly Left</option>
                         <option value="Fly Right">Fly Right</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Travel Distance: {settings.kineticTravelDistance} px</p>
                       <input 
                         type="range" min="0" max="200" step="1"
                         value={settings.kineticTravelDistance}
                         onChange={(e) => setSettings({...settings, kineticTravelDistance: Number(e.target.value)})}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Segment Duration: {settings.kineticSegmentDuration}s</p>
                       <input 
                         type="range" min="0" max="2" step="0.05"
                         value={settings.kineticSegmentDuration}
                         onChange={(e) => setSettings({...settings, kineticSegmentDuration: Number(e.target.value)})}
                         className="w-full accent-white"
                       />
                     </div>

                  </div>
                </div>
              )}

              {activeTab === "Stage" && (
                <div className="p-4 space-y-6">
                  {desktopMode && <section className="space-y-2 rounded border border-violet-400/20 bg-violet-500/5 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">Confidence layout preset</p><select value={stageLayoutPresetId} onChange={(event) => { const id = event.target.value as StageLayoutPresetId; const stageLayout = stageLayoutPreset(id); setStageLayoutPresetId(id); if (setlist) void persistDesktopPresenterLiveState(setlist.id, { stageLayout }); }} className="w-full rounded border border-white/10 bg-[#1a1a1a] px-2 py-2 text-xs text-white"><option value="full">Full service</option><option value="lyrics-chords">Lyrics, chords, notes</option><option value="lyrics-focus">Lyrics focus</option></select><p className="text-[9px] text-zinc-500">Saved locally and restored when Confidence opens.</p></section>}
                  <p className="rounded border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-[10px] leading-relaxed text-violet-100">Live flash notes, countdowns, and output controls are operated from Worship Remote.</p>
                  <div className="hidden space-y-3 pb-4 border-b border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Flash Note</p>
                    <input 
                      type="text" 
                      placeholder="Message for band..."
                      value={stageMessageInput}
                      onChange={(e) => setStageMessageInput(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2"><input type="number" min="16" max="160" value={stageFlashStyle.fontSize} onChange={(e) => setStageFlashStyle({ ...stageFlashStyle, fontSize: Math.max(16, Math.min(160, Number(e.target.value) || 56)) })} aria-label="Flash note font size" className="min-w-0 bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-xs text-white" /><input type="color" value={stageFlashStyle.color} onChange={(e) => setStageFlashStyle({ ...stageFlashStyle, color: e.target.value })} aria-label="Flash note text color" className="h-8 w-9 rounded bg-transparent" /><input type="color" value={stageFlashStyle.backgroundColor} onChange={(e) => setStageFlashStyle({ ...stageFlashStyle, backgroundColor: e.target.value })} aria-label="Flash note background color" className="h-8 w-9 rounded bg-transparent" /></div>
                    <div className="flex gap-2 mt-2">
                       <button 
                         onClick={() => {
                           broadcast("stage_sync", { stageMessage: stageMessageInput, stageFlashStyle });
                         }}
                         className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold py-2 rounded transition"
                       >
                         Send
                       </button>
                       <button 
                         onClick={() => {
                           setStageMessageInput("");
                           broadcast("stage_sync", { stageMessage: "" });
                         }}
                         className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs font-bold py-2 rounded transition border border-red-900/50"
                       >
                         Clear
                       </button>
                    </div>
                  </div>

                  {desktopMode && <div className="hidden space-y-2 border-b border-white/5 pb-4"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Live Prop / Overlay</p><input value={propText} onChange={(event) => setPropText(event.target.value)} placeholder="Title or announcement" className="w-full rounded border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs text-white" /><input value={propSubtitle} onChange={(event) => setPropSubtitle(event.target.value)} placeholder="Optional subtitle" className="w-full rounded border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs text-white" /><div className="grid grid-cols-3 gap-1"><button onClick={() => { const prop: LiveProp = { kind: "lower-third", text: propText, subtitle: propSubtitle }; setLiveProp(prop); broadcast("projector_sync", { liveProp: prop }); }} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold">Lower third</button><button onClick={() => { const prop: LiveProp = { kind: "alert", text: propText, subtitle: propSubtitle }; setLiveProp(prop); broadcast("projector_sync", { liveProp: prop }); }} className="rounded bg-red-900/60 px-2 py-1.5 text-[10px] font-bold">Alert</button><button onClick={() => { setLiveProp(null); broadcast("projector_sync", { liveProp: null }); }} className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold">Clear prop</button></div><div className="flex gap-1"><input value={propPresetName} onChange={(event) => setPropPresetName(event.target.value)} placeholder="Save prop preset as…" maxLength={80} className="min-w-0 flex-1 rounded border border-white/10 bg-[#1a1a1a] px-2 py-1.5 text-[10px] text-white" /><button onClick={async () => { const prop = liveProp || { kind: "lower-third" as const, text: propText, subtitle: propSubtitle }; const presets = await saveDesktopLivePropPresetAction(propPresetName, prop); setLivePropPresets(presets); setPropPresetName(""); }} disabled={!propPresetName.trim()} className="rounded bg-violet-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40">Save</button></div>{livePropPresets.length > 0 && <div className="flex flex-wrap gap-1">{livePropPresets.map((preset) => <span key={preset.id} className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[9px]"><button onClick={() => { setLiveProp(preset.prop); setPropText(preset.prop.text || ""); setPropSubtitle(preset.prop.subtitle || ""); broadcast("projector_sync", { liveProp: preset.prop }); }}>{preset.name}</button><button aria-label={`Delete ${preset.name}`} onClick={async () => { const presets = await deleteDesktopLivePropPresetAction(preset.id); setLivePropPresets(presets); }} className="text-red-300">×</button></span>)}</div>}</div>}

                  <div className="hidden space-y-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Countdown Timer</p>
                    <div className="flex gap-2 items-center">
                       <input 
                         type="number" 
                         min="1"
                         value={countdownInput}
                         onChange={(e) => setCountdownInput(Number(e.target.value))}
                         className="w-20 bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 text-center"
                       />
                       <span className="text-sm text-zinc-400 font-bold">Minutes</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                       <button 
                         onClick={() => {
                           const target = Date.now() + (pausedCountdownMs ?? countdownInput * 60000);
                           setCountdownTarget(target); setPausedCountdownMs(null);
                           broadcast("stage_sync", { countdownTarget: target, countdownPausedMs: null });
                         }}
                         className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded transition"
                       >
                         {pausedCountdownMs !== null ? "Resume" : "Start"}
                       </button>
                       <button 
                         onClick={() => {
                           const remaining = countdownTarget ? Math.max(0, countdownTarget - Date.now()) : null;
                           setPausedCountdownMs(remaining); setCountdownTarget(null);
                           broadcast("stage_sync", { countdownTarget: null, countdownPausedMs: remaining });
                         }}
                         disabled={!countdownTarget}
                         className="flex-1 bg-amber-900/50 hover:bg-amber-800 disabled:opacity-40 text-amber-100 text-xs font-bold py-2 rounded transition border border-amber-900/50"
                       >
                         Pause
                       </button>
                       <button 
                         onClick={() => {
                           setCountdownTarget(null); setPausedCountdownMs(null);
                           broadcast("stage_sync", { countdownTarget: null, countdownPausedMs: null });
                         }}
                         className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs font-bold py-2 rounded transition border border-red-900/50"
                       >
                         Reset
                       </button>
                    </div>
                  </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
