import { describe, expect, it } from "vitest";
import { isRemoteCommand, isRemoteContentLibrary, newRemoteCommand, REMOTE_PROTOCOL_VERSION } from "./control-protocol";

const envelope = (kind: string, payload?: unknown) => ({ version: REMOTE_PROTOCOL_VERSION, id: "command-123", setlistId: "setlist-123", kind, issuedAt: new Date().toISOString(), controllerId: "remote-123", snapshotRevision: 2, payload });

describe("remote command validation", () => {
  it("requires the named command payload to have the expected primitive shape", () => {
    expect(isRemoteCommand(envelope("select-song", { songIndex: 1 }))).toBe(true);
    expect(isRemoteCommand(envelope("select-song", { songIndex: "1" }))).toBe(false);
    expect(isRemoteCommand(envelope("select-slide", { slideId: "item-1:slide-1" }))).toBe(true);
    expect(isRemoteCommand(envelope("select-slide", { slide: { id: "item-1:slide-1" } }))).toBe(false);
    expect(isRemoteCommand(envelope("timer", { timerAction: "start", timerMinutes: 5 }))).toBe(true);
    expect(isRemoteCommand(envelope("timer", { timerAction: "erase database" }))).toBe(false);
  });

  it("rejects unbounded or malformed stage and display payloads", () => {
    expect(isRemoteCommand(envelope("stage-message", { message: "Ready", stageFlashStyle: { fontSize: 44, color: "#ffffff", backgroundColor: "#000000" } }))).toBe(true);
    expect(isRemoteCommand(envelope("stage-message", { message: "x".repeat(10_001) }))).toBe(false);
    expect(isRemoteCommand(envelope("present-projector", { displayId: 42 }))).toBe(false);
  });

  it("accepts bounded presentation and Bible commands without exposing slide media", () => {
    expect(isRemoteCommand(envelope("present-presentation-slide", { presentationId: "deck-1", slideId: "slide-2" }))).toBe(true);
    expect(isRemoteCommand(envelope("present-presentation-slide", { presentationId: "deck-1", slide: { mediaUrl: "file:///private/video.mp4" } }))).toBe(false);
    expect(isRemoteCommand(envelope("present-bible-verse", { reference: "John 3:16", translation: "kjv", text: "For God so loved the world." }))).toBe(true);
    expect(isRemoteCommand(envelope("present-bible-verse", { reference: "John 3:16", translation: "unknown", text: "Text" }))).toBe(false);
    expect(isRemoteCommand(envelope("present-bible-verse", { reference: "John 3:16", translation: "kjv", text: "x".repeat(2_001) }))).toBe(false);
  });

  it("accepts only bounded number and letter lyric shortcuts", () => {
    expect(isRemoteCommand(envelope("set-lyric-shortcut", { setlistSongId: "song-1", slideId: "song-1:slide-1", keyCode: "Digit1" }))).toBe(true);
    expect(isRemoteCommand(envelope("set-lyric-shortcut", { setlistSongId: "song-1", slideId: "song-1:slide-1", keyCode: "KeyZ" }))).toBe(true);
    expect(isRemoteCommand(envelope("set-lyric-shortcut", { setlistSongId: "song-1", slideId: "song-1:slide-1" }))).toBe(true);
    expect(isRemoteCommand(envelope("set-lyric-shortcut", { setlistSongId: "song-1", slideId: "song-1:slide-1", keyCode: "ControlLeft" }))).toBe(false);
  });

  it("builds compatible version-2 envelopes and allows empty payloads for simple output commands", () => {
    const command = newRemoteCommand("setlist-123", "clear", {}, "remote-123", 2);
    expect(command).toEqual(expect.objectContaining({
      version: REMOTE_PROTOCOL_VERSION,
      setlistId: "setlist-123",
      kind: "clear",
      controllerId: "remote-123",
      snapshotRevision: 2,
      payload: {},
    }));
    expect(isRemoteCommand(command)).toBe(true);
  });
});

describe("remote content library validation", () => {
  it("accepts metadata-only saved deck summaries", () => {
    expect(isRemoteContentLibrary({
      version: 1,
      setlistId: "setlist-123",
      capabilities: { presentations: true, bible: true },
      presentations: [{ id: "deck-1", name: "Sunday", slides: [{ id: "slide-1", label: "Slide 1", preview: "Welcome" }] }],
      lyricShortcuts: [{ setlistSongId: "song-1", bindings: [{ slideId: "song-1:slide-1", keyCode: "Digit1" }] }],
      updatedAt: new Date().toISOString(),
    })).toBe(true);
  });

  it("rejects oversized or malformed summaries", () => {
    expect(isRemoteContentLibrary({
      version: 1,
      setlistId: "setlist-123",
      capabilities: { presentations: true, bible: true },
      presentations: [{ id: "deck-1", name: "Sunday", slides: [{ id: "slide-1", label: "Slide 1", preview: "x".repeat(181) }] }],
      updatedAt: new Date().toISOString(),
    })).toBe(false);
    expect(isRemoteContentLibrary({
      version: 1,
      setlistId: "setlist-123",
      capabilities: { presentations: "yes", bible: true },
      presentations: [],
      updatedAt: new Date().toISOString(),
    })).toBe(false);
  });
});
