"use client";

import { useEffect, useRef } from "react";

type RemoteCommandChannel = {
  on: (
    type: "broadcast",
    filter: { event: string },
    listener: (event: { payload: unknown }) => void,
  ) => RemoteCommandChannel;
  subscribe: () => unknown;
};

type RemoteChannelClient<TChannel> = {
  removeChannel: (channel: TChannel) => unknown;
};

export function useRemoteCommandSubscription<TChannel extends RemoteCommandChannel>(
  channel: TChannel,
  client: RemoteChannelClient<TChannel>,
  onCommand: (candidate: unknown) => void | Promise<void>,
) {
  const commandHandlerRef = useRef(onCommand);

  useEffect(() => {
    commandHandlerRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    const cloudListener = (event: { payload: unknown }) => {
      void commandHandlerRef.current(event.payload);
    };
    channel.on("broadcast", { event: "remote_command" }, cloudListener).subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [channel, client]);
}
