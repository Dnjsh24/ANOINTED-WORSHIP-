import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { canUseWoolyTour, getWoolyHelpTopics, getWoolyTourSteps, parseTutorialCheckpoint, woolyPageGuides, type WoolyAudience } from "./wooly";
import { getWoolyPageGuideId, matchesWoolyRoute, woolyOperationalRoutes, woolyRedirectRoutes, type WoolyPageTourId } from "./wooly-page-guides";
import { permissionValues } from "./wooly-permissions";
import { woolyKnowledge } from "./wooly-knowledge";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}
const teammate: WoolyAudience = { userId: "member", hasTeam: true, canManageMembers: false, permissions: [] };

describe("Wooly page coverage and access", () => {
  it("covers every website page with a guide or a classified redirect", () => {
    const app = join(process.cwd(), "src/app");
    const routes = sourceFiles(app).filter((path) => path.endsWith("page.tsx")).map((path) => {
      const route = relative(app, path).replaceAll("\\", "/").replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "");
      return `/${route}`;
    });
    expect(routes.length).toBeGreaterThan(40);
    for (const route of routes) expect(Object.values(woolyPageGuides).some((guide) => guide.route === route) || woolyRedirectRoutes.some((redirect) => redirect === route) || woolyOperationalRoutes.some((privateRoute) => privateRoute === route), route).toBe(true);
  });

  it("declares stable real-page targets and keeps every checkpoint valid", () => {
    const source = sourceFiles(join(process.cwd(), "src")).filter((path) => !path.endsWith(".test.tsx")).map((path) => readFileSync(path, "utf8")).join("\n");
    for (const [id, guide] of Object.entries(woolyPageGuides)) {
      expect(new Set(guide.steps.map((step) => step.id)).size).toBe(guide.steps.length);
      for (const step of guide.steps) {
        expect(source.includes(`data-wooly-target="${step.target}"`) || ["home", "setlists", "nav-setlists", "nav-events"].includes(step.target), `${id}: ${step.target}`).toBe(true);
        expect(parseTutorialCheckpoint({ tourId: id, version: 1, status: "paused", nextStep: step.id })).not.toBeNull();
      }
    }
  });

  it("binds dynamic guides only to the actual page and rejects parameter placeholders and unknown routes", () => {
    const id = getWoolyPageGuideId("/songs/song-123/edit");
    expect(id).toBe("page-song-edit");
    const editor = { ...teammate, permissions: ["songs.edit"] as const };
    expect(getWoolyTourSteps(id!, "/songs/song-123/edit", editor).every((step) => step.route === "/songs/song-123/edit")).toBe(true);
    expect(getWoolyTourSteps(id!, "/songs", editor)).toEqual([]);
    expect(matchesWoolyRoute("/songs/[id]", "/songs/")).toBe(false);
    expect(getWoolyPageGuideId("/api/actions")).toBeNull();
    expect(getWoolyPageGuideId("/songs/new")).toBe("page-song-new");
    expect(getWoolyPageGuideId("/songs/trash")).toBe("page-song-trash");
    expect(getWoolyPageGuideId("/songs/[id]")).toBeNull();
  });

  it("uses explicit effective permissions and hides unavailable action steps", () => {
    expect(canUseWoolyTour("page-settings", teammate)).toBe(false);
    expect(canUseWoolyTour("page-song-edit", teammate)).toBe(false);
    expect(canUseWoolyTour("page-event-new", { ...teammate, permissions: ["events.request"] })).toBe(true);
    expect(getWoolyTourSteps("page-messages", "/messages", teammate).map((step) => step.id)).toEqual(["step-1", "step-2"]);
    expect(getWoolyTourSteps("page-announcements", "/announcements", { ...teammate, permissions: ["announcements.create"] })).toHaveLength(1);
    expect(getWoolyTourSteps("page-announcements", "/announcements", { ...teammate, permissions: ["members.manage"] })).toHaveLength(2);
    const owner = { ...teammate, role: "owner", canManageMembers: true, permissions: permissionValues };
    for (const id of Object.keys(woolyPageGuides) as WoolyPageTourId[]) {
      if (woolyPageGuides[id].access !== "before-team") expect(canUseWoolyTour(id, owner), id).toBe(true);
    }
  });

  it("gives guests public instructions without account or management topics", () => {
    const guest = { ...teammate, hasTeam: false, session: "guest" as const };
    expect(canUseWoolyTour("page-login", guest)).toBe(true);
    expect(canUseWoolyTour("joining", guest)).toBe(false);
    expect(getWoolyHelpTopics(guest).every((topic) => ["page-welcome", "page-login", "page-remote"].includes(topic.id) || woolyKnowledge.some((entry) => entry.id === topic.id && entry.access === "public"))).toBe(true);
  });
});
