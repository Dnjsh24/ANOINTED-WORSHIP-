import { describe, expect, it } from "vitest";
import { getYouTubeVideoId, safeVideoUrl } from "./media";

describe("video references", () => {
  it.each([
    "https://www.youtube.com/watch?list=playlist&v=dQw4w9WgXcQ&t=30",
    "https://youtu.be/dQw4w9WgXcQ?si=share",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ])("accepts supported video reference %s", url => { expect(getYouTubeVideoId(url)).toBe("dQw4w9WgXcQ"); });
  it.each([
    "javascript:alert(1);//watch?v=dQw4w9WgXcQ",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=too-short",
  ])("rejects untrusted or malformed YouTube references %s", url => { expect(getYouTubeVideoId(url)).toBeNull(); });
  it("keeps other web video links while excluding executable schemes and credentials", () => {
    expect(safeVideoUrl("https://vimeo.com/123")).toBe("https://vimeo.com/123");
    expect(safeVideoUrl("javascript:alert(1)")).toBeNull();
    expect(safeVideoUrl("data:text/html,hello")).toBeNull();
    expect(safeVideoUrl("https://user:password@example.com/video")).toBeNull();
  });
});
