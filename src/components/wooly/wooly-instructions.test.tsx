import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WoolyInstructions } from "./wooly-instructions";

beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Wooly instructions", () => {
  it("announces the complete explanation once while visual typing finishes automatically without controls", () => {
    vi.useFakeTimers();
    const view = render(<WoolyInstructions text="Hello 🐑 friend" announcement="Step 1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Step 1. Hello 🐑 friend");
    const typed = view.container.querySelector(".wooly-typed-text")!;
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(28));
    expect(typed).toHaveTextContent("H");
    for (let index = 1; index < Array.from("Hello 🐑 friend").length; index += 1) {
      act(() => vi.advanceTimersByTime(28));
    }
    expect(typed.textContent).toBe("Hello 🐑 friend");
    expect(typed).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels timers on step replacement and unmount", () => {
    vi.useFakeTimers();
    const view = render(<WoolyInstructions key="a" text="Old text" announcement="Step 1" />);
    act(() => vi.advanceTimersByTime(28));
    view.rerender(<WoolyInstructions key="b" text="New text" announcement="Step 2" />);
    expect(view.container.querySelector(".wooly-typed-text")!.textContent).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent("Step 2. New text");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shows complete text immediately with reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const view = render(<WoolyInstructions text="Read at your pace" announcement="Step 1" />);
    expect(view.container.querySelector(".wooly-typed-text")!.textContent).toBe("Read at your pace");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
