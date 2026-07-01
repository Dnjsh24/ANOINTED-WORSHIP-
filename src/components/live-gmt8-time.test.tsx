import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatGmt8Time, LiveGmt8Time } from "@/components/live-gmt8-time";

describe("LiveGmt8Time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats timestamps in GMT+8", () => {
    expect(formatGmt8Time(new Date("2026-07-01T16:34:56.000Z"))).toBe("Today at 12:34:56 AM GMT+8");
  });

  it("updates the displayed time every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T16:34:56.000Z"));

    render(<LiveGmt8Time initialNowIso="2026-07-01T16:34:56.000Z" />);

    expect(screen.getByText("Today at 12:34:56 AM GMT+8")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Today at 12:34:57 AM GMT+8")).toBeInTheDocument();
  });
});
