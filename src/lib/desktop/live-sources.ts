export type DesktopLiveLayerKind = "live-camera" | "live-screen";

export function captureConstraints(kind: DesktopLiveLayerKind, sourceId: string): MediaStreamConstraints {
  if (kind === "live-screen") {
    return { audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } } as MediaTrackConstraints } as MediaStreamConstraints;
  }
  return { audio: false, video: { deviceId: { exact: sourceId } } };
}
