import { describe, expect, it } from "vitest";
import { isRemoteCommand, REMOTE_PROTOCOL_VERSION } from "./control-protocol";

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
});
