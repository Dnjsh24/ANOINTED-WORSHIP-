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
 * Extracts YouTube Video ID from various URL formats, including Shorts, Music, embeds, and raw 11-char IDs.
 */
export function getYouTubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const regExp = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|v\/)|music\.youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  if (match && match[1]) return match[1];

  const vMatch = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (vMatch && vMatch[1]) return vMatch[1];

  return null;
}

/**
 * Parses Spotify track URL / URI and returns Spotify embed metadata.
 * Supports standard URLs, internationalized URLs (open.spotify.com/intl-xx/track/...), and URIs (spotify:track:...).
 */
export function getSpotifyTrackInfo(
  url?: string | null,
): { trackId: string; embedUrl: string; externalUrl: string } | null {
  if (!url) return null;
  const trimmed = url.trim();

  const uriMatch = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uriMatch && uriMatch[1]) {
    const trackId = uriMatch[1];
    return {
      trackId,
      embedUrl: `https://open.spotify.com/embed/track/${trackId}`,
      externalUrl: `https://open.spotify.com/track/${trackId}`,
    };
  }

  const match = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/);
  if (match && match[1]) {
    const trackId = match[1];
    return {
      trackId,
      embedUrl: `https://open.spotify.com/embed/track/${trackId}`,
      externalUrl: `https://open.spotify.com/track/${trackId}`,
    };
  }

  return null;
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

/**
 * Parses time signature string (e.g. "4/4", "3/4", "6/8") into beats per measure.
 * Defaults to 4 beats per measure if invalid.
 */
export function parseTimeSignature(timeSignature?: string | null): {
  beatsPerMeasure: number;
  beatValue: number;
  beatUnit: number;
  display: string;
} {
  if (!timeSignature) return { beatsPerMeasure: 4, beatValue: 4, beatUnit: 4, display: "4/4" };
  const parts = timeSignature.trim().split("/");
  const beats = parseInt(parts[0], 10);
  const value = parseInt(parts[1], 10);

  const safeBeats = !isNaN(beats) && beats > 0 && beats <= 16 ? beats : 4;
  const safeValue = !isNaN(value) && value > 0 && value <= 16 ? value : 4;

  return {
    beatsPerMeasure: safeBeats,
    beatValue: safeValue,
    beatUnit: safeValue,
    display: `${safeBeats}/${safeValue}`,
  };
}
