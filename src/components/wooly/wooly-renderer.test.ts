import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWoolyRenderer } from "./wooly-renderer";
import { paintWoolyFrame } from "./wooly-frames";

vi.mock("./wooly-frames", async (importOriginal) => ({
  ...await importOriginal<typeof import("./wooly-frames")>(), paintWoolyFrame: vi.fn(),
}));

describe("Wooly renderer lifecycle", () => {
  let canvas: HTMLCanvasElement;
  let image: HTMLImageElement;
  let hidden = false;
  let nextFrameId = 0;
  let resize: () => void;
  let disconnect: ReturnType<typeof vi.fn>;
  const callbacks = new Map<number, FrameRequestCallback>();
  const paint = vi.mocked(paintWoolyFrame);
  const step = (timestamp: number) => {
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach((callback) => callback(timestamp));
  };

  beforeEach(() => {
    hidden = false; nextFrameId = 0; callbacks.clear(); paint.mockReset(); disconnect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++nextFrameId, callback); return nextFrameId; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
    canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ width: 72 } as DOMRect);
    image = document.createElement("img");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("renders 30 complete frames per second and retains the frame while paused or hidden", () => {
    const renderer = createWoolyRenderer(canvas, image, vi.fn());
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: true });
    expect(callbacks.size).toBe(0); paint.mockClear();
    renderer.setPaused(false);
    for (let frame = 0; frame < 30; frame++) step(frame * 1000 / 30);
    expect(paint).toHaveBeenCalledTimes(30);
    renderer.setPaused(true); step(5000); expect(paint).toHaveBeenCalledTimes(30);
    renderer.setPaused(false); step(6000); expect(paint).toHaveBeenCalledTimes(30);
    hidden = true; document.dispatchEvent(new Event("visibilitychange")); expect(callbacks.size).toBe(0);
    hidden = false; document.dispatchEvent(new Event("visibilitychange")); step(60000);
    expect(paint).toHaveBeenCalledTimes(30);
    step(60050); expect(paint).toHaveBeenCalledTimes(31);
    renderer.dispose(); renderer.dispose(); expect(disconnect).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
    document.dispatchEvent(new Event("visibilitychange")); resize(); expect(callbacks.size).toBe(0);
    expect(paint).toHaveBeenCalledTimes(31);
  });

  it("switches every pose on the same canvas while preserving pause and selecting a complete frame", () => {
    const renderer = createWoolyRenderer(canvas, image, vi.fn());
    for (const pose of ["listening", "walking", "greeting", "pointing", "explaining", "speaking"] as const) {
      renderer.setPose(pose);
      expect(paint.mock.lastCall?.[2]).toBe(pose);
      expect(paint.mock.lastCall?.[3]).toBe(0);
      expect(callbacks.size).toBe(0);
    }
    expect(canvas.getContext).toHaveBeenCalledOnce();
    renderer.setPose("speaking"); renderer.setPaused(true);
    expect(paint).toHaveBeenCalledTimes(7);
    renderer.dispose();
  });

  it("bounds the backing canvas and redraws a paused frame on resize", () => {
    const renderer = createWoolyRenderer(canvas, image, vi.fn());
    vi.mocked(canvas.getBoundingClientRect).mockReturnValue({ width: 1200 } as DOMRect);
    resize(); expect(canvas.width).toBe(512); expect(canvas.height).toBe(512);
    expect(paint.mock.lastCall?.[4]).toBe(512); expect(callbacks.size).toBe(0);
    renderer.dispose();
  });

  it("falls back once and stops frames after context loss", () => {
    const fallback = vi.fn();
    const renderer = createWoolyRenderer(canvas, image, fallback);
    renderer.setPaused(false);
    canvas.dispatchEvent(new Event("contextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("contextlost", { cancelable: true }));
    expect(fallback).toHaveBeenCalledOnce(); expect(callbacks.size).toBe(0);
    renderer.setPose("walking"); renderer.setPaused(false); resize();
    expect(callbacks.size).toBe(0); renderer.dispose();
  });

  it("stops without rescheduling when painting a frame fails", () => {
    const fallback = vi.fn();
    const renderer = createWoolyRenderer(canvas, image, fallback);
    paint.mockImplementation(() => { throw new Error("paint failed"); });
    renderer.setPaused(false); step(0);
    expect(fallback).toHaveBeenCalledOnce(); expect(callbacks.size).toBe(0); renderer.dispose();
  });

  it("reports unavailable canvas before allocating work", () => {
    vi.mocked(canvas.getContext).mockReturnValue(null);
    expect(() => createWoolyRenderer(canvas, image, vi.fn())).toThrow("graphics unavailable");
    expect(callbacks.size).toBe(0);
  });
});
