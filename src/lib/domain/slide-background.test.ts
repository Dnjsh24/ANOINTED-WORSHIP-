import { describe, expect, it } from "vitest";
import {
  MAX_SLIDE_BACKGROUND_BYTES,
  buildSlideBackgroundPath,
  validateSlideBackgroundFile,
} from "./slide-background";

describe("slide background upload boundary", () => {
  it("accepts only bounded PNG, JPEG, and WebP files", () => {
    expect(validateSlideBackgroundFile({ type: "image/png", size: 12, name: "slide.png" })).toEqual({ ok: true, extension: "png" });
    expect(validateSlideBackgroundFile({ type: "image/gif", size: 12, name: "slide.gif" }).ok).toBe(false);
    expect(validateSlideBackgroundFile({ type: "image/png", size: MAX_SLIDE_BACKGROUND_BYTES + 1, name: "large.png" }).ok).toBe(false);
  });

  it("builds stable team/user-scoped object paths without using file names", () => {
    expect(buildSlideBackgroundPath("team-id", "user-id", "object-id", "webp"))
      .toBe("team-id/user-id/slide-backgrounds/object-id.webp");
  });
});
