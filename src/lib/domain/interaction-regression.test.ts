import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

const filesToScan = [
  "app/dashboard/page.tsx",
  "app/setlists/page.tsx",
  "app/setlists/[id]/page.tsx",
  "app/events/page.tsx",
  "app/messages/page.tsx",
  "app/members/page.tsx",
  "app/profile/page.tsx",
  "app/admin/settings/page.tsx",
  "app/songs/page.tsx",
  "app/songs/[id]/page.tsx",
  "components/app-shell.tsx",
  "components/attendance-toggle.tsx",
  "components/song-library-grid.tsx",
].map((file) => join(sourceRoot, file));

describe("interactive control regression guard", () => {
  it("does not ship obvious placeholder interactions", () => {
    const source = filesToScan.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toMatch(/href=["']#/);
    expect(source).not.toMatch(/console\.log\(/);
    expect(source).not.toMatch(/alert\(/);
    expect(source).not.toMatch(/TODO|FIXME/);
    expect(source).not.toMatch(/onClick=\{\(\)\s*=>\s*\{\s*\}\}/);
    expect(source).not.toMatch(/<Button(?!Link)(?![^>]*type=)/);
    expect(source).not.toMatch(/<button(?![^>]*type=)(?![^>]*aria-label=)/);
  });
});
