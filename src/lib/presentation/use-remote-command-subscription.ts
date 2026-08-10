"use client";

import { useEffect, useRef } from "react";
import {
  authenticateRealtimeClient,
  type RealtimeAuthClient,
} from "./authenticated-realtime-channel";

type RemoteSubscriptionStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

type RemoteCommandChannel = {
  on: (
    type: "broadcast",
    filter: { event: string },
    listener: (event: { payload: unknown }) => void,
  ) => RemoteCommandChannel;
  subscribe: (callback?: (status: RemoteSubscriptionStatus, error?: Error) => void) => unknown;
};

type RemoteChannelClient<TChannel> = RealtimeAuthClient & {
  removeChannel: (channel: TChannel) => unknown;
};

export function useRemoteCommandSubscription<TChannel extends RemoteCommandChannel>(
  channel: TChannel | null,
  client: RemoteChannelClient<TChannel> | null,
  onCommand: (candidate: unknown) => void | Promise<void>,
  onStatus?: (status: RemoteSubscriptionStatus, error?: Error) => void,
) {
  const commandHandlerRef = useRef(onCommand);
  const statusHandlerRef = useRef(onStatus);

  useEffect(() => {
    commandHandlerRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    statusHandlerRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (!channel || !client) return;

    const cloudListener = (event: { payload: unknown }) => {
      void commandHandlerRef.current(event.payload);
    };
    let active = true;
    channel.on("broadcast", { event: "remote_command" }, cloudListener);
    void authenticateRealtimeClient(client)
      .then(() => {
        if (!active) return;
        channel.subscribe((status, error) => statusHandlerRef.current?.(status, error));
      })
      .catch((error: unknown) => {
        if (!active) return;
        statusHandlerRef.current?.(
          "CHANNEL_ERROR",
          error instanceof Error ? error : new Error("The private Presenter channel could not be joined."),
        );
      });
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [channel, client]);
}
