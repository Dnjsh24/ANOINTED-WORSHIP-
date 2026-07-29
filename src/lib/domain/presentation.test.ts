import { describe, expect, it } from "vitest";
import { defaultPresentationSettings, entranceMotionClass, generateSongSlides, resolveSceneLayerMotion, type SceneLayer } from "@/lib/domain/presentation";

describe("generateSongSlides", () => {
  it("creates reflow slides from original lyrics and chord text", () => {
    const slides = generateSongSlides("[Verse]\nC\nLet us shout\nG\nFor Your glory", 2);

    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({
      content: ["Let us shout", "For Your glory"],
      sectionLabel: "Verse",
    });
  });

  it("returns no slides only when there is no usable lyric text", () => {
    expect(generateSongSlides("C\nG\n", 4)).toEqual([]);
  });

  it("resolves copied local scene-layer motion without modifying global settings", () => {
    const layer: SceneLayer = { id: "local", kind: "text", name: "Local", x: 0, y: 0, width: 40, height: 10, rotation: 0, motion: { entranceAnimation: "Slide In Left", entranceDuration: 1.4 } };
    const motion = resolveSceneLayerMotion(layer, defaultPresentationSettings);
    expect(motion.entranceAnimation).toBe("Slide In Left");
    expect(motion.entranceDuration).toBe(1.4);
    expect(motion.exitAnimation).toBe(defaultPresentationSettings.exitAnimation);
    expect(entranceMotionClass(motion.entranceAnimation)).toBe("animate-slide-in-left");
  });
});
