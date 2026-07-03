import { describe, expect, it } from "vitest";
import {
  fileKindLabel,
  formatFileSize,
  inferPracticeFileMimeType,
  profileAvatarStoragePath,
  storagePath,
  validatePracticeFile,
  validateProfileAvatar,
} from "@/lib/domain/files";

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

  it("formats file metadata for message attachments", () => {
    expect(formatFileSize(240 * 1024)).toBe("240 KB");
    expect(formatFileSize(1258291)).toBe("1.2 MB");
    expect(fileKindLabel("image/png", "stage.png")).toBe("Image");
    expect(fileKindLabel("application/pdf", "setlist.pdf")).toBe("PDF");
    expect(inferPracticeFileMimeType({ name: "chart.pdf", type: "" })).toBe("application/pdf");
  });

  it("validates profile avatar uploads", () => {
    expect(validateProfileAvatar({ name: "me.webp", size: 1024, type: "image/webp" })).toEqual({
      valid: true,
      reason: null,
    });
    expect(validateProfileAvatar({ name: "huge.png", size: 6 * 1024 * 1024, type: "image/png" }).valid).toBe(false);
    expect(validateProfileAvatar({ name: "avatar.svg", size: 1024, type: "image/svg+xml" }).valid).toBe(false);
    expect(profileAvatarStoragePath("user-1", "photo-1", { name: "My Photo.jpeg", type: "image/jpeg" })).toBe("user-1/photo-1.jpg");
  });
});
