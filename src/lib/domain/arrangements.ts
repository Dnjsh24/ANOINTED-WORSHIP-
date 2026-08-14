import {
  parseLyricsAndChords,
  type SongSection,
} from "@/lib/domain/chords";

const MAX_ARRANGEMENT_SECTIONS = 100;
const MAX_SECTION_LABEL_LENGTH = 80;
const MAX_SECTION_CONTENT_LENGTH = 20_000;
const MAX_SECTION_ID_LENGTH = 160;

export interface ArrangementSection {
  id: string;
  label: string;
  content: string;
}

let arrangementSectionId = 0;

export function createArrangementSectionId(label: string) {
  arrangementSectionId += 1;
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";

  return `${slug}-${Date.now()}-${arrangementSectionId}`;
}

function labelsMatch(songLabel: string, arrangementLabel: string) {
  const song = songLabel.trim().toLowerCase();
  const arrangement = arrangementLabel.trim().toLowerCase();
  return song === arrangement
    || song.startsWith(arrangement)
    || arrangement.startsWith(song);
}

function sectionContent(section: SongSection) {
  return section.lines
    .map((line) => {
      if (line.tokens?.length) {
        return line.tokens
          .map((token) => `${token.chord ? `[${token.chord}]` : ""}${token.lyric}`)
          .join("");
      }
      if (line.chords) {
        return line.lyric ? `${line.chords}\n${line.lyric}` : line.chords;
      }
      return line.lyric;
    })
    .join("\n")
    .trim();
}

export function createArrangementSections(initialArrangement: string, lyrics = "") {
  const songSections = lyrics ? parseLyricsAndChords(lyrics) : [];
  const labels = initialArrangement
    ? initialArrangement.split(",").map((section) => section.trim()).filter(Boolean)
    : songSections.map((section) => section.label);

  return labels.map((label) => {
    const match = songSections.find((section) => labelsMatch(section.label, label));
    return {
      id: createArrangementSectionId(label),
      label,
      content: match ? sectionContent(match) : "",
    };
  });
}

function isArrangementSection(value: unknown): value is ArrangementSection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  return typeof section.id === "string"
    && section.id.length > 0
    && section.id.length <= MAX_SECTION_ID_LENGTH
    && typeof section.label === "string"
    && section.label.trim().length > 0
    && section.label.trim().length <= MAX_SECTION_LABEL_LENGTH
    && typeof section.content === "string"
    && section.content.length <= MAX_SECTION_CONTENT_LENGTH;
}

export function parseArrangementSections(value: unknown): ArrangementSection[] | null {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  if (!Array.isArray(candidate) || candidate.length > MAX_ARRANGEMENT_SECTIONS) {
    return null;
  }
  if (!candidate.every(isArrangementSection)) return null;

  return candidate.map((section) => ({
    id: section.id,
    label: section.label.trim(),
    content: section.content.replace(/\r\n/g, "\n"),
  }));
}

export function serializeArrangementSections(sections: ArrangementSection[]) {
  return JSON.stringify(sections);
}

export function formatArrangementSequence(sections: ArrangementSection[]) {
  return sections.map((section) => section.label.trim()).filter(Boolean).join(", ");
}

export function resolveArrangementSongSections(
  lyrics: string,
  arrangementSections?: ArrangementSection[] | null,
): SongSection[] {
  const safeLyrics = typeof lyrics === "string" ? lyrics : "";
  if (!arrangementSections) return parseLyricsAndChords(safeLyrics);

  return arrangementSections.map((section) => {
    if (!section.content || typeof section.content !== "string" || !section.content.trim()) {
      return { label: section.label, lines: [] };
    }
    const parsed = parseLyricsAndChords(`[${section.label}]\n${section.content}`);
    return parsed[0] ?? { label: section.label, lines: [] };
  });
}
