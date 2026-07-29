import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRemoteCommandSubscription } from "@/lib/presentation/use-remote-command-subscription";

describe("useRemoteCommandSubscription", () => {
  it("joins a channel once while dispatching commands to the latest handler", () => {
    let cloudListener: ((event: { payload: unknown }) => void) | undefined;
    const channel = {
      on: vi.fn((_type, _filter, listener) => {
        cloudListener = listener;
        return channel;
      }),
      subscribe: vi.fn(),
    };
    const removeChannel = vi.fn();
    const client = { removeChannel };
    const firstHandler = vi.fn();
    const latestHandler = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ handler }) => useRemoteCommandSubscription(channel, client, handler),
      { initialProps: { handler: firstHandler } },
    );

    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    rerender({ handler: latestHandler });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    act(() => cloudListener?.({ payload: { kind: "next-slide" } }));
    expect(firstHandler).not.toHaveBeenCalled();
    expect(latestHandler).toHaveBeenCalledWith({ kind: "next-slide" });

    unmount();
    expect(removeChannel).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
