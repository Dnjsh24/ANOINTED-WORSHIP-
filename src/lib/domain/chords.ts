const sharpScale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const flatScale = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const enharmonic: Record<string, string> = {
  "B#": "C",
  Cb: "B",
  "E#": "F",
  Fb: "E",
};

const chordPattern = /^([A-G](?:#|b)?)(.*)$/;

export function normalizeRoot(root: string) {
  return enharmonic[root] ?? root;
}

export function transposeChord(chord: string, fromKey: string, toKey: string) {
  const match = chord.trim().match(chordPattern);
  if (!match) return chord;

  const [, root, suffix] = match;
  const scale = toKey.includes("b") || root.includes("b") ? flatScale : sharpScale;
  const fromIndex = rootIndex(fromKey);
  const toIndex = rootIndex(toKey);
  const chordIndex = rootIndex(normalizeRoot(root));

  if (fromIndex < 0 || toIndex < 0 || chordIndex < 0) return chord;

  const interval = toIndex - fromIndex;
  const nextIndex = (chordIndex + interval + 120) % 12;

  return `${scale[nextIndex]}${suffix}`;
}

export function transposeProgression(progression: string, fromKey: string, toKey: string) {
  return progression
    .split(/(\s+|\/)/)
    .map((part) => {
      if (!part.trim() || part === "/") return part;
      return transposeChord(part, fromKey, toKey);
    })
    .join("");
}

export function chordToNashville(chord: string, key: string): string {
  const trimmed = chord.trim();
  if (trimmed.includes("/")) {
    const [main, bass] = trimmed.split("/");
    return `${chordToNashville(main, key)}/${chordToNashville(bass, key)}`;
  }

  const match = trimmed.match(chordPattern);
  if (!match) return chord;

  const [, root, suffix] = match;
  const keyIndex = rootIndex(key);
  const chordIndex = rootIndex(normalizeRoot(root));

  if (keyIndex < 0 || chordIndex < 0) return chord;

  const degree = ((chordIndex - keyIndex + 12) % 12);
  const number = nashvilleMap[degree] ?? "?";
  const minor = suffix.startsWith("m") && !suffix.startsWith("maj") ? "m" : "";
  const remainingSuffix = suffix.startsWith("m") && !suffix.startsWith("maj") ? suffix.substring(1) : suffix;

  return `${number}${minor}${remainingSuffix}`;
}

export function progressionToNashville(progression: string, key: string) {
  return progression
    .split(/(\s+|\/)/)
    .map((part) => {
      if (!part.trim() || part === "/") return part;
      return chordToNashville(part, key);
    })
    .join("");
}

export function capoSuggestion(originalKey: string, targetKey: string) {
  const original = rootIndex(originalKey);
  const target = rootIndex(targetKey);
  if (original < 0 || target < 0) return null;

  const semitones = (target - original + 12) % 12;
  if (semitones === 0) return "Open";
  if (semitones <= 5) return `Capo ${semitones}`;

  return null;
}

function rootIndex(root: string) {
  const normalized = normalizeRoot(root);
  const sharp = sharpScale.indexOf(normalized);
  if (sharp >= 0) return sharp;
  return flatScale.indexOf(normalized);
}

const nashvilleMap: Record<number, string> = {
  0: "1",
  1: "b2",
  2: "2",
  3: "b3",
  4: "3",
  5: "4",
  6: "b5",
  7: "5",
  8: "b6",
  9: "6",
  10: "b7",
  11: "7",
};

export interface SongSection {
  label: string;
  lines: Array<{
    chords?: string;
    lyric: string;
  }>;
}

export function parseLyricsAndChords(text: string): SongSection[] {
  const sections: SongSection[] = [];
  const lines = text.split(/\r?\n/);
  
  let currentSection: SongSection | null = null;
  let pendingChords: string | undefined = undefined;

  const chordWordRegex = /^[A-G](?:#|b)?(?:[a-zA-Z0-9#\/\+\-]*)$/;
  function isChordsLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    const words = trimmed.split(/\s+/);
    return words.every(word => word === "/" || chordWordRegex.test(word));
  }

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for section header: e.g. [Verse 1]
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // If we had pending chords, flush them first
      if (currentSection && pendingChords) {
        currentSection.lines.push({ chords: pendingChords, lyric: "" });
        pendingChords = undefined;
      }
      
      const label = trimmed.slice(1, -1);
      currentSection = { label, lines: [] };
      sections.push(currentSection);
      continue;
    }

    // If we haven't encountered a section yet, create a default one
    if (!currentSection) {
      currentSection = { label: "Song", lines: [] };
      sections.push(currentSection);
    }

    if (isChordsLine(line)) {
      if (pendingChords) {
        // If we already have pending chords, flush them
        currentSection.lines.push({ chords: pendingChords, lyric: "" });
      }
      pendingChords = line; // Store as pending
    } else {
      if (trimmed === "") {
        // Empty line
        if (pendingChords) {
          currentSection.lines.push({ chords: pendingChords, lyric: "" });
          pendingChords = undefined;
        }
      } else {
        // Lyrics line
        currentSection.lines.push({
          chords: pendingChords,
          lyric: line,
        });
        pendingChords = undefined;
      }
    }
  }

  // Flush any final pending chords
  if (currentSection && pendingChords) {
    currentSection.lines.push({ chords: pendingChords, lyric: "" });
  }

  return sections;
}

export interface SongWithSections {
  sections: SongSection[];
}

export function formatSongToText(song: SongWithSections): string {
  return song.sections
    .map((section) => {
      const linesText = section.lines
        .map((line) => {
          if (line.chords) {
            return `${line.chords}\n${line.lyric}`;
          }
          return line.lyric;
        })
        .join("\n");
      return `[${section.label}]\n${linesText}`;
    })
    .join("\n\n");
}
