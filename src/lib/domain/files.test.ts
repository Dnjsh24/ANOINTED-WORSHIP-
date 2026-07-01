import { describe, expect, it } from "vitest";
import { storagePath, validatePracticeFile } from "@/lib/domain/files";

describe("practice files", () => {
  it("accepts supported practice materials", () => {
    expect(validatePracticeFile({ name: "demo-chart.pdf", size: 1024, type: "application/pdf" })).toEqual({
      valid: true,
      reason: null,
    });
  });

  it("rejects unsupported extensions", () => {
    expect(validatePracticeFile({ name: "secret.exe", size: 1024, type: "application/octet-stream" }).valid).toBe(false);
  });

  it("rejects files that are too large or have unsupported mime types", () => {
    expect(validatePracticeFile({ name: "large.pdf", size: 16 * 1024 * 1024, type: "application/pdf" })).toMatchObject({
      valid: false,
    });
    expect(validatePracticeFile({ name: "chart.pdf", size: 1024, type: "text/html" })).toMatchObject({
      valid: false,
    });
  });

  it("builds safe storage paths", () => {
    expect(storagePath("team-1", "songs", "song-1", "Demo Chart!!.pdf")).toBe("team-1/songs/song-1/Demo-Chart--.pdf");
  });
});
