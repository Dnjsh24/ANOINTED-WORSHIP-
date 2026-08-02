import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogFiles = [
  "members-client.tsx",
  "arrangement-editor.tsx",
  "setlist-template-picker.tsx",
  "song-form.tsx",
  "edit-band-notes-button.tsx",
  "event-delete-button.tsx",
  "save-as-template-button.tsx",
];

describe("confirmed dialog accessibility contracts", () => {
  it.each(dialogFiles)("gives %s shared focus lifecycle and dialog semantics", (file) => {
    const source = readFileSync(`src/components/${file}`, "utf8");
    expect(source).toContain("useAccessibleDialog");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("aria-labelledby=");
  });

  it("uses native buttons for setlist template choices", () => {
    const source = readFileSync("src/components/setlist-template-picker.tsx", "utf8");
    expect(source).toContain('<button\n                  type="button"');
    expect(source).not.toContain('<div \n                  key={t.id}');
  });

  it("labels slide swatches and provides minimum-size controls", () => {
    const source = readFileSync("src/components/slide-background-picker.tsx", "utf8");
    expect(source).toContain("aria-label={`Use solid color ${color}`}");
    expect(source).toContain("aria-label={`Use gradient ${index + 1}`}");
    expect(source).toContain("size-11");
  });
});
