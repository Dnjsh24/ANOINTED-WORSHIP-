import { describe, expect, it } from "vitest";
import { captureConstraints } from "./live-sources";

describe("desktop live source constraints", () => {
  it("uses a selected Electron desktop source without audio capture", () => {
    expect(captureConstraints("live-screen", "screen:42:0")).toEqual({
      audio: false,
      video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: "screen:42:0" } },
    });
  });

  it("uses a selected webcam device", () => {
    expect(captureConstraints("live-camera", "camera-id")).toEqual({ audio: false, video: { deviceId: { exact: "camera-id" } } });
  });
});
