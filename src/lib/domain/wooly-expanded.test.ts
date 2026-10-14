import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { woolyKnowledge } from "./wooly-knowledge";
import { woolyTaskGuides } from "./wooly-tasks";
import { canUseWoolyAccess, getWoolyHelpTopics, getWoolyTourSteps, parseTutorialCheckpoint, type WoolyAudience, type WoolyTourId } from "./wooly";
import { matchPreparedAnswer, matchRecordQuestion, type WoolyQuestion } from "./wooly-chat";
import { permissionValues } from "./wooly-permissions";
import { woolyDialogSurfaces } from "./wooly-surfaces";
import { woolyTaskStepIds } from "./wooly-task-step-ids";

const owner: WoolyAudience = { userId: "owner", hasTeam: true, canManageMembers: true, role: "owner", permissions: permissionValues };
const guest: WoolyAudience = { userId: "guest", hasTeam: false, canManageMembers: false, session: "guest" };
const input = (question: string, patch: Partial<WoolyQuestion> = {}): WoolyQuestion => ({ question, pagePath: "/dashboard", today: "2026-10-11", ...patch });
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sources(join(directory, entry.name)) : entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [readFileSync(join(directory, entry.name), "utf8")] : []);
}

describe("expanded knowledge contract and progress compatibility", () => {
  it("has at least 150 distinct answers, four real variants and source evidence", () => {
    expect(woolyKnowledge.length).toBeGreaterThanOrEqual(150);
    expect(new Set(woolyKnowledge.map((entry) => entry.id)).size).toBe(woolyKnowledge.length);
    expect(new Set(woolyKnowledge.map((entry) => entry.answer)).size).toBe(woolyKnowledge.length);
    for (const entry of woolyKnowledge) {
      expect(new Set(entry.variants).size, entry.id).toBeGreaterThanOrEqual(4);
      expect(entry.steps.length, entry.id).toBeGreaterThan(0);
      expect(entry.purpose.length, entry.id).toBeGreaterThan(10);
      expect(entry.evidence, entry.id).toContain("src/");
      if (entry.surface) expect(woolyDialogSurfaces, entry.id).toContain(entry.surface);
      if (entry.tutorial) {
        expect(woolyTaskStepIds[entry.id], entry.id).toHaveLength(entry.steps.length);
        expect(new Set(woolyTaskStepIds[entry.id]).size, entry.id).toBe(entry.steps.length);
      }
    }
  });
  it("uses real stable targets and preserves old and new checkpoint identifiers", () => {
    const source = sources(join(process.cwd(), "src")).join("\n");
    for (const [id, guide] of Object.entries(woolyTaskGuides)) {
      for (const step of guide.steps) {
        expect(source.includes(`data-wooly-target="${step.target}"`) || ["home", "setlists"].includes(step.target), `${id}/${step.id}: ${step.target}`).toBe(true);
        expect(parseTutorialCheckpoint({ tourId: id, version: 1, status: "paused", nextStep: step.id })).not.toBeNull();
      }
    }
    expect(parseTutorialCheckpoint({ tourId: "essentials", version: 1, status: "completed", nextStep: "finish" })).not.toBeNull();
    expect(parseTutorialCheckpoint({ tourId: "task-forged", version: 1, status: "paused", nextStep: "intro" })).toBeNull();
  });
  it("filters forged choices and last topics against current permissions", () => {
    const protectedEntry = woolyKnowledge.find((entry) => Array.isArray(entry.access));
    expect(protectedEntry).toBeDefined();
    const member = { ...owner, canManageMembers: false, permissions: [] };
    expect(canUseWoolyAccess(protectedEntry!.access, member)).toBe(false);
    expect(matchPreparedAnswer(input("help", { choice: { kind: "topic", id: protectedEntry!.id } }), member).kind).toBe("unknown");
    const result = matchPreparedAnswer(input("how do I save it?", { confirmedTopicId: protectedEntry!.id }), guest);
    if (result.kind === "answer") expect(result.confirmedTopicId).not.toBe(protectedEntry!.id);
    expect(getWoolyHelpTopics(guest).every((topic) => !topic.id.startsWith("task-"))).toBe(true);
  });
  it.each(woolyKnowledge)("answers the four authored variations for $id", (entry) => {
      const audience = entry.access === "before-team" ? { ...owner, hasTeam: false } : owner;
      for (const question of entry.variants) {
        const result = matchPreparedAnswer(input(question, { pagePath: entry.route }), audience);
        const ids = result.kind === "answer" ? [result.confirmedTopicId] : result.kind === "clarification" ? result.choices.map((choice) => choice.value.kind === "topic" ? choice.value.id : "") : [];
        expect(ids, `${entry.id}: ${question}`).toContain(entry.id);
      }
  });
  it("does not bind a dynamic task to a list or invent a record", () => {
    const entry = woolyKnowledge.find((candidate) => candidate.tutorial && candidate.route.includes("["))!;
    expect(getWoolyTourSteps(`task-${entry.id}`, "/songs", owner)).toEqual([]);
    const actualRoute = entry.route.replace(/\[[^\]]+\]/g, "chosen-record");
    const steps = getWoolyTourSteps(`task-${entry.id}` as WoolyTourId, actualRoute, owner);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => !step.route.includes("[") && step.route.includes("chosen-record"))).toBe(true);
  });
  it("binds the dance creation query while preserving its destination", () => {
    const steps = getWoolyTourSteps("task-dance-save", "/dance", owner);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.route === "/dance?new=true")).toBe(true);
    expect(matchPreparedAnswer(input("Save a dance chart"), owner)).toMatchObject({ kind: "answer", sources: [{ href: "/dance?new=true" }] });
  });
  it.each([
    ["please insert a song into my service plan", "setlist-add-songs"],
    ["how do i delte a library sogn?", "song-delete"],
    ["How do I edit a song?", "song-edit"],
  ])("handles unseen wording without following the wrong page: %s", (question, expected) => {
    const result = matchPreparedAnswer(input(question, { pagePath: "/admin/settings", confirmedTopicId: "settings-save" }), owner);
    const topics = result.kind === "answer" ? [result.confirmedTopicId] : result.kind === "clarification" ? result.choices.map((choice) => choice.value.id) : [];
    expect(topics).toContain(expected);
  });
  it("offers choices for a vague follow-up and explains BPM without team lookup access", () => {
    expect(matchPreparedAnswer(input("how do I save it", { confirmedTopicId: "song-bpm" }), owner).kind).toBe("clarification");
    expect(matchPreparedAnswer(input("What does BPM mean?"), { ...owner, permissions: [] })).toMatchObject({ kind: "answer", confirmedTopicId: "song-bpm-meaning" });
  });
});

describe("instructional versus record routing", () => {
  it.each(["What does BPM mean?", "What is BPM?", "How do I add songs to a setlist?", "How can I find a song?", "How do I schedule an event on a date?"])("keeps %s instructional", (text) => expect(matchRecordQuestion(input(text))).toBeNull());
  it("retains named record lookups", () => expect(matchRecordQuestion(input("What is the BPM of Opening Song?"))).toMatchObject({ intent: "song-details", term: "Opening Song" }));
  it.each(["How Great Thou Art", "Save Me", "Never Alone", "Don't Stop"])("preserves instructional words in a requested record name: %s", (name) => {
    expect(matchRecordQuestion(input(`Find song ${name}`))).toMatchObject({ intent: "find-song", term: name });
    expect(matchRecordQuestion(input(`What is the BPM of ${name}?`))).toMatchObject({ intent: "song-details", term: name });
  });
  it("reads a setlist suffix and honors a denied lookup", () => {
    expect(matchRecordQuestion(input("songs in Sunday Service setlist"))).toMatchObject({ intent: "setlist-songs", term: "Sunday Service" });
    expect(matchRecordQuestion(input("Do not show next event"))).toBeNull();
  });
  it.each(["I cannot send a message", "I can’t send a message"])("offers the saved sending troubleshooting answer: %s", (question) => expect(matchPreparedAnswer(input(question), owner)).toMatchObject({ kind: "answer", confirmedTopicId: "message-send-problem" }));
  it.each(["How do I delete a song without saving?", "Do not delete the setlist", "Never send a message", "What is the weather on Saturn?"])("never guesses for negation or unrelated text: %s", (text) => expect(matchPreparedAnswer(input(text), owner).kind).not.toBe("answer"));
});
