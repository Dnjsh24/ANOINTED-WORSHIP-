import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDesktopRemoteChannel } from "./use-desktop-remote-channel";

describe("useDesktopRemoteChannel", () => {
  it("does nothing when the desktop transport is unavailable", () => {
    expect(() => {
      const view = renderHook(() => useDesktopRemoteChannel(null, vi.fn()));
      view.unmount();
    }).not.toThrow();
  });

  it("keeps one channel open across rerenders and dispatches to the latest handler", () => {
    let listener: ((event: MessageEvent) => void) | null = null;
    const channel = {
      addEventListener: vi.fn((_type: "message", value: (event: MessageEvent) => void) => {
        listener = value;
      }),
      removeEventListener: vi.fn(() => {
        listener = null;
      }),
      postMessage: vi.fn(),
      close: vi.fn(),
    };
    const firstHandler = vi.fn();
    const latestHandler = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ handler }) => useDesktopRemoteChannel(channel, handler),
      { initialProps: { handler: firstHandler } },
    );

    expect(channel.postMessage).toHaveBeenCalledTimes(2);
    rerender({ handler: latestHandler });
    expect(channel.postMessage).toHaveBeenCalledTimes(2);

    act(() => listener?.(new MessageEvent("message", { data: { event: "remote_state" } })));
    expect(firstHandler).not.toHaveBeenCalled();
    expect(latestHandler).toHaveBeenCalledOnce();

    unmount();
    expect(channel.removeEventListener).toHaveBeenCalledOnce();
    expect(channel.close).toHaveBeenCalledOnce();
  });
});
