import { WOOLY_FRAME_FPS } from "./wooly-frames";

export const WOOLY_FPS = WOOLY_FRAME_FPS;

/** Time-based sampling preserves the same gentle pace at different refresh rates. */
export function createWoolyClock() {
  let elapsed = 0;
  let previousTimestamp: number | null = null;
  let previousFrame = -1;
  return {
    tick(timestamp: number): number | null {
      if (previousTimestamp !== null) elapsed += Math.max(0, timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      const frame = Math.floor(elapsed * WOOLY_FPS / 1000 + 0.00001);
      if (frame === previousFrame) return null;
      previousFrame = frame;
      return elapsed;
    },
    suspend() { previousTimestamp = null; },
    get elapsed() { return elapsed; },
  };
}
