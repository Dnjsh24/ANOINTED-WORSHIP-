export type RehearsalSong = {
  id: string;
  title: string;
  assignedKey: string;
  bpm: number | null;
  lead?: string | null;
  arrangement?: string | null;
};

export type RehearsalAllocation = { minutes: number; focus: string };

export const preparationGroups = [
  { name: "Band", tasks: ["Tune instruments and check cables", "Check monitors and click levels", "Agree intros, endings and transitions"] },
  { name: "Vocals", tasks: ["Warm up and check comfortable keys", "Confirm lead vocals and harmonies", "Agree cues and microphone handoffs"] },
  { name: "Service & production", tasks: ["Confirm roles, call time and attendance", "Verify lyrics and slide order", "Check microphones and backing tracks", "Confirm prayer, media and dance cues"] },
] as const;

export function rehearsalMinutes(value: string): number {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? Math.max(0, Math.min(120, Math.round(minutes))) : 0;
}

export function buildRehearsalPlan(name: string, songs: RehearsalSong[], allocations: Record<string, RehearsalAllocation>, checked: Set<string>): string {
  const total = songs.reduce((sum, song) => sum + (allocations[song.id]?.minutes ?? 5), 0);
  const lines = [name, "Rehearsal & service preparation", `Planned rehearsal: ${total} minutes (allocations, not song durations)`, ""];
  songs.forEach((song, index) => {
    const allocation = allocations[song.id] ?? { minutes: 5, focus: "" };
    lines.push(`${index + 1}. ${song.title} | Key ${song.assignedKey} | ${song.bpm === null ? "BPM not recorded" : `${song.bpm} BPM`} | ${allocation.minutes} rehearsal min`);
    if (song.lead) lines.push(`Lead: ${song.lead}`);
    if (song.arrangement) lines.push(`Arrangement: ${song.arrangement}`);
    lines.push(`Focus: ${allocation.focus.trim() || "Discuss with the team"}`, "");
  });
  preparationGroups.forEach(group => {
    lines.push(group.name);
    group.tasks.forEach(task => lines.push(`${checked.has(task) ? "[x]" : "[ ]"} ${task}`));
    lines.push("");
  });
  lines.push("This download is a preparation snapshot. Checklist progress is local to this open session.");
  return lines.join("\n");
}
