/**
 * Domain logic for advanced Practice Mode features:
 * - Guitar chord diagram data mappings
 * - Song confidence ratings
 * - Practice checklist items
 * - Practice session logs
 * - Vocal range indicator helper
 */

// 1. Guitar Chord Diagram Definitions
export type ChordFingering = {
  frets: (number | -1)[]; // [Low E, A, D, G, B, High E], -1 = muted (X), 0 = open (O)
  fingers?: number[]; // [Low E, A, D, G, B, High E], 1=Index, 2=Middle, 3=Ring, 4=Pinky
  barre?: { fret: number; fromString: number; toString: number }; // 1=High E, 6=Low E
  baseFret?: number; // Starting fret index if high on neck
};

// Common guitar chord fingering database
const CHORD_DIAGRAMS: Record<string, ChordFingering> = {
  // C Chords
  C: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  Cm: { frets: [-1, 3, 5, 5, 4, 3], baseFret: 1, barre: { fret: 3, fromString: 1, toString: 5 } },
  C7: { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  Cadd9: { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4] },
  "C/E": { frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },

  // D Chords
  D: { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  D7: { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
  "D/F#": { frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3] },

  // E Chords
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  Em7: { frets: [0, 2, 2, 0, 3, 0], fingers: [0, 1, 2, 0, 3, 0] },
  Esus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0] },

  // F Chords
  F: { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, barre: { fret: 1, fromString: 1, toString: 6 } },
  Fm: { frets: [1, 3, 3, 1, 1, 1], baseFret: 1, barre: { fret: 1, fromString: 1, toString: 6 } },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], baseFret: 2, barre: { fret: 2, fromString: 1, toString: 6 } },
  "F#": { frets: [2, 4, 4, 3, 2, 2], baseFret: 2, barre: { fret: 2, fromString: 1, toString: 6 } },

  // G Chords
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  Gm: { frets: [3, 5, 5, 3, 3, 3], baseFret: 3, barre: { fret: 3, fromString: 1, toString: 6 } },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  Gsus4: { frets: [3, 3, 0, 0, 1, 3], fingers: [3, 2, 0, 0, 1, 4] },
  "G/B": { frets: [-1, 2, 0, 0, 0, 3], fingers: [0, 1, 0, 0, 0, 2] },

  // A Chords
  A: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Am: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  A7: { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0] },
  Am7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  Asus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
  "A/C#": { frets: [-1, 4, 2, 2, 2, 0], baseFret: 1, fingers: [0, 4, 1, 2, 3, 0] },

  // B Chords
  B: { frets: [-1, 2, 4, 4, 4, 2], baseFret: 2, barre: { fret: 2, fromString: 1, toString: 5 } },
  Bm: { frets: [-1, 2, 4, 4, 3, 2], baseFret: 2, barre: { fret: 2, fromString: 1, toString: 5 } },
  B7: { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  Bm7: { frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 1, 0, 2, 0, 3] },
  Bb: { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, barre: { fret: 1, fromString: 1, toString: 5 } },
  Bbm: { frets: [-1, 1, 3, 3, 2, 1], baseFret: 1, barre: { fret: 1, fromString: 1, toString: 5 } },
};

/**
 * Returns a guitar chord fingering definition for a given chord name.
 * Normalizes root variations (e.g. C#m vs Dbm).
 */
export function getGuitarChordDiagram(chordName: string): ChordFingering | null {
  if (!chordName) return null;
  const clean = chordName.trim();
  if (CHORD_DIAGRAMS[clean]) return CHORD_DIAGRAMS[clean];

  // Try root normalization (e.g., C#m -> F#m pattern or C# -> Db)
  const normalized = clean
    .replace("C#", "Db")
    .replace("D#", "Eb")
    .replace("F#", "Gb")
    .replace("G#", "Ab")
    .replace("A#", "Bb");

  if (CHORD_DIAGRAMS[normalized]) return CHORD_DIAGRAMS[normalized];

  // Fallback: match root + basic chord quality (e.g., Cmaj7 -> C)
  const baseMatch = clean.match(/^([A-G][#b]?)(m|7|maj7|add9|sus4|sus2)?/);
  if (baseMatch) {
    const baseChord = baseMatch[1] + (baseMatch[2] === "m" ? "m" : "");
    if (CHORD_DIAGRAMS[baseChord]) return CHORD_DIAGRAMS[baseChord];
    if (CHORD_DIAGRAMS[baseMatch[1]]) return CHORD_DIAGRAMS[baseMatch[1]];
  }

  return null;
}

// 2. Song Readiness Confidence Rating
export type ReadinessRating = "NOT_READY" | "GETTING_THERE" | "READY";

export function getSongConfidence(setlistId: string, songSlotId: string): ReadinessRating | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`confidence_${setlistId}_${songSlotId}`);
    if (raw === "NOT_READY" || raw === "GETTING_THERE" || raw === "READY") {
      return raw;
    }
  } catch {
    // ignore
  }
  return null;
}

export function setSongConfidence(
  setlistId: string,
  songSlotId: string,
  rating: ReadinessRating | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = `confidence_${setlistId}_${songSlotId}`;
    if (!rating) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, rating);
    }
  } catch {
    // ignore
  }
}

// 3. Song Practice Checklist
export type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export const DEFAULT_CHECKLIST_ITEMS: Omit<ChecklistItem, "id" | "completed">[] = [
  { text: "Review Intro & Outro Transitions" },
  { text: "Practice Verse & Chorus Chords" },
  { text: "Check Key & Vocal Comfort Range" },
  { text: "Run Through Full Song with Metronome" },
];

export function getSongChecklist(setlistId: string, songSlotId: string): ChecklistItem[] {
  if (typeof window === "undefined") {
    return DEFAULT_CHECKLIST_ITEMS.map((item, idx) => ({ ...item, id: `chk_${idx}`, completed: false }));
  }
  try {
    const raw = localStorage.getItem(`checklist_${setlistId}_${songSlotId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_CHECKLIST_ITEMS.map((item, idx) => ({
    id: `chk_${idx}`,
    text: item.text,
    completed: false,
  }));
}

export function saveSongChecklist(setlistId: string, songSlotId: string, items: ChecklistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`checklist_${setlistId}_${songSlotId}`, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// 4. Practice Session History & Timer Log
export type PracticeSessionEntry = {
  setlistId: string;
  date: string; // ISO date string
  totalSeconds: number;
  songSeconds: Record<string, number>; // slotId -> seconds
};

export function getPracticeHistory(setlistId: string): PracticeSessionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`practice_history_${setlistId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function savePracticeSession(entry: PracticeSessionEntry): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getPracticeHistory(entry.setlistId);
    const updated = [entry, ...existing.slice(0, 19)]; // Keep latest 20 sessions
    localStorage.setItem(`practice_history_${entry.setlistId}`, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// 5. Vocal Range Evaluator
export type VocalRangeAssessment = {
  status: "COMFORTABLE" | "HIGH" | "LOW";
  recommendation: string;
};

export function evaluateVocalRange(assignedKey: string): VocalRangeAssessment {
  if (!assignedKey) return { status: "COMFORTABLE", recommendation: "Standard Key" };

  const keyUpper = assignedKey.trim().toUpperCase();
  const isMinor = keyUpper.includes("M");

  // High pitch keys for typical male lead: E, F, F#, G, Ab
  // High pitch keys for typical female lead: B, C, Db, D
  if (["F#", "G", "AB", "A", "BB"].includes(keyUpper.replace("M", ""))) {
    return {
      status: "HIGH",
      recommendation: "Key is in upper vocal tessitura. Consider capo or key adjustment if strained.",
    };
  }

  if (["C#", "DB", "D"].includes(keyUpper.replace("M", ""))) {
    return {
      status: "LOW",
      recommendation: "Key is low. Great for deeper lead vocals.",
    };
  }

  return {
    status: "COMFORTABLE",
    recommendation: isMinor ? "Minor key – smooth vocal range." : "Optimal vocal range for lead vocalist.",
  };
}
