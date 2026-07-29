export type StageLayoutPresetId = "full" | "lyrics-chords" | "lyrics-focus";
export type StageLayout = { showCurrent: boolean; showNext: boolean; showChords: boolean; showNotes: boolean; showClock: boolean; showCountdown: boolean };

const layouts: Record<StageLayoutPresetId, StageLayout> = {
  full: { showCurrent: true, showNext: true, showChords: false, showNotes: true, showClock: true, showCountdown: true },
  "lyrics-chords": { showCurrent: true, showNext: true, showChords: true, showNotes: true, showClock: true, showCountdown: true },
  "lyrics-focus": { showCurrent: true, showNext: false, showChords: false, showNotes: false, showClock: true, showCountdown: false },
};

export function stageLayoutPreset(id: string | undefined): StageLayout {
  const layout = layouts[id as StageLayoutPresetId] ?? layouts.full;
  return { ...layout };
}

export function stageLayoutPresetId(layout: StageLayout): StageLayoutPresetId {
  return (Object.entries(layouts).find(([, candidate]) => Object.keys(candidate).every((key) => candidate[key as keyof StageLayout] === layout[key as keyof StageLayout]))?.[0] as StageLayoutPresetId | undefined) ?? "full";
}
