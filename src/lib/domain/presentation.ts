import { parseLyricsAndChords, type SongSection } from "./chords";

export interface PresentationSlide {
  id: string;
  type: "lyrics" | "teaching" | "blank";
  content: string[]; // Array of lines to display
  sectionLabel?: string;
  notes?: string;
  mediaUrl?: string; // For teaching/image slides
}

export interface PresentationSettings {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
  backgroundColor: string;
  showShadow: boolean;
  entranceAnimation: "none" | "fade" | "slide-up" | "zoom-in";
  exitAnimation: "none" | "fade" | "slide-down" | "zoom-out";
}

export const defaultPresentationSettings: PresentationSettings = {
  fontFamily: "Inter",
  fontSize: 100,
  bold: true,
  italic: false,
  underline: false,
  align: "center",
  color: "#ffffff",
  backgroundColor: "#000000",
  showShadow: true,
  entranceAnimation: "none",
  exitAnimation: "none",
};

export interface PresentationBlock {
  id: string;
  title: string;
  slides: PresentationSlide[];
}

/**
 * Converts raw song lyrics/chords text into a series of slides.
 * @param text The raw lyrics and chords text
 * @param linesPerSlide How many lines of lyrics to group per slide (default 4)
 */
export function generateSongSlides(text: string, linesPerSlide: number = 4): PresentationSlide[] {
  if (!text) return [];

  const sections = parseLyricsAndChords(text);
  const slides: PresentationSlide[] = [];

  sections.forEach((section, sIndex) => {
    // Filter out lines that only have chords but no lyrics, or empty lyrics
    const lyricLines = section.lines
      .filter((line) => line.lyric && line.lyric.trim().length > 0)
      .map((line) => line.lyric.trim());

    if (lyricLines.length === 0) return;

    // Chunk into slides
    for (let i = 0; i < lyricLines.length; i += linesPerSlide) {
      const chunk = lyricLines.slice(i, i + linesPerSlide);
      slides.push({
        id: `slide-sec${sIndex}-${i}`,
        type: "lyrics",
        content: chunk,
        sectionLabel: section.label,
      });
    }
  });

  return slides;
}

/**
 * Converts raw teaching text (markdown or plain text) into slides.
 * Assumes paragraphs (separated by double newlines) are separate slides.
 */
export function generateTeachingSlides(text: string): PresentationSlide[] {
  if (!text) return [];

  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((p, i) => {
    const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
    return {
      id: `teaching-${i}`,
      type: "teaching",
      content: lines,
    };
  });
}
