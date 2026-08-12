import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const setlistDetail = readFileSync("src/app/setlists/[id]/page.tsx", "utf8");
const eventDetail = readFileSync("src/app/events/[id]/page.tsx", "utf8");

describe("setlist and Timeline detail contract", () => {
  it("gates every event-only setlist section behind a linked event", () => {
    expect(setlistDetail).toContain('{linkedEvent ? "Linked Setlist" : "Standalone Setlist"}');
    expect(setlistDetail).toContain("{linkedEvent ? (");
    expect(setlistDetail).toContain("View Timeline Event");
    expect(setlistDetail).toContain("linkedToEvent={Boolean(linkedEvent)}");
  });

  it("renders the shared interactive workspace directly on Timeline events", () => {
    expect(eventDetail).toContain("<SetlistWorkspace");
    expect(eventDetail).toContain("canManageSetlist={canManageSetlist}");
    expect(eventDetail).toContain("Create Setlist");
    expect(eventDetail).toContain("Link Existing Setlist");
    expect(eventDetail).toContain("No setlist linked yet");
  });

  it("reads service type, Call Time, worship leader, and assignments from the event", () => {
    expect(eventDetail).toContain("service_type");
    expect(eventDetail).toContain("call_time");
    expect(eventDetail).toContain('assignment === "Worship Leader"');
    expect(eventDetail).toContain("Assigned Roles / Teams");
  });
});
