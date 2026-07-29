import {
  defaultPresentationSettings,
  generateSongSlides,
  type PresentationSettings,
  type PresentationSlide,
  type SceneLayer,
  type SlideBlock,
} from "@/lib/domain/presentation";

export const LIVE_SNAPSHOT_VERSION = 1 as const;

export type PublishedPresentationSlide = PresentationSlide & {
  sourceSlideId: string;
  setlistSongId: string;
};

export type PublishedPresentationItem = {
  setlistSongId: string;
  songId: string;
  title: string;
  lyricsChords: string;
  notes: string;
  slides: PublishedPresentationSlide[];
};

export type LivePresentationSnapshot = {
  version: typeof LIVE_SNAPSHOT_VERSION;
  setlistId: string;
  setlistName: string;
  revision: number;
  publishedAt: string;
  linesPerSlide: number;
  settings: PresentationSettings;
  items: PublishedPresentationItem[];
};

export type PresentationDraft = {
  lyricsBySetlistSongId?: Record<string, string>;
  slideOverrides?: Record<string, SlideBlock[]>;
  sceneLayers?: Record<string, SceneLayer[]>;
};

export type SnapshotSetlist = {
  id: string;
  name: string;
  songs: Array<{
    id: string;
    song: {
      id?: string;
      title: string;
      lyricsChords: string;
      notes?: string;
    };
  }>;
};

export function namespacedSlideId(setlistSongId: string, sourceSlideId: string) {
  return `${setlistSongId}:${sourceSlideId}`;
}

/**
 * Builds the single immutable payload consumed by Remote, Projector and
 * Confidence. Remote never rebuilds live slides from stale song data.
 */
export function buildLivePresentationSnapshot(input: {
  setlist: SnapshotSetlist;
  revision: number;
  publishedAt?: string;
  linesPerSlide?: number;
  settings?: PresentationSettings;
  draft?: PresentationDraft;
}): LivePresentationSnapshot {
  const linesPerSlide = Math.max(1, Math.min(8, Math.trunc(input.linesPerSlide || 4)));
  const slideOverrides = input.draft?.slideOverrides || {};
  const sceneLayers = input.draft?.sceneLayers || {};

  return {
    version: LIVE_SNAPSHOT_VERSION,
    setlistId: input.setlist.id,
    setlistName: input.setlist.name,
    revision: Math.max(0, Math.trunc(input.revision)),
    publishedAt: input.publishedAt || new Date().toISOString(),
    linesPerSlide,
    settings: input.settings || defaultPresentationSettings,
    items: input.setlist.songs.map((item) => {
      const lyricsChords = input.draft?.lyricsBySetlistSongId?.[item.id] ?? item.song.lyricsChords ?? "";
      const slides = generateSongSlides(lyricsChords, linesPerSlide).map((slide) => {
        const id = namespacedSlideId(item.id, slide.id);
        return {
          ...slide,
          id,
          sourceSlideId: slide.id,
          setlistSongId: item.id,
          // New namespaced keys take priority. The source-ID fallback keeps
          // existing draft edits readable until they are saved once again.
          blocks: slideOverrides[id] ?? slideOverrides[slide.id],
          sceneLayers: sceneLayers[id] ?? sceneLayers[slide.id],
        };
      });
      return {
        setlistSongId: item.id,
        songId: item.song.id || item.id,
        title: item.song.title,
        lyricsChords,
        notes: item.song.notes || "",
        slides,
      };
    }),
  };
}

export function isLivePresentationSnapshot(value: unknown): value is LivePresentationSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<LivePresentationSnapshot>;
  return snapshot.version === LIVE_SNAPSHOT_VERSION
    && typeof snapshot.setlistId === "string"
    && typeof snapshot.setlistName === "string"
    && Number.isInteger(snapshot.revision)
    && typeof snapshot.publishedAt === "string"
    && Array.isArray(snapshot.items)
    && snapshot.items.every((item) => Boolean(item)
      && typeof item.setlistSongId === "string"
      && typeof item.title === "string"
      && Array.isArray(item.slides)
      && item.slides.every((slide) => Boolean(slide)
        && typeof slide.id === "string"
        && slide.id.startsWith(`${item.setlistSongId}:`)
        && Array.isArray(slide.content)));
}
