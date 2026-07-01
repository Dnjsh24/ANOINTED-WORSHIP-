// Chromatic scale for note calculations
export const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ENHARMONIC_MAP: Record<string, string> = {
  "Db": "C#",
  "Eb": "D#",
  "Gb": "F#",
  "Ab": "G#",
  "Bb": "A#",
  "B#": "C",
  "Cb": "B",
  "E#": "F",
  "Fb": "E"
};

export function normalizeNoteName(note: string): string {
  return ENHARMONIC_MAP[note] ?? note;
}

// Represents guitar fret positions (string 1-6: E-low to E-high)
// null means mute (X), 0 means open (O), numbers are fret positions.
export interface GuitarShape {
  frets: (number | "x")[];
  barre?: { fret: number; startString: number; endString: number };
  baseFret?: number;
}

// Mapping of normalized root + quality to guitar shapes
const GUITAR_DATABASE: Record<string, GuitarShape> = {
  "C": { frets: ["x", 3, 2, 0, 1, 0] },
  "Cm": { frets: ["x", 3, 5, 5, 4, 3], baseFret: 3 },
  "C7": { frets: ["x", 3, 2, 3, 1, 0] },
  "Cmaj7": { frets: ["x", 3, 2, 0, 0, 0] },
  "Csus4": { frets: ["x", 3, 3, 0, 1, 1] },
  "C/F": { frets: [1, 3, 2, 0, 1, 0] },

  "C#": { frets: ["x", 4, 6, 6, 6, 4], baseFret: 4 },
  "C#m": { frets: ["x", 4, 6, 6, 5, 4], baseFret: 4 },
  "C#7": { frets: ["x", 4, 6, 4, 6, 4], baseFret: 4 },
  "C#sus4": { frets: ["x", 4, 6, 6, 7, 4], baseFret: 4 },

  "D": { frets: ["x", "x", 0, 2, 3, 2] },
  "Dm": { frets: ["x", "x", 0, 2, 3, 1] },
  "D7": { frets: ["x", "x", 0, 2, 1, 2] },
  "Dmaj7": { frets: ["x", "x", 0, 2, 2, 2] },
  "Dsus4": { frets: ["x", "x", 0, 2, 3, 3] },
  "D/G": { frets: [3, "x", 0, 2, 3, 2] },

  "D#": { frets: ["x", 6, 8, 8, 8, 6], baseFret: 6 },
  "D#m": { frets: ["x", 6, 8, 8, 7, 6], baseFret: 6 },
  "D#sus4": { frets: ["x", 6, 8, 8, 9, 6], baseFret: 6 },

  "E": { frets: [0, 2, 2, 1, 0, 0] },
  "Em": { frets: [0, 2, 2, 0, 0, 0] },
  "E7": { frets: [0, 2, 0, 1, 0, 0] },
  "Emaj7": { frets: [0, 2, 1, 1, 0, 0] },
  "Esus4": { frets: [0, 2, 2, 2, 0, 0] },

  "F": { frets: [1, 3, 3, 2, 1, 1] },
  "Fm": { frets: [1, 3, 3, 1, 1, 1] },
  "F7": { frets: [1, 3, 1, 2, 1, 1] },
  "Fmaj7": { frets: ["x", "x", 3, 2, 1, 0] },
  "Fsus4": { frets: [1, 3, 3, 3, 1, 1] },
  "F/Bb": { frets: ["x", 1, 3, 2, 1, 1] },
  "F/C": { frets: [3, 3, 3, 2, 1, 1] },

  "F#": { frets: [2, 4, 4, 3, 2, 2], baseFret: 2 },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], baseFret: 2 },
  "F#7": { frets: [2, 4, 2, 3, 2, 2], baseFret: 2 },
  "F#sus4": { frets: [2, 4, 4, 4, 2, 2], baseFret: 2 },

  "G": { frets: [3, 2, 0, 0, 0, 3] },
  "Gm": { frets: [3, 5, 5, 3, 3, 3], baseFret: 3 },
  "G7": { frets: [3, 2, 0, 0, 0, 1] },
  "Gmaj7": { frets: [3, 2, 0, 0, 0, 2] },
  "Gsus4": { frets: [3, 3, 0, 0, 1, 3] },
  "G/B": { frets: ["x", 2, 0, 0, 0, 3] },
  "G/C": { frets: [3, 3, 2, 0, 1, 3] },

  "G#": { frets: [4, 6, 6, 5, 4, 4], baseFret: 4 },
  "G#m": { frets: [4, 6, 6, 4, 4, 4], baseFret: 4 },
  "G#sus4": { frets: [4, 6, 6, 6, 4, 4], baseFret: 4 },

  "A": { frets: ["x", 0, 2, 2, 2, 0] },
  "Am": { frets: ["x", 0, 2, 2, 1, 0] },
  "A7": { frets: ["x", 0, 2, 0, 2, 0] },
  "Amaj7": { frets: ["x", 0, 2, 1, 2, 0] },
  "Asus4": { frets: ["x", 0, 2, 2, 3, 0] },
  "A/Db": { frets: ["x", 4, 2, 2, 2, 0] },

  "A#": { frets: ["x", 1, 3, 3, 3, 1] },
  "A#m": { frets: ["x", 1, 3, 3, 2, 1] },
  "A#sus4": { frets: ["x", 1, 3, 3, 4, 1] },

  "B": { frets: ["x", 2, 4, 4, 4, 2], baseFret: 2 },
  "Bm": { frets: ["x", 2, 4, 4, 3, 2], baseFret: 2 },
  "B7": { frets: ["x", 2, 1, 2, 0, 2] },
  "Bmaj7": { frets: ["x", 2, 4, 3, 4, 2], baseFret: 2 },
  "Bsus4": { frets: ["x", 2, 4, 4, 5, 2], baseFret: 2 },
  "Bbm": { frets: ["x", 1, 3, 3, 2, 1] },
};

// Represents bass fretboard root note positions (string 1-4: E, A, D, G)
export interface BassShape {
  frets: (number | "x")[];
  baseFret?: number;
}

const BASS_DATABASE: Record<string, BassShape> = {
  "C": { frets: ["x", 3, "x", "x"] },
  "C#": { frets: ["x", 4, "x", "x"] },
  "D": { frets: ["x", 5, "x", "x"] },
  "D#": { frets: ["x", 6, "x", "x"] },
  "E": { frets: [0, "x", "x", "x"] },
  "F": { frets: [1, "x", "x", "x"] },
  "F#": { frets: [2, "x", "x", "x"] },
  "G": { frets: [3, "x", "x", "x"] },
  "G#": { frets: [4, "x", "x", "x"] },
  "A": { frets: ["x", 0, "x", "x"] },
  "A#": { frets: ["x", 1, "x", "x"] },
  "B": { frets: ["x", 2, "x", "x"] },
};

// Piano keys intervals (semitones from root note)
const PIANO_INTERVALS: Record<string, number[]> = {
  "major": [0, 4, 7],
  "m": [0, 3, 7],
  "minor": [0, 3, 7],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "m7": [0, 3, 7, 10],
  "sus4": [0, 5, 7],
  "5": [0, 7],
  "add9": [0, 4, 7, 14],
};

export function getGuitarChordShape(chord: string): GuitarShape {
  // Strip slash notes (e.g. C/F -> C) for shape lookup if not found directly
  const normalized = normalizeNoteName(chord.trim());
  if (GUITAR_DATABASE[normalized]) {
    return GUITAR_DATABASE[normalized];
  }

  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const mainChord = normalized.substring(0, slashIndex);
    if (GUITAR_DATABASE[mainChord]) {
      return GUITAR_DATABASE[mainChord];
    }
  }

  // Fallback: search main root + quality
  const match = normalized.match(/^([A-G]#?|Bb|Eb|Ab|Db|Gb)?(.*)$/);
  if (match) {
    const [, root, suffix] = match;
    const baseChord = (root ?? "C") + (suffix ?? "");
    if (GUITAR_DATABASE[baseChord]) {
      return GUITAR_DATABASE[baseChord];
    }
    if (GUITAR_DATABASE[root ?? "C"]) {
      return GUITAR_DATABASE[root ?? "C"];
    }
  }

  return { frets: [0, 0, 0, 0, 0, 0] }; // Empty fallback
}

export function getBassChordShape(chord: string): BassShape {
  const normalized = normalizeNoteName(chord.trim());
  
  // For bass, if it's a slash chord, the bass player plays the slash note!
  // e.g. C/F -> Bass plays F!
  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const bassNote = normalized.substring(slashIndex + 1);
    const bassNormalized = normalizeNoteName(bassNote);
    if (BASS_DATABASE[bassNormalized]) {
      return BASS_DATABASE[bassNormalized];
    }
  }

  const match = normalized.match(/^([A-G]#?|Bb|Eb|Ab|Db|Gb)?(.*)$/);
  if (match) {
    const [, root] = match;
    const cleanRoot = normalizeNoteName(root ?? "C");
    if (BASS_DATABASE[cleanRoot]) {
      return BASS_DATABASE[cleanRoot];
    }
  }

  return { frets: [0, "x", "x", "x"] };
}

export function getPianoKeys(chord: string): number[] {
  const normalized = normalizeNoteName(chord.trim());
  const match = normalized.match(/^([A-G]#?|Bb|Eb|Ab|Db|Gb)?(.*)$/);
  if (!match) return [0, 4, 7];

  const [, root, suffix] = match;
  const cleanRoot = normalizeNoteName(root ?? "C");
  const rootMidiIndex = CHROMATIC_SCALE.indexOf(cleanRoot);
  if (rootMidiIndex < 0) return [0, 4, 7];

  // Determine chord quality/intervals
  let intervals = PIANO_INTERVALS["major"];
  const cleanSuffix = suffix ?? "";
  if (cleanSuffix.startsWith("m") && !cleanSuffix.startsWith("maj")) {
    intervals = PIANO_INTERVALS["m"];
  } else if (cleanSuffix.startsWith("sus4")) {
    intervals = PIANO_INTERVALS["sus4"];
  } else if (cleanSuffix.startsWith("7")) {
    intervals = PIANO_INTERVALS["7"];
  } else if (cleanSuffix.startsWith("maj7")) {
    intervals = PIANO_INTERVALS["maj7"];
  } else if (cleanSuffix.startsWith("5")) {
    intervals = PIANO_INTERVALS["5"];
  } else if (cleanSuffix.startsWith("add9")) {
    intervals = PIANO_INTERVALS["add9"];
  }

  // Calculate absolute keyboard note positions (0 to 23 for 2 octaves)
  const keysToHighlight = intervals.map((interval) => (rootMidiIndex + interval) % 24);

  // If it's a slash chord, also highlight the bass note in the lower octave!
  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const bassNote = normalizeNoteName(normalized.substring(slashIndex + 1));
    const bassMidiIndex = CHROMATIC_SCALE.indexOf(bassNote);
    if (bassMidiIndex >= 0) {
      keysToHighlight.push(bassMidiIndex); // Add the bass note
    }
  }

  return Array.from(new Set(keysToHighlight));
}
