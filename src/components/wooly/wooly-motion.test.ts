import { describe, expect, it } from "vitest";
import { createWoolyClock } from "./wooly-motion";
import { getWoolyFrameIndex } from "./wooly-frames";
import manifest from "../../../public/brand/wooly/whole-frames-v3.json";

describe("Wooly complete-frame timing", () => {
  it.each([30, 60, 90, 120, 144])("draws 30 updates per second on a %i Hz display", (refreshRate) => {
    const clock = createWoolyClock();
    const drawn = [];
    for (let tick = 0; tick < refreshRate; tick++) {
      const elapsed = clock.tick(tick * 1000 / refreshRate);
      if (elapsed !== null) drawn.push(elapsed);
    }
    expect(drawn).toHaveLength(30);
  });

  it("does not jump ahead after pause or a hidden tab", () => {
    const clock = createWoolyClock();
    clock.tick(0); clock.tick(100); clock.suspend();
    expect(clock.tick(60000)).toBeNull();
    expect(clock.elapsed).toBe(100);
    expect(clock.tick(60040)).toBe(140);
  });

  it.each([
    ["speaking", 2000, 0, 30], ["listening", 4000, 31, 61], ["walking", 4000, 62, 123],
    ["standing-talking", 2000, 124, 154],
  ] as const)("plays the complete %s cycle with the intended pauses and both walking steps", (pose, duration, first, last) => {
    const indices = Array.from({ length: duration * 2 * 30 / 1000 + 1 }, (_, frame) => getWoolyFrameIndex(frame * 1000 / 30, pose));
    expect(indices[0]).toBe(first);
    expect(Math.max(...indices)).toBe(last);
    expect(Math.min(...indices)).toBe(first);
    expect(indices.at(-1)).toBe(first);
    const clip = manifest.clips.find((candidate) => candidate.mode === pose)!;
    expect(indices.slice(0, clip.frames.length)).toEqual(clip.frames);
    expect(indices.every((index) => index >= 0 && index < manifest.frameCount)).toBe(true);
  });

  it("uses the talking animation for each tutorial speaking pose", () => {
    for (const pose of ["greeting", "explaining", "pointing"] as const) {
      expect(getWoolyFrameIndex(1300, pose)).toBe(getWoolyFrameIndex(1300, "speaking"));
    }
    expect(getWoolyFrameIndex(-1, "speaking")).toBe(0);
  });
});
