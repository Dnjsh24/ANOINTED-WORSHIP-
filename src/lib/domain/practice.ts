import type { ArrangementSection } from "@/lib/domain/arrangements";

export interface PracticeSetlistSong {
  slotId: string;
  songId: string;
  order: number;
  title: string;
  lead?: string;
  assignedKey: string;
  originalKey: string;
  arrangement: string | null;
  arrangementSections: ArrangementSection[] | null;
  lyricsChords: string;
  bpm: number | null;
  timeSignature: string;
  youtubeUrl: string | null;
  spotifyUrl: string | null;
}

export type PlaybackState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "unavailable";

export type MediaProvider = "youtube" | "spotify";

/**
 * Extracts YouTube Video ID from various URL formats.
 */
export function getYouTubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.trim().match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

/**
 * Parses Spotify track URL and returns Spotify embed metadata.
 */
export function getSpotifyTrackInfo(
  url?: string | null,
): { trackId: string; embedUrl: string; externalUrl: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" || parsed.hostname !== "open.spotify.com") return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    const trackIdx = segments.indexOf("track");
    const trackId = trackIdx >= 0 ? segments[trackIdx + 1] : undefined;
    if (!trackId || !/^[A-Za-z0-9]{22}$/.test(trackId)) return null;

    return {
      trackId,
      embedUrl: `https://open.spotify.com/embed/track/${trackId}`,
      externalUrl: `https://open.spotify.com/track/${trackId}`,
    };
  } catch {
    return null;
  }
}

/**
 * Determines the preferred media provider based on URL availability.
 * YouTube is preferred when both exist.
 */
export function getPreferredProvider(
  youtubeUrl?: string | null,
  spotifyUrl?: string | null,
): MediaProvider | null {
  if (getYouTubeVideoId(youtubeUrl)) return "youtube";
  if (getSpotifyTrackInfo(spotifyUrl)) return "spotify";
  return null;
}

export interface ParsedTimeSignature {
  beatsPerMeasure: number;
  beatUnit: number;
  display: string;
}

/**
 * Parses time signature strings (e.g., "4/4", "3/4", "6/8") into beats per measure.
 * Falls back to 4/4 if invalid or missing.
 */
export function parseTimeSignature(timeSig?: string | null): ParsedTimeSignature {
  if (!timeSig || typeof timeSig !== "string") {
    return { beatsPerMeasure: 4, beatUnit: 4, display: "4/4" };
  }

  const trimmed = timeSig.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) {
    return { beatsPerMeasure: 4, beatUnit: 4, display: "4/4" };
  }

  const beats = parseInt(match[1], 10);
  const unit = parseInt(match[2], 10);

  if (isNaN(beats) || beats < 1 || beats > 32 || isNaN(unit) || unit < 1 || unit > 32) {
    return { beatsPerMeasure: 4, beatUnit: 4, display: "4/4" };
  }

  return { beatsPerMeasure: beats, beatUnit: unit, display: `${beats}/${unit}` };
}
