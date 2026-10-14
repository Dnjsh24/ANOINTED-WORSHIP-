import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWoolyGreeting } from "./use-wooly-greeting";

describe("Wooly's opening greeting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("shows for ten seconds without restarting on page renders, then returns on a fresh opening", () => {
    const view = renderHook(() => useWoolyGreeting(true), { wrapper: StrictMode });
    expect(view.result.current).toBe(true);
    act(() => vi.advanceTimersByTime(6000));
    view.rerender();
    act(() => vi.advanceTimersByTime(3999));
    expect(view.result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toBe(false);
    view.rerender();
    expect(view.result.current).toBe(false);
    view.unmount();
    const reopened = renderHook(() => useWoolyGreeting(true));
    expect(reopened.result.current).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(reopened.result.current).toBe(false);
  });

  it("gives a fresh ten seconds after returning from the background or browser history", () => {
    const { result } = renderHook(() => useWoolyGreeting(true));
    act(() => vi.advanceTimersByTime(3000));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(9999));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(false);
  });

  it("does not schedule disabled greetings and removes timers/listeners when closed", () => {
    const disabled = renderHook(() => useWoolyGreeting(false));
    expect(disabled.result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    disabled.unmount();
    const opened = renderHook(() => useWoolyGreeting(true));
    opened.unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    expect(vi.getTimerCount()).toBe(0);
  });
});
