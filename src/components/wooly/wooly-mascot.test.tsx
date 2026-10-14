import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WoolyMascot } from "./wooly-mascot";

const motion = vi.hoisted(() => ({ create: vi.fn(), pause: vi.fn(), pose: vi.fn(), dispose: vi.fn() }));
vi.mock("./wooly-renderer", () => ({ createWoolyRenderer: motion.create }));

let reducedMotion = false;
const motionListeners = new Set<() => void>();

function Preview() {
  const [paused, setPaused] = useState(false);
  return <WoolyMascot pose="greeting" paused={paused} onPausedChange={setPaused} />;
}

async function loadSheet(container: HTMLElement) {
  const sheet = container.querySelector<HTMLImageElement>(".wooly-mascot-source");
  expect(sheet).not.toBeNull();
  fireEvent.load(sheet!);
  await waitFor(() => expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "true"));
  return sheet!;
}

describe("Wooly character animation", () => {
  beforeEach(() => {
    reducedMotion = false;
    motionListeners.clear();
    motion.create.mockReset().mockReturnValue({ setPaused: motion.pause, setPose: motion.pose, dispose: motion.dispose });
    motion.pause.mockReset();
    motion.pose.mockReset();
    motion.dispose.mockReset();
    vi.stubGlobal("matchMedia", () => ({
      matches: reducedMotion,
      addEventListener: (_: string, listener: () => void) => motionListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => motionListeners.delete(listener),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the decorative fallback until frames load, then autoplays without website controls", async () => {
    const { container } = render(<WoolyMascot pose="greeting" />);
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "false");
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-wave-closed-v2.webp");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await loadSheet(container);
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(motion.pause).toHaveBeenLastCalledWith(false);
  });

  it("lets a keyboard user pause and resume without losing focus", async () => {
    const user = userEvent.setup();
    const { container } = render(<Preview />);
    await loadSheet(container);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-paused", "true");
    expect(screen.getByRole("button", { name: "Play Wooly animation" })).toHaveFocus();
    expect(motion.pause).toHaveBeenLastCalledWith(true);
    await user.keyboard(" ");
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-paused", "false");
    expect(screen.getByRole("button", { name: "Pause Wooly animation" })).toHaveFocus();
    expect(motion.pause).toHaveBeenLastCalledWith(false);
  });

  it("honors reduced motion immediately and when the OS setting changes", async () => {
    reducedMotion = true;
    const { container, unmount } = render(<Preview />);
    expect(container.querySelector(".wooly-mascot-source")).not.toBeInTheDocument();
    expect(motion.create).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    act(() => { reducedMotion = false; motionListeners.forEach((listener) => listener()); });
    await loadSheet(container);
    expect(screen.getByRole("button", { name: "Pause Wooly animation" })).toBeInTheDocument();
    act(() => { reducedMotion = true; motionListeners.forEach((listener) => listener()); });
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "false");
    expect(container.querySelector(".wooly-mascot-source")).not.toBeInTheDocument();
    expect(motion.dispose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    expect(motionListeners.size).toBe(0);
  });

  it("falls back to the current pose when the sheet fails, without exposing a broken control", () => {
    const { container } = render(<Preview />);
    fireEvent.error(container.querySelector(".wooly-mascot-source")!);
    expect(container.querySelector(".wooly-mascot-source")).not.toBeInTheDocument();
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "false");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-wave-closed-v2.webp");
  });

  it("retains the user's pause choice when the tutorial changes pose", async () => {
    const { container, rerender } = render(<WoolyMascot pose="speaking" paused={true} onPausedChange={() => undefined} />);
    await loadSheet(container);
    rerender(<WoolyMascot pose="listening" paused={true} onPausedChange={() => undefined} />);
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-paused", "true");
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-pose", "listening");
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-neutral-v2.webp");
    expect(motion.pose).toHaveBeenLastCalledWith("listening");
    expect(motion.create).toHaveBeenCalledOnce();
    expect(motion.dispose).not.toHaveBeenCalled();
    expect(new URL(container.querySelector<HTMLImageElement>(".wooly-mascot-source")!.src).pathname).toBe("/brand/wooly/whole-frames-v3.webp");
  });

  it("switches from listening to walking using the same artwork and graphics resources", async () => {
    const { container, rerender } = render(<WoolyMascot pose="listening" paused={false} onPausedChange={() => undefined} />);
    await loadSheet(container);
    rerender(<WoolyMascot pose="walking" paused={false} onPausedChange={() => undefined} />);
    expect(motion.create).toHaveBeenCalledOnce();
    expect(motion.pose).toHaveBeenLastCalledWith("walking");
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-pose", "walking");
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-neutral-v2.webp");
  });

  it("shows an existing still without loading walking artwork when motion is reduced", () => {
    reducedMotion = true;
    const { container } = render(<WoolyMascot pose="walking" paused={false} onPausedChange={() => undefined} />);
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-neutral-v2.webp");
    expect(container.querySelector(".wooly-mascot-source")).not.toBeInTheDocument();
    expect(motion.create).not.toHaveBeenCalled();
  });

  it("uses a planted four-leg still for standing speech and keeps the same renderer when switching to it", async () => {
    const { container, rerender } = render(<WoolyMascot pose="speaking" paused={true} onPausedChange={() => undefined} />);
    await loadSheet(container);
    rerender(<WoolyMascot pose="standing-talking" paused={true} onPausedChange={() => undefined} />);
    expect(motion.create).toHaveBeenCalledOnce();
    expect(motion.pose).toHaveBeenLastCalledWith("standing-talking");
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-neutral-v2.webp");
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-paused", "true");
    act(() => { reducedMotion = true; motionListeners.forEach((listener) => listener()); });
    expect(container.querySelector(".wooly-mascot-source")).not.toBeInTheDocument();
    expect(container.querySelector(".wooly-mascot-still")).toHaveAttribute("src", "/brand/wooly/whole-neutral-v2.webp");
  });

  it("keeps the still usable when graphics is unavailable", async () => {
    motion.create.mockImplementation(() => { throw new Error("Canvas unavailable"); });
    const { container } = render(<Preview />);
    fireEvent.load(container.querySelector(".wooly-mascot-source")!);
    await waitFor(() => expect(container.querySelector(".wooly-mascot-source")).not.toBeInTheDocument());
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "false");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not allocate graphics before artwork loads or after unmount", () => {
    const { container, unmount } = render(<Preview />);
    const image = container.querySelector(".wooly-mascot-source")!;
    expect(motion.create).not.toHaveBeenCalled();
    unmount();
    fireEvent.load(image);
    expect(motion.create).not.toHaveBeenCalled();
  });

  it("releases graphics and returns to the still after context loss", async () => {
    const { container } = render(<Preview />);
    await loadSheet(container);
    act(() => motion.create.mock.calls[0][2]());
    expect(container.querySelector(".wooly-mascot")).toHaveAttribute("data-animated", "false");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(motion.dispose).toHaveBeenCalledOnce();
  });
});
