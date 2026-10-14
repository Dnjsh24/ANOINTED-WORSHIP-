import { describe, expect, it } from "vitest";
import { canUseWoolyTour, getWoolyHelpTopics, isTerminalTutorialStatus, parseTutorialCheckpoint, woolyHelpTopics, woolyTours } from "./wooly";

const member = { userId: "member", hasTeam: true, canManageMembers: false };

describe("Wooly catalog boundaries", () => {
  it("accepts an actual checkpoint and rejects unknown tours, versions, states, and steps", () => {
    const checkpoint = { tourId: "essentials", version: 1, status: "paused", nextStep: "messages" };
    expect(parseTutorialCheckpoint(checkpoint)).toEqual(checkpoint);
    for (const patch of [{ tourId: "admin" }, { version: 2 }, { status: "approved" }, { nextStep: "delete" }, { nextStep: 1 }, { status: {} }]) {
      expect(parseTutorialCheckpoint({ ...checkpoint, ...patch })).toBeNull();
    }
    for (const value of [null, true, "essentials", {}, []]) expect(parseTutorialCheckpoint(value)).toBeNull();
  });

  it("does not leak team-manager help to ordinary members or pre-team users", () => {
    expect(getWoolyHelpTopics(member).map((topic) => topic.id)).not.toContain("members");
    expect(getWoolyHelpTopics({ ...member, canManageMembers: true }).map((topic) => topic.id)).toContain("members");
    const beforeTeam = getWoolyHelpTopics({ ...member, hasTeam: false, canManageMembers: true });
    expect(beforeTeam.map((topic) => topic.id)).toEqual(expect.arrayContaining(["joining", "creating", "approval"]));
    expect(beforeTeam.some((topic) => topic.id === "members" || topic.id === "page-members")).toBe(false);
  });

  it("searches prepared answers without inventing responses for unmatched queries", () => {
    expect(getWoolyHelpTopics(member, "  REHEARSAL ").map((topic) => topic.id)).toContain("timeline");
    expect(getWoolyHelpTopics(member, "unmatched nonsense")).toEqual([]);
    expect(getWoolyHelpTopics(member, "roles").some((topic) => topic.id === "members" || topic.id === "page-members")).toBe(false);
  });

  it("only offers tours appropriate to the user's membership", () => {
    expect(canUseWoolyTour("essentials", member)).toBe(true);
    expect(canUseWoolyTour("joining", member)).toBe(false);
    expect(canUseWoolyTour("creating", { ...member, hasTeam: false })).toBe(true);
    expect(canUseWoolyTour("essentials", { ...member, hasTeam: false })).toBe(false);
  });

  it("treats completion and skipping as terminal but allows paused progress to resume", () => {
    expect(isTerminalTutorialStatus("completed")).toBe(true);
    expect(isTerminalTutorialStatus("skipped")).toBe(true);
    expect(isTerminalTutorialStatus("paused")).toBe(false);
  });

  it("only links Show me to existing safe tour steps", () => {
    for (const topic of woolyHelpTopics) {
      if (topic.tourId) expect(woolyTours[topic.tourId].steps.some((step) => step.id === topic.stepId)).toBe(true);
      expect(topic.route).toMatch(/^\/(teams|pending|dashboard|setlists|events|messages|profile|songs|members|analytics|worship-remote)(\/|$)/);
    }
    expect(woolyTours.joining.steps.some((step) => step.route === "/pending")).toBe(false);
  });
});
