import manifest from "../../../public/brand/wooly/whole-frames-v3.json";
import type { WoolyMotionPose } from "./wooly-motion-assets";

export const woolyFrameArtwork = {
  source: "/brand/wooly/whole-frames-v3.webp",
  width: manifest.width,
  height: manifest.height,
  revision: manifest.atlasSha256.slice(0, 12),
} as const;

export const WOOLY_FRAME_FPS = manifest.fps;
export const WOOLY_FRAME_SIZE = manifest.frameSize;
export const WOOLY_FRAME_COLUMNS = manifest.columns;

/** Explicit timelines include the gentle listening pauses and both walking steps. */
export function getWoolyFrameIndex(elapsed: number, pose: WoolyMotionPose) {
  const mode = pose === "walking" || pose === "listening" || pose === "standing-talking" ? pose : "speaking";
  const clip = manifest.clips.find((candidate) => candidate.mode === mode)!;
  const tick = Math.floor(Math.max(0, elapsed) * WOOLY_FRAME_FPS / 1000 + 0.00001) % clip.frames.length;
  return clip.frames[tick];
}

/** One complete, pre-rendered image per draw; no runtime part assembly or morphing. */
export function paintWoolyFrame(context: CanvasRenderingContext2D, image: CanvasImageSource, pose: WoolyMotionPose, elapsed: number, size: number) {
  const index = getWoolyFrameIndex(elapsed, pose);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  // Keep the baked facial detail crisp at native size while smoothing scaling.
  context.imageSmoothingQuality = "medium";
  context.drawImage(image,
    index % WOOLY_FRAME_COLUMNS * WOOLY_FRAME_SIZE,
    Math.floor(index / WOOLY_FRAME_COLUMNS) * WOOLY_FRAME_SIZE,
    WOOLY_FRAME_SIZE, WOOLY_FRAME_SIZE, 0, 0, size, size);
}
