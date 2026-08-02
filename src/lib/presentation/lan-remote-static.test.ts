import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("standalone Wi-Fi Worship Remote", () => {
  const html = readFileSync(resolve(process.cwd(), "desktop/lan-remote.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "desktop/main.cjs"), "utf8");

  it("keeps the requested source order", () => {
    expect(html.indexOf('id="songs"')).toBeLessThan(html.indexOf('id="open-presentations"'));
    expect(html.indexOf('id="open-presentations"')).toBeLessThan(html.indexOf('id="open-bible"'));
  });

  it("supports the bounded unified commands without embedding local media paths", () => {
    expect(html).toContain('send("present-presentation-slide",{presentationId:deck.id,slideId:slide.id})');
    expect(html).toContain('send("present-bible-verse",{reference:verse.reference,text:verse.text,translation:bible.translation})');
    expect(html).not.toContain("mediaUrl");
    expect(main).toContain('"present-presentation-slide", "present-bible-verse"');
    expect(main).toContain('new URL("/api/bible", appUrl)');
  });
});
