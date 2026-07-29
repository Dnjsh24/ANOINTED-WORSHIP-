"use client";

import { useEffect, useRef } from "react";

type DesktopRemoteChannel = {
  addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: "message", listener: (event: MessageEvent) => void) => void;
  postMessage: (message: unknown) => void;
  close: () => void;
};

export function useDesktopRemoteChannel(
  channel: DesktopRemoteChannel | null,
  onMessage: (event: MessageEvent) => void,
) {
  const messageHandlerRef = useRef(onMessage);

  useEffect(() => {
    messageHandlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!channel) return;

    const listener = (event: MessageEvent) => messageHandlerRef.current(event);
    channel.addEventListener("message", listener);
    channel.postMessage({ event: "remote_state_request" });
    channel.postMessage({ event: "presentation_state_request" });

    return () => {
      channel.removeEventListener("message", listener);
      channel.close();
    };
  }, [channel]);
}
