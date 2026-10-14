import { createWoolyClock } from "./wooly-motion";
import type { WoolyMotionPose } from "./wooly-motion-assets";
import { paintWoolyFrame } from "./wooly-frames";

export type WoolyRenderer = {
  setPaused: (paused: boolean) => void;
  setPose: (pose: WoolyMotionPose) => void;
  dispose: () => void;
};

export function createWoolyRenderer(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  onUnavailable: () => void,
): WoolyRenderer {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Wooly graphics unavailable");
  const clock = createWoolyClock();
  let paused = true;
  let disposed = false;
  let unavailable = false;
  let pose: WoolyMotionPose = "speaking";
  let poseStartedAt = 0;
  let animationId: number | null = null;

  const synchronizePlayback = () => {
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    clock.suspend();
    if (!paused && !document.hidden && !disposed && !unavailable) animationId = requestAnimationFrame(tick);
  };
  const fail = () => {
    if (disposed || unavailable) return;
    unavailable = true;
    synchronizePlayback();
    onUnavailable();
  };
  const draw = (elapsed: number) => {
    if (disposed || unavailable) return;
    try {
      paintWoolyFrame(context, image, pose, elapsed - poseStartedAt, canvas.width);
    } catch { fail(); }
  };
  const tick = (timestamp: number) => {
    animationId = null;
    if (disposed || unavailable || paused || document.hidden) return;
    const elapsed = clock.tick(timestamp);
    if (elapsed !== null) draw(elapsed);
    if (!unavailable) animationId = requestAnimationFrame(tick);
  };
  const resize = () => {
    if (disposed || unavailable) return;
    const size = Math.min(512, Math.max(1, Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 3))));
    if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
    draw(clock.elapsed);
  };
  const handleContextLost = (event: Event) => { event.preventDefault(); fail(); };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", synchronizePlayback);
  canvas.addEventListener("contextlost", handleContextLost);
  resize();

  return {
    setPaused(nextPaused) {
      if (paused !== nextPaused) { paused = nextPaused; synchronizePlayback(); }
    },
    setPose(nextPose) {
      if (pose !== nextPose) {
        pose = nextPose;
        poseStartedAt = clock.elapsed;
        draw(clock.elapsed);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      synchronizePlayback();
      observer.disconnect();
      document.removeEventListener("visibilitychange", synchronizePlayback);
      canvas.removeEventListener("contextlost", handleContextLost);
    },
  };
}
