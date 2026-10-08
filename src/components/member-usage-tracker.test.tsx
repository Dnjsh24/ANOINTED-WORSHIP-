import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberUsageTracker } from "@/components/member-usage-tracker";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => ({ rpc }) }));

describe("visible, recent-input usage heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    rpc.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("records an initial foreground visit, then stops once idle", async () => {
    const view = render(<MemberUsageTracker teamId="team-a" />);
    await act(async () => { await Promise.resolve(); });
    expect(rpc).toHaveBeenCalledWith("record_member_usage", { p_team_id: "team-a" });
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(rpc).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not record a hidden or disconnected visit", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const view = render(<MemberUsageTracker teamId="team-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(rpc).not.toHaveBeenCalled();
    view.unmount();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MemberUsageTracker teamId="team-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("stops missing-migration requests without affecting the app", async () => {
    rpc.mockResolvedValue({ error: { code: "PGRST202" } });
    render(<MemberUsageTracker teamId="team-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not treat synthetic activity or returning to an idle tab as fresh input", async () => {
    render(<MemberUsageTracker teamId="team-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    window.dispatchEvent(new Event("pointerdown"));
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("credits recent real input at most once per minute and stops when that input goes stale", async () => {
    const listeners: EventListener[] = [];
    const originalAdd = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "pointerdown" && typeof listener === "function") listeners.push(listener);
      originalAdd(type, listener, options);
    });
    // Exercise the browser adapter callback directly. DOM-created events remain
    // untrusted, so the proxy represents the real browser event in this test.
    const trustedInput = new Proxy(new Event("pointerdown"), {
      get(target, key) { return key === "isTrusted" ? true : Reflect.get(target, key); },
    });
    render(<MemberUsageTracker teamId="team-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    act(() => { listeners[0](trustedInput); });
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(rpc).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(rpc).toHaveBeenCalledTimes(2);
    await act(async () => { listeners[0](trustedInput); await Promise.resolve(); });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
