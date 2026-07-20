import { parseLyricsAndChords, type SongSection } from "./chords";

export interface SlideBlock {
  id: string;
  text: string;
  x: number; // 0-100 percentage based on canvas width
  y: number; // 0-100 percentage based on canvas height
  startTime: number; // in seconds relative to slide start
  duration: number; // in seconds
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  entranceAnimation?: string;
  entranceDuration?: number;
  entranceDelay?: number;
  entranceCurve?: string;
  exitAnimation?: string;
  exitDuration?: number;
  exitDelay?: number;
  exitCurve?: string;
}

export interface PresentationSlide {
  id: string;
  type: "lyrics" | "teaching" | "blank";
  content: string[]; // Array of lines to display
  chordLines?: { lyric: string; chords?: string }[]; // Full chord payload for confidence monitor
  blocks?: SlideBlock[]; // Independent word/line blocks for kinetic typography
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
  slideTransition: "None" | "Crossfade" | "Slide Up" | "Slide Down";
  entranceAnimation: "None" | "Appear" | "Fade In" | "Slide In Up" | "Slide In Down" | "Slide In Left" | "Slide In Right" | "Mask In Up";
  entranceDuration: number;
  entranceDelay: number;
  entranceCurve: string;
  exitAnimation: "None" | "Disappear" | "Fade Out" | "Slide Out Up" | "Slide Out Down" | "Slide Out Left" | "Slide Out Right" | "Mask Out Up";
  exitDuration: number;
  exitDelay: number;
  exitCurve: string;
  kineticMode: string;
  kineticAnimationOrder: string;
  kineticStaggerDelay: number;
  kineticSmoothingCurve: string;
  kineticDirection: string;
  kineticTravelDistance: number;
  kineticSegmentDuration: number;
  backgroundMediaUrl?: string;
  backgroundMediaType?: "image" | "video";
  slideDurations?: Record<string, number>;
}

export const defaultPresentationSettings: PresentationSettings = {
  fontFamily: "Inter, sans-serif",
  fontSize: 200,
  bold: true,
  italic: false,
  underline: false,
  align: "center",
  color: "#ffffff",
  backgroundColor: "#050505",
  showShadow: true,
  slideTransition: "Crossfade",
  entranceAnimation: "Appear",
  entranceDuration: 1.0,
  entranceDelay: 0.2,
  entranceCurve: "Ease Out",
  exitAnimation: "Fade Out",
  exitDuration: 0.5,
  exitDelay: 0,
  exitCurve: "Ease In",
  kineticMode: "Line by Line",
  kineticAnimationOrder: "Forward",
  kineticStaggerDelay: 0.1,
  kineticSmoothingCurve: "Ease Out",
  kineticDirection: "Bottom to Top",
  kineticTravelDistance: 50,
  kineticSegmentDuration: 2.0,
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
    const validLines = section.lines
      .filter((line) => line.lyric && line.lyric.trim().length > 0);

    if (validLines.length === 0) return;

    // Chunk into slides
    for (let i = 0; i < validLines.length; i += linesPerSlide) {
      const chunk = validLines.slice(i, i + linesPerSlide);
      slides.push({
        id: `slide-sec${sIndex}-${i}-reflow${linesPerSlide}`,
        type: "lyrics",
        content: chunk.map(c => c.lyric.trim()),
        chordLines: chunk,
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
