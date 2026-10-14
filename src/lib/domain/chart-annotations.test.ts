import { describe, expect, it } from "vitest";
import { chartAnnotationKeys, parseChartNotes } from "./chart-annotations";

describe("chart annotation storage", () => {
  it("isolates repeated songs by setlist slot while retaining the legacy drawing lookup", () => {
    const first = chartAnnotationKeys("set", "slot-1", "song");
    const second = chartAnnotationKeys("set", "slot-2", "song");
    expect(first.notes).not.toBe(second.notes);
    expect(first.drawing).not.toBe(second.drawing);
    expect(first.legacyDrawing).toBe("scribbles_set_song");
  });
  it("rejects corrupt or unsafe stored notes", () => {
    for (const raw of [null, "bad json", "{}", '[{"text":"incomplete"}]']) expect(parseChartNotes(raw)).toEqual([]);
  });
});
