import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import manifest from "../../../public/brand/wooly/whole-frames-v3.json";
import { paintWoolyFrame, woolyFrameArtwork } from "./wooly-frames";

let atlas: Image;
beforeAll(async () => { atlas = await loadImage(`public${woolyFrameArtwork.source}`); });
type Mode = "speaking" | "listening" | "walking" | "standing-talking";

function render(pose: Mode, frame: number, size = 180) {
  const canvas = createCanvas(size, size);
  paintWoolyFrame(canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    atlas as unknown as CanvasImageSource, pose, frame * 1000 / 30, size);
  return canvas.getContext("2d").getImageData(0, 0, size, size).data;
}

function connectedPixels(pixels: Uint8ClampedArray, width: number) {
  const seen = new Set<number>();
  const start = Math.floor(width * 0.65) * width + Math.floor(width * 0.5);
  const queue = [start]; seen.add(start);
  for (let read = 0; read < queue.length; read++) {
    const index = queue[read], x = index % width;
    for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, index - width, index + width]) {
      if (neighbor < 0 || neighbor >= pixels.length / 4 || seen.has(neighbor) || pixels[neighbor * 4 + 3] < 128) continue;
      seen.add(neighbor); queue.push(neighbor);
    }
  }
  return seen;
}

describe("complete four-leg Wooly frames", () => {
  it("preserves every existing animation tile when adding standing speech", async () => {
    const previous = await loadImage("public/brand/wooly/whole-frames-v2.webp");
    const oldCanvas = createCanvas(256, 256), currentCanvas = createCanvas(256, 256);
    for (let index = 0; index < 124; index++) {
      const x = index % 12 * 256, y = Math.floor(index / 12) * 256;
      const oldContext = oldCanvas.getContext("2d"), currentContext = currentCanvas.getContext("2d");
      oldContext.clearRect(0, 0, 256, 256); currentContext.clearRect(0, 0, 256, 256);
      oldContext.drawImage(previous, x, y, 256, 256, 0, 0, 256, 256);
      currentContext.drawImage(atlas, x, y, 256, 256, 0, 0, 256, 256);
      expect(Buffer.compare(Buffer.from(oldContext.getImageData(0, 0, 256, 256).data),
        Buffer.from(currentContext.getImageData(0, 0, 256, 256).data)), `existing tile ${index}`).toBe(0);
    }
  });

  it("moves the speaking mouth while all four planted hooves stay in place", () => {
    const regions = [[0.16, 0.34], [0.34, 0.48], [0.48, 0.65], [0.65, 0.83]];
    const centers = (pixels: Uint8ClampedArray) => regions.map(([left, right]) => {
      let count = 0, sumX = 0, sumY = 0;
      for (let y = 133; y < 173; y++) for (let x = Math.ceil(left * 180); x < right * 180; x++) {
        const offset = (y * 180 + x) * 4;
        if (pixels[offset + 3] > 180 && pixels[offset + 1] < 140 && pixels[offset + 2] > pixels[offset] + 15) {
          count++; sumX += x; sumY += y;
        }
      }
      expect(count).toBeGreaterThan(20);
      return [sumX / count, sumY / count];
    });
    const first = render("standing-talking", 0), planted = centers(first);
    for (let frame = 1; frame < 60; frame++) {
      const current = centers(render("standing-talking", frame));
      current.forEach(([x, y], index) => {
        expect(Math.hypot(x - planted[index][0], y - planted[index][1]), `hoof ${index}, frame ${frame}`).toBeLessThan(0.75);
      });
    }
    const open = render("standing-talking", 30);
    let mouthDifference = 0, samples = 0;
    for (let y = 82; y < 92; y++) for (let x = 94; x < 118; x++) {
      const offset = (y * 180 + x) * 4;
      for (let channel = 0; channel < 3; channel++) { mouthDifference += Math.abs(first[offset + channel] - open[offset + channel]); samples++; }
    }
    expect(mouthDifference / samples).toBeGreaterThan(5);
  });

  it("pins the accepted four-leg master and the generated atlas", () => {
    expect([atlas.width, atlas.height]).toEqual([manifest.width, manifest.height]);
    const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(hash("public/brand/wooly/four-leg-reference-v1.png")).toBe("5028375a60e7bb7534342bcac69813bf68953aeb04b88453e48ebd80969b3399");
    expect(manifest.sourceHashes["neutral.png"]).toBe(hash("public/brand/wooly/four-leg-reference-v1.png"));
    expect(hash(`public${woolyFrameArtwork.source}`)).toBe(manifest.atlasSha256);
    expect(manifest.frameCount).toBe(155);
  });

  it.each(["speaking", "listening", "walking", "standing-talking"] as const)("retains four attached hooves and clear borders in every %s frame", (pose) => {
    const count = manifest.clips.find((clip) => clip.mode === pose)!.frames.length;
    for (const size of [180, 72]) for (let frame = 0; frame < count; frame++) {
      const pixels = render(pose, frame, size);
      const body = connectedPixels(pixels, size);
      expect(body.size, `${pose} body at ${frame}/${size}`).toBeGreaterThan(size * size * 0.35);
      let border = 0;
      for (let pixel = 0; pixel < size; pixel++) border += pixels[pixel * 4 + 3]
        + pixels[((size - 1) * size + pixel) * 4 + 3] + pixels[pixel * size * 4 + 3]
        + pixels[(pixel * size + size - 1) * 4 + 3];
      expect(border, `${pose} border at ${frame}/${size}`).toBe(0);
      // Four non-overlapping anatomical regions. A raised foreleg replaces the
      // right floor hoof while waving. Each purple hoof must connect to the body.
      const regions = [[0.16, 0.34, 0.75, 0.96], [0.34, 0.48, 0.74, 0.91], [0.48, 0.65, 0.77, 0.96],
        pose === "speaking" ? [0.69, 0.86, 0.53, 0.69] : [0.65, 0.83, 0.74, 0.96]];
      for (const [left, right, top, bottom] of regions) {
        let attachedPurple = 0;
        for (let y = Math.ceil(top * size); y < bottom * size; y++) for (let x = Math.ceil(left * size); x < right * size; x++) {
          const index = y * size + x, offset = index * 4;
          if (pixels[offset + 3] > 180 && pixels[offset + 1] < 140 && pixels[offset + 2] > pixels[offset] + 15 && body.has(index)) attachedPurple++;
        }
        expect(attachedPurple, `${pose} hoof ${left} at ${frame}/${size}`).toBeGreaterThan(size === 72 ? 3 : 20);
      }
    }
  }, 30000);

  it.each(["speaking", "listening", "walking", "standing-talking"] as const)("has no blank, flashing, or abrupt loop frame in %s", (pose) => {
    const count = manifest.clips.find((clip) => clip.mode === pose)!.frames.length;
    let previous = render(pose, count - 1);
    for (let frame = 0; frame < count; frame++) {
      const current = render(pose, frame);
      let difference = 0;
      for (let pixel = 0; pixel < current.length; pixel += 4) {
        // Compare premultiplied color to ignore RGB in fully transparent pixels.
        for (let channel = 0; channel < 3; channel++) difference += Math.abs(
          current[pixel + channel] * current[pixel + 3] / 255 - previous[pixel + channel] * previous[pixel + 3] / 255);
        difference += Math.abs(current[pixel + 3] - previous[pixel + 3]);
      }
      expect(difference / current.length, `${pose} transition into ${frame}`).toBeLessThan(2);
      previous = current;
    }
  });
});
