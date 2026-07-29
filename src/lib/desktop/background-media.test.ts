import { describe, expect, it } from "vitest";
import { isSafeDesktopBackgroundStorageName } from "./background-media";

describe("desktop background storage names", () => {
  it("accepts managed asset names but rejects traversal and arbitrary paths", () => {
    expect(isSafeDesktopBackgroundStorageName("aB9_-x.mp4")).toBe(true);
    expect(isSafeDesktopBackgroundStorageName("../private.mp4")).toBe(false);
    expect(isSafeDesktopBackgroundStorageName("folder/file.mp4")).toBe(false);
  });
});
