import { describe, expect, it, beforeEach } from "vitest";
import {
  getGuitarChordDiagram,
  evaluateVocalRange,
  getSongConfidence,
  setSongConfidence,
  getSongChecklist,
  saveSongChecklist,
  getPracticeHistory,
  savePracticeSession,
} from "./practice-features";

describe("Practice Features Domain Logic", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Guitar Chord Diagrams", () => {
    it("retrieves standard chord diagrams", () => {
      const c = getGuitarChordDiagram("C");
      expect(c).not.toBeNull();
      expect(c?.frets).toEqual([-1, 3, 2, 0, 1, 0]);

      const g = getGuitarChordDiagram("G");
      expect(g).not.toBeNull();
      expect(g?.frets).toEqual([3, 2, 0, 0, 0, 3]);

      const fsharpMinor = getGuitarChordDiagram("F#m");
      expect(fsharpMinor).not.toBeNull();
      expect(fsharpMinor?.baseFret).toBe(2);
    });

    it("handles root normalizations and fallbacks", () => {
      const cadd9 = getGuitarChordDiagram("Cadd9");
      expect(cadd9).not.toBeNull();

      const unknown = getGuitarChordDiagram("XYZ99");
      expect(unknown).toBeNull();
    });
  });

  describe("Song Confidence Rating", () => {
    it("saves and retrieves confidence ratings in localStorage", () => {
      expect(getSongConfidence("setlist-1", "slot-1")).toBeNull();

      setSongConfidence("setlist-1", "slot-1", "READY");
      expect(getSongConfidence("setlist-1", "slot-1")).toBe("READY");

      setSongConfidence("setlist-1", "slot-1", "NOT_READY");
      expect(getSongConfidence("setlist-1", "slot-1")).toBe("NOT_READY");

      setSongConfidence("setlist-1", "slot-1", null);
      expect(getSongConfidence("setlist-1", "slot-1")).toBeNull();
    });
  });

  describe("Practice Checklist", () => {
    it("returns default checklist items when empty", () => {
      const items = getSongChecklist("setlist-1", "slot-1");
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].completed).toBe(false);
    });

    it("saves and retrieves custom checklist items", () => {
      const customItems = [
        { id: "1", text: "Practice guitar solo", completed: true },
        { id: "2", text: "Check vocal harmony", completed: false },
      ];
      saveSongChecklist("setlist-1", "slot-1", customItems);

      const loaded = getSongChecklist("setlist-1", "slot-1");
      expect(loaded).toHaveLength(2);
      expect(loaded[0].text).toBe("Practice guitar solo");
      expect(loaded[0].completed).toBe(true);
    });
  });

  describe("Practice History & Session Logging", () => {
    it("saves session logs to history", () => {
      expect(getPracticeHistory("setlist-1")).toHaveLength(0);

      savePracticeSession({
        setlistId: "setlist-1",
        date: "2026-08-15T00:00:00.000Z",
        totalSeconds: 300,
        songSeconds: { "slot-1": 180, "slot-2": 120 },
      });

      const history = getPracticeHistory("setlist-1");
      expect(history).toHaveLength(1);
      expect(history[0].totalSeconds).toBe(300);
      expect(history[0].songSeconds["slot-1"]).toBe(180);
    });
  });

  describe("Vocal Range Evaluator", () => {
    it("evaluates assigned keys", () => {
      const high = evaluateVocalRange("A", "Lead Singer");
      expect(high.status).toBe("HIGH");

      const comfortable = evaluateVocalRange("C", "Lead Singer");
      expect(comfortable.status).toBe("COMFORTABLE");

      const low = evaluateVocalRange("D", "Lead Singer");
      expect(low.status).toBe("LOW");
    });
  });
});
