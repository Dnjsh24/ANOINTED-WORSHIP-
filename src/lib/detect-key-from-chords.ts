import { parseLyricsAndChords } from "@/lib/domain/chords";

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ENHARMONIC: Record<string, string> = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  "B#": "C", Cb: "B", "E#": "F", Fb: "E",
};

const SHARP_TO_FLAT: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
};

const FLATS = new Set(["Db", "Eb", "Gb", "Ab", "Bb"]);

const CHORD_TOKEN = /^([A-G](?:#|b)?)(.*)$/;

function normalizeRoot(root: string): string {
  return ENHARMONIC[root] ?? root;
}

function rootToIndex(root: string): number {
  return CHROMATIC.indexOf(normalizeRoot(root));
}

type Mode = "major" | "minor";
type Quality = "maj" | "min" | "dim" | "other";

interface ParsedChord {
  rootIndex: number;
  rawRoot: string;
  quality: Quality;
}

const MODE_INTERVALS: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10, 11],
};

const MODE_QUALITY: Record<Mode, Partial<Record<number, Quality[]>>> = {
  major: {
    0: ["maj"],
    2: ["min"],
    4: ["min"],
    5: ["maj"],
    7: ["maj"],
    9: ["min"],
    11: ["dim"],
  },
  minor: {
    0: ["min"],
    2: ["dim"],
    3: ["maj"],
    5: ["min"],
    7: ["min", "maj"],
    8: ["maj"],
    10: ["maj"],
    11: ["dim"],
  },
};

const DEFAULT_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function extractChordRoots(text: string): string[] {
  return parseChordsFromText(text).map((c) => CHROMATIC[c.rootIndex]);
}

export interface KeyResult {
  key: string;
  mode: Mode;
  score: number;
  matchCount: number;
  totalChords: number;
}

export function detectKey(chordRoots: string[]): KeyResult | null {
  const parsed: ParsedChord[] = [];
  for (const token of chordRoots) {
    const head = token.split("/")[0];
    const match = head.match(CHORD_TOKEN);
    if (!match) continue;
    const [, rawRoot, suffix] = match;
    const idx = rootToIndex(rawRoot);
    if (idx < 0) continue;
    parsed.push({
      rootIndex: idx,
      rawRoot,
      quality: inferQuality(suffix),
    });
  }
  if (parsed.length === 0) return null;
  const usesFlats = parsed.some((c) => c.rawRoot.includes("b") || FLATS.has(c.rawRoot));
  return scoreCandidates(parsed, usesFlats);
}

export function detectKeyFromText(text: string): KeyResult | null {
  const chords = parseChordsFromText(text);
  if (chords.length === 0) return null;
  const usesFlats = chords.some((c) => c.rawRoot.includes("b") || FLATS.has(c.rawRoot));
  return scoreCandidates(chords, usesFlats);
}

function parseChordsFromText(text: string): ParsedChord[] {
  const sections = parseLyricsAndChords(text);
  const parsed: ParsedChord[] = [];

  for (const section of sections) {
    for (const line of section.lines) {
      if (!line.chords) continue;
      const tokens = line.chords.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        const head = token.split("/")[0];
        const match = head.match(CHORD_TOKEN);
        if (!match) continue;
        const [, rawRoot, suffix] = match;
        const idx = rootToIndex(rawRoot);
        if (idx < 0) continue;
        parsed.push({
          rootIndex: idx,
          rawRoot,
          quality: inferQuality(suffix),
        });
      }
    }
  }

  return parsed;
}

function inferQuality(suffix: string): Quality {
  const s = suffix.toLowerCase();
  if (!s) return "maj";
  if (s.startsWith("maj")) return "maj";
  if (s.startsWith("min")) return "min";
  if (/^m(?!aj)/.test(s)) return "min";
  if (s.includes("dim") || s.includes("o") || s.includes("°")) return "dim";
  return "other";
}

function scoreCandidates(chords: ParsedChord[], usesFlats: boolean): KeyResult {
  const total = chords.length;

  const candidates: Array<{ tonic: number; mode: Mode; score: number; matchCount: number }> = [];

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as const) {
      const inScale = new Set(MODE_INTERVALS[mode]);
      const qualityMap = MODE_QUALITY[mode];
      let score = 0;
      let matchCount = 0;

      for (let i = 0; i < chords.length; i++) {
        const chord = chords[i];
        const interval = (chord.rootIndex - tonic + 12) % 12;

        if (inScale.has(interval)) {
          matchCount += 1;
          score += 1;
          const expected = qualityMap[interval] ?? [];
          if (expected.includes(chord.quality)) {
            score += 0.45;
          } else if (chord.quality === "other") {
            score += 0.15;
          } else {
            score -= 0.2;
          }
        } else {
          score -= 0.45;
        }

        if (i > 0) {
          const prev = chords[i - 1];
          const prevInterval = (prev.rootIndex - tonic + 12) % 12;
          if (prevInterval === 7 && interval === 0) score += 0.85; // V -> I / i
          if (prevInterval === 5 && interval === 0) score += 0.45; // IV -> I / iv -> i
          if (prevInterval === 11 && interval === 0) score += 0.55; // vii° -> I/i
        }
      }

      const firstInterval = (chords[0].rootIndex - tonic + 12) % 12;
      const lastInterval = (chords[chords.length - 1].rootIndex - tonic + 12) % 12;
      if (firstInterval === 0) score += 0.95;
      if (lastInterval === 0) score += 0.35;

      candidates.push({ tonic, mode, score, matchCount });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1] ?? best;

  const coverage = best.matchCount / total;
  const margin = Math.max(0, best.score - second.score);
  const confidence = Math.min(1, coverage * 0.7 + Math.min(1, margin / 4) * 0.3);

  const names = usesFlats ? FLAT_KEY_NAMES : DEFAULT_KEY_NAMES;
  let keyName = names[best.tonic];
  if (!usesFlats && SHARP_TO_FLAT[keyName] && (keyName === "D#" || keyName === "A#" || keyName === "G#")) {
    keyName = SHARP_TO_FLAT[keyName];
  }

  return {
    key: keyName,
    mode: best.mode,
    score: confidence,
    matchCount: best.matchCount,
    totalChords: total,
  };
}
