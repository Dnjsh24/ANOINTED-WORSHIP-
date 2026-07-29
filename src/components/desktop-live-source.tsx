"use client";

import { useEffect, useRef, useState } from "react";
import { captureConstraints, type DesktopLiveLayerKind } from "@/lib/desktop/live-sources";

/** Opens a locally selected capture source in the window that renders the layer. */
export function DesktopLiveSource({ kind, sourceId, className = "" }: { kind: DesktopLiveLayerKind; sourceId?: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!sourceId || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | undefined;
    let active = true;
    void navigator.mediaDevices.getUserMedia(captureConstraints(kind, sourceId)).then((next) => {
      stream = next;
      if (!active) { next.getTracks().forEach((track) => track.stop()); return; }
      if (videoRef.current) { videoRef.current.srcObject = next; void videoRef.current.play().catch(() => undefined); }
    }).catch(() => active && setError(kind === "live-screen" ? "Screen source unavailable" : "Camera unavailable"));
    return () => { active = false; stream?.getTracks().forEach((track) => track.stop()); };
  }, [kind, sourceId]);

  if (!sourceId) return <div className={`grid h-full w-full place-items-center bg-black/50 text-xs text-zinc-300 ${className}`}>Choose a local {kind === "live-screen" ? "screen" : "camera"}</div>;
  if (error) return <div className={`grid h-full w-full place-items-center bg-red-950/40 px-2 text-center text-xs text-red-100 ${className}`}>{error}</div>;
  return <video ref={videoRef} className={`h-full w-full object-cover ${className}`} muted playsInline />;
}
