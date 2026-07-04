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

const CHORD_ROOT_ONLY = /[A-G](?:#|b)?/g;

function normalizeRoot(root: string): string {
  return ENHARMONIC[root] ?? root;
}

function rootToIndex(root: string): number {
  return CHROMATIC.indexOf(normalizeRoot(root));
}

function diatonicRoots(tonic: string, mode: "major" | "minor"): string[] {
  const idx = rootToIndex(tonic);
  if (idx < 0) return [];
  const intervals = mode === "major"
    ? [0, 2, 4, 5, 7, 9, 11]
    : [0, 2, 3, 5, 7, 8, 10];
  return intervals.map((i) => CHROMATIC[(idx + i) % 12]);
}

const UNIQUE_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function extractChordRoots(text: string): string[] {
  const sections = parseLyricsAndChords(text);
  const roots: string[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      if (!line.chords) continue;
      const matches = line.chords.match(CHORD_ROOT_ONLY);
      if (!matches) continue;
      for (const m of matches) {
        roots.push(normalizeRoot(m));
      }
    }
  }
  return roots;
}

export interface KeyResult {
  key: string;
  score: number;
  matchCount: number;
  totalChords: number;
}

export function detectKey(chordRoots: string[]): KeyResult | null {
  if (chordRoots.length === 0) return null;

  const uniqueRoots = Array.from(new Set(chordRoots));
  const rootCount = chordRoots.length;

  // Check if input uses flat notation
  const usesFlats = chordRoots.some((r) => FLATS.has(r));

  interface Scored {
    key: string;
    score: number;
    matchCount: number;
    firstRootIsTonic: boolean;
    lastRootIsTonic: boolean;
  }

  const scored: Scored[] = [];

  for (const key of UNIQUE_KEYS) {
    const majorRoots = diatonicRoots(key, "major");
    const majorMatchCount = uniqueRoots.filter((r) => majorRoots.includes(r)).length;

    const minorRoots = diatonicRoots(key, "minor");
    const minorMatchCount = uniqueRoots.filter((r) => minorRoots.includes(r)).length;

    const matchCount = Math.max(majorMatchCount, minorMatchCount);
    const coverageScore = matchCount / uniqueRoots.length;

    const keyNormalized = normalizeRoot(key);
    const firstRoot = normalizeRoot(chordRoots[0]);
    const lastRoot = normalizeRoot(chordRoots[rootCount - 1]);

    const firstRootIsTonic = firstRoot === keyNormalized;
    const lastRootIsTonic = lastRoot === keyNormalized;

    let confidence = coverageScore;
    if (firstRootIsTonic) confidence += 0.2;
    if (lastRootIsTonic) confidence += 0.1;

    scored.push({
      key,
      score: confidence,
      matchCount,
      firstRootIsTonic,
      lastRootIsTonic,
    });
  }

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
    if (a.firstRootIsTonic !== b.firstRootIsTonic) return a.firstRootIsTonic ? -1 : 1;
    if (a.lastRootIsTonic !== b.lastRootIsTonic) return a.lastRootIsTonic ? -1 : 1;
    return 0;
  });

  const best = scored[0];

  // Convert to flat notation if the input chords use flats
  let keyName = best.key;
  if (usesFlats && SHARP_TO_FLAT[keyName]) {
    keyName = SHARP_TO_FLAT[keyName];
  }

  return {
    key: keyName,
    score: best.score,
    matchCount: best.matchCount,
    totalChords: uniqueRoots.length,
  };
}
