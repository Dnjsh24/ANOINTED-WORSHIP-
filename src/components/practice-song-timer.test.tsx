import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeSongTimer } from "./practice-song-timer";

describe("PracticeSongTimer", () => {
  afterEach(() => vi.useRealTimers());

  it("counts down, pauses, resumes, resets, and shows overtime", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
    render(<PracticeSongTimer songTitle="Opening Song" minutes={1} />);

    expect(screen.getByText("1 allocated minute for Opening Song")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("01:00");
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:50");

    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:50");
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }));
    await act(async () => vi.advanceTimersByTimeAsync(51_000));
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("00:01");

    fireEvent.click(screen.getByRole("button", { name: "Reset timer" }));
    expect(screen.getByRole("timer")).toHaveTextContent("01:00");
    expect(screen.getByRole("button", { name: "Start timer" })).toBeEnabled();
  });

  it("disables start for a zero-minute allocation", () => {
    render(<PracticeSongTimer songTitle="Interlude" minutes={0} />);
    expect(screen.getByRole("button", { name: "Start timer" })).toBeDisabled();
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  });
});
