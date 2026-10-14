import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WoolyTargetPointer } from "./wooly-target-pointer";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Wooly pointer layout", () => {
  it("tracks panel resize and removes its observer, listener and pending timer on unmount", () => {
    vi.useFakeTimers();
    let resized: (() => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resized = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    let panel = new DOMRect(200, 20, 100, 100);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => panel);
    const removeListener = vi.spyOn(window, "removeEventListener");
    const ref = createRef<HTMLDivElement>();
    const view = render(<><div ref={ref} /><WoolyTargetPointer target={new DOMRect(20, 40, 100, 40)} panelRef={ref} /></>);
    expect(view.container.querySelector("svg")).toBeNull();
    act(() => vi.runOnlyPendingTimers());
    const arrow = () => view.container.querySelector("svg > path");
    expect(arrow()).toHaveAttribute("d", "M200,70 L120,70");
    expect(view.container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(observe).toHaveBeenCalledWith(ref.current);
    panel = new DOMRect(0, 160, 320, 200);
    act(() => resized?.());
    expect(arrow()).toHaveAttribute("d", "M120,160 L120,80");
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("works without ResizeObserver and hides the arrow if the panel overlaps the target", () => {
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 100, 100));
    const ref = createRef<HTMLDivElement>();
    const view = render(<><div ref={ref} /><WoolyTargetPointer target={new DOMRect(0, 0, 300, 200)} panelRef={ref} /></>);
    act(() => vi.runOnlyPendingTimers());
    expect(view.container.querySelector("svg")).toBeNull();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
