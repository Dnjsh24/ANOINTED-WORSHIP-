import { describe, expect, it } from "vitest";
import { rankWoolyTopics, woolyActionCompatible, woolyWords } from "./wooly-matching";
import type { WoolyHelpTopic } from "./wooly";

const topic = (id: string, title: string, variants: readonly string[], feature = "Songs"): WoolyHelpTopic => ({ id, title, variants, feature, answer: id, keywords: "", route: "/songs", tourId: null, stepId: null, audience: "team" });
const topics = [
  topic("add", "Add a song", ["Create a song", "Put music into the song library"]),
  topic("delete", "Delete a song", ["Remove a song", "Erase a song"]),
  topic("restore", "Restore a removed song", ["Recover a deleted song"]),
  topic("view", "View a song", ["Read a song chart"]),
  topic("save", "Save a song", ["Save changes to a song"]),
  topic("setlist", "Add a song to a setlist", ["Add music to my service", "Put a song in a setlist"], "Setlists"),
];
describe("conservative action and feature matching", () => {
  it.each(["add snog", "add sogn", "add sgno", "creaet song", "delte song", "delet song"])("tolerates a common feature/action typo: %s", (question) => {
    const result = rankWoolyTopics(question, topics, "/songs");
    expect(result.ranked[0]?.topic.id).toBe(question.startsWith("del") ? "delete" : "add");
  });
  it("handles reordered wording and an unseen single-character typo", () => {
    expect(rankWoolyTopics("song library music put", topics, "/songs").ranked[0]?.topic.id).toBe("add");
    expect(rankWoolyTopics("deleete song", topics, "/songs").ranked[0]?.topic.id).toBe("delete");
  });
  it("keeps requested actions and record features separate", () => {
    expect(woolyActionCompatible("delete song", topics[2])).toBe(false);
    expect(woolyActionCompatible("view song", topics[4])).toBe(false);
    expect(woolyActionCompatible("save song", topics[3])).toBe(false);
    expect(rankWoolyTopics("add song to setlst", topics, "/songs").ranked[0]?.topic.id).toBe("setlist");
    expect(rankWoolyTopics("delete song", topics, "/songs").ranked[0]?.topic.id).toBe("delete");
  });
  it("uses confirmed context only for a follow-up, with explicit wording taking priority", () => {
    expect(rankWoolyTopics("add it", topics, "/songs", topics[5]).ranked[0]?.topic.id).toBe("setlist");
    expect(rankWoolyTopics("delete song", topics, "/setlists", topics[5]).ranked[0]?.topic.id).toBe("delete");
    expect(rankWoolyTopics("weather on Saturn", topics, "/songs", topics[0]).ranked).toEqual([]);
    expect(rankWoolyTopics("church", topics, "/songs").ranked).toEqual([]);
  });
  it("normalizes synonyms but keeps completed state distinct from saving", () => {
    expect(woolyWords("put music in setlst")).toEqual(["add", "song", "setlist"]);
    expect(woolyWords("saved template")).not.toContain("save");
  });
});
