import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RehearsalRunThrough } from "./rehearsal-run-through";

const songs = [
  { id: "a", title: "Opening", assignedKey: "D", bpm: 80, lead: "Alex", arrangement: "Quiet intro" },
  { id: "b", title: "Reflection", assignedKey: "G", bpm: null },
];
const allocations = { a: { minutes: 1, focus: "Agree harmonies" }, b: { minutes: 3, focus: "" } };
const timer = () => screen.getByRole("timer");
const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T04:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("rehearsal run-through", () => {
  it("shows the current song's musical cues, focus, and next song", () => {
    render(<RehearsalRunThrough songs={songs} allocations={allocations} />);
    expect(timer()).toHaveTextContent("01:00");
    expect(screen.getByText("Key D · 80 BPM · Lead: Alex")).toBeVisible();
    expect(screen.getByText("Arrangement: Quiet intro")).toBeVisible();
    expect(screen.getByText("Focus: Agree harmonies")).toBeVisible();
    expect(screen.getByText("Up next: Reflection · Key G")).toBeVisible();
    expect(timer()).toHaveAttribute("aria-live", "off");
  });

  it("starts, pauses without advancing, resumes, and resets the same song", () => {
    render(<RehearsalRunThrough songs={songs} allocations={allocations} />);
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    advance(10_000);
    expect(timer()).toHaveTextContent("00:50");
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    advance(20_000);
    expect(timer()).toHaveTextContent("00:50");
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }));
    advance(5_000);
    expect(timer()).toHaveTextContent("00:45");
    fireEvent.click(screen.getByRole("button", { name: "Reset timer" }));
    advance(3_000);
    expect(timer()).toHaveTextContent("01:00");
    expect(screen.getByRole("button", { name: "Start timer" })).toBeEnabled();
  });

  it("uses elapsed clock time after delayed ticks and shows overtime", () => {
    render(<RehearsalRunThrough songs={songs} allocations={allocations} />);
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    act(() => vi.setSystemTime(new Date("2026-10-13T04:01:05Z")));
    advance(250);
    expect(timer()).toHaveTextContent("00:05");
    expect(timer()).toHaveAccessibleName("Rehearsal overtime");
    expect(screen.getByText("Overtime")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause timer" })).toBeEnabled();
  });

  it("resets and pauses on Next song or explicit song selection", () => {
    render(<RehearsalRunThrough songs={songs} allocations={allocations} />);
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    advance(8_000);
    fireEvent.click(screen.getByRole("button", { name: "Next song" }));
    expect(screen.getByLabelText("Rehearsing song")).toHaveValue("b");
    expect(timer()).toHaveTextContent("03:00");
    advance(2_000);
    expect(timer()).toHaveTextContent("03:00");
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rehearsing song"), { target: { value: "a" } });
    expect(timer()).toHaveTextContent("01:00");
  });

  it("reflects current plan changes without resetting elapsed rehearsal time", () => {
    const { rerender } = render(<RehearsalRunThrough songs={songs} allocations={allocations} />);
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    advance(10_000);
    rerender(<RehearsalRunThrough songs={songs} allocations={{ ...allocations, a: { minutes: 2, focus: "Work on ending" } }} />);
    expect(timer()).toHaveTextContent("01:50");
    expect(screen.getByText("Focus: Work on ending")).toBeVisible();
  });

  it("requires an allocation before starting a zero-minute song and handles empty plans", () => {
    const { rerender } = render(<RehearsalRunThrough songs={songs} allocations={{ a: { minutes: 0, focus: "" } }} />);
    expect(screen.getByRole("button", { name: "Start timer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next song" }));
    expect(timer()).toHaveTextContent("05:00");
    rerender(<RehearsalRunThrough songs={[]} allocations={{}} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("cleans up its interval when leaving the page", () => {
    const { unmount } = render(<RehearsalRunThrough songs={songs} allocations={allocations} />);
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
