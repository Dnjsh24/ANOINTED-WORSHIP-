import { describe, expect, it } from "vitest";
import {
  buildCopiedAnnotation,
  buildMasterSongDefaultAnnotation,
  getAnnotationStorageKey,
  type SongAnnotation,
} from "./annotations";

describe("annotations domain logic", () => {
  describe("getAnnotationStorageKey", () => {
    it("generates setlist user personal storage key", () => {
      const key = getAnnotationStorageKey("song-1", "setlist-1", "slot-1", "user-123", false);
      expect(key).toBe("annotation_user_user-123_setlist-1_slot-1");
    });

    it("generates setlist shared team storage key when isShared is true", () => {
      const key = getAnnotationStorageKey("song-1", "setlist-1", "slot-1", "user-123", true);
      expect(key).toBe("annotation_shared_setlist-1_slot-1");
    });

    it("generates master song storage key when setlist is missing", () => {
      const key = getAnnotationStorageKey("song-1", null, null, "user-123", false);
      expect(key).toBe("annotation_master_user-123_song-1");
    });
  });

  describe("buildCopiedAnnotation", () => {
    it("creates a copied annotation payload targeting a new setlist song", () => {
      const source: SongAnnotation = {
        id: "orig-123",
        songId: "song-1",
        setlistId: "setlist-1",
        setlistSongId: "slot-1",
        userId: "user-1",
        textNotes: "Coda at measure 32",
        drawingDataUrl: "data:image/png;base64,sample",
        isShared: false,
      };

      const copied = buildCopiedAnnotation(source, "setlist-2", "slot-2", "user-1");

      expect(copied.id).toBeUndefined();
      expect(copied.setlistId).toBe("setlist-2");
      expect(copied.setlistSongId).toBe("slot-2");
      expect(copied.textNotes).toBe("Coda at measure 32");
      expect(copied.drawingDataUrl).toBe("data:image/png;base64,sample");
    });
  });

  describe("buildMasterSongDefaultAnnotation", () => {
    it("creates a master song default annotation payload with null setlist scope", () => {
      const source: SongAnnotation = {
        songId: "song-1",
        setlistId: "setlist-1",
        setlistSongId: "slot-1",
        userId: "user-1",
        textNotes: "Intro 4 bars guitar solo",
        drawingDataUrl: "data:image/png;base64,sample",
        isShared: false,
      };

      const master = buildMasterSongDefaultAnnotation(source, "user-1");

      expect(master.setlistId).toBeNull();
      expect(master.setlistSongId).toBeNull();
      expect(master.textNotes).toBe("Intro 4 bars guitar solo");
    });
  });
});
