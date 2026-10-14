import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackWoolyTarget } from "./wooly-target";

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let time: number;
let cleanups: Array<() => void>;

function advanceFrame(elapsed = 16) {
  time += elapsed;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
}

function createTarget(name = "setlist-search") {
  const element = document.createElement("input");
  element.dataset.woolyTarget = name;
  document.body.append(element);
  let rectangle = new DOMRect(766, 130, 256, 40);
  let visible = true;
  vi.spyOn(element, "getClientRects").mockImplementation(() => Object.assign(visible ? [rectangle] : [], {
    item: (index: number) => visible && index === 0 ? rectangle : null,
  }));
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rectangle);
  const scroll = vi.fn();
  element.scrollIntoView = scroll;
  return { element, scroll, setRectangle: (next: DOMRect) => { rectangle = next; }, setVisible: (next: boolean) => { visible = next; } };
}

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  time = 0;
  cleanups = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
});

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function track(onChange: (rectangle: DOMRect | null) => void) {
  const cleanup = trackWoolyTarget("setlist-search", onChange);
  cleanups.push(cleanup);
  return cleanup;
}

describe("Wooly target geometry", () => {
  it("follows a field's animation and layout changes without scroll or resize events", () => {
    const target = createTarget();
    const changed = vi.fn();
    track(changed);
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(new DOMRect(766, 130, 256, 40));
    target.setRectangle(new DOMRect(766, 100, 256, 40));
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(new DOMRect(766, 100, 256, 40));
    target.setRectangle(new DOMRect(16, 200, 360, 48));
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(new DOMRect(16, 200, 360, 48));
    expect(target.scroll).toHaveBeenCalledOnce();
  });

  it("does not notify React repeatedly when the target stays still", () => {
    createTarget();
    const changed = vi.fn();
    track(changed);
    for (let index = 0; index < 10; index += 1) advanceFrame();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("refreshes positioning when viewport size changes even if the target stays still", () => {
    createTarget();
    const changed = vi.fn();
    track(changed);
    advanceFrame();
    vi.stubGlobal("innerWidth", window.innerWidth + 200);
    advanceFrame();
    expect(changed).toHaveBeenCalledTimes(2);
    advanceFrame();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("finds controls revealed later and chooses a visible mobile or desktop target", () => {
    const hidden = createTarget();
    hidden.setVisible(false);
    const changed = vi.fn();
    track(changed);
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(null);
    advanceFrame(4000);
    const visible = createTarget();
    advanceFrame(160);
    expect(changed).toHaveBeenLastCalledWith(new DOMRect(766, 130, 256, 40));
    expect(hidden.scroll).not.toHaveBeenCalled();
    expect(visible.scroll).toHaveBeenCalledOnce();
  });

  it("clears a removed control and tracks its replacement", () => {
    const original = createTarget();
    const changed = vi.fn();
    track(changed);
    advanceFrame();
    original.element.remove();
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(null);
    const replacement = createTarget();
    replacement.setRectangle(new DOMRect(20, 80, 300, 40));
    advanceFrame(160);
    expect(changed).toHaveBeenLastCalledWith(new DOMRect(20, 80, 300, 40));
    expect(replacement.scroll).toHaveBeenCalledOnce();
  });

  it("hides a zero-size target until it has usable bounds", () => {
    const target = createTarget();
    const changed = vi.fn();
    track(changed);
    advanceFrame();
    target.setRectangle(new DOMRect(766, 100, 0, 0));
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(null);
    target.setRectangle(new DOMRect(766, 100, 256, 40));
    advanceFrame();
    expect(changed).toHaveBeenLastCalledWith(new DOMRect(766, 100, 256, 40));
  });

  it("keeps reduced-motion and phone scroll behavior", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(max-width: 640px)" || query === "(prefers-reduced-motion: reduce)", media: query }));
    const target = createTarget();
    track(vi.fn());
    advanceFrame();
    expect(target.scroll).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("cancels all measurements when the tour closes or changes steps", () => {
    createTarget();
    const changed = vi.fn();
    const cleanup = track(changed);
    advanceFrame();
    cleanup();
    expect(frames.size).toBe(0);
    advanceFrame();
    expect(changed).toHaveBeenCalledOnce();
  });
});
