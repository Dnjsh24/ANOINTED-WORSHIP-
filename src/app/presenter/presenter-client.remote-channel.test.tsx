import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRemoteCommandSubscription } from "@/lib/presentation/use-remote-command-subscription";

describe("useRemoteCommandSubscription", () => {
  it("authenticates Realtime before joining and dispatches commands to the latest handler", async () => {
    let cloudListener: ((event: { payload: unknown }) => void) | undefined;
    const callOrder: string[] = [];
    const channel = {
      on: vi.fn((_type, _filter, listener) => {
        cloudListener = listener;
        return channel;
      }),
      subscribe: vi.fn(() => {
        callOrder.push("subscribe");
      }),
    };
    const removeChannel = vi.fn();
    const client = {
      auth: {
        getSession: vi.fn(async () => {
          callOrder.push("get-session");
          return { data: { session: { access_token: "signed-in-token" } }, error: null };
        }),
      },
      realtime: {
        setAuth: vi.fn(async (token: string) => {
          callOrder.push(`set-auth:${token}`);
        }),
      },
      removeChannel,
    };
    const firstHandler = vi.fn();
    const latestHandler = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ handler }) => useRemoteCommandSubscription(channel, client, handler),
      { initialProps: { handler: firstHandler } },
    );

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledTimes(1));
    expect(callOrder).toEqual(["get-session", "set-auth:signed-in-token", "subscribe"]);

    rerender({ handler: latestHandler });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    act(() => cloudListener?.({ payload: { kind: "next-slide" } }));
    expect(firstHandler).not.toHaveBeenCalled();
    expect(latestHandler).toHaveBeenCalledWith({ kind: "next-slide" });

    unmount();
    expect(removeChannel).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("fails closed when no authenticated browser session is available", async () => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(),
    };
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      },
      realtime: { setAuth: vi.fn() },
      removeChannel: vi.fn(),
    };
    const onStatus = vi.fn();

    renderHook(() => useRemoteCommandSubscription(channel, client, vi.fn(), onStatus));

    await waitFor(() => expect(onStatus).toHaveBeenCalledWith("CHANNEL_ERROR", expect.any(Error)));
    expect(client.realtime.setAuth).not.toHaveBeenCalled();
    expect(channel.subscribe).not.toHaveBeenCalled();
  });
});
