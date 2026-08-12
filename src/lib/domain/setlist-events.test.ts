import { describe, expect, it } from "vitest";
import {
  getSetlistGroups,
  getVisibleSetlistMetadata,
  type SetlistWithEvent,
} from "@/lib/domain/setlist-events";

function makeSetlist(overrides: Partial<SetlistWithEvent> = {}): SetlistWithEvent {
  return {
    id: "setlist-1",
    name: "Sunday Songs",
    date: "2026-08-13",
    leader: "Legacy Leader",
    location: "Legacy Sanctuary",
    callTime: "09:00",
    rehearsalTime: "08:00",
    serviceTimes: ["Legacy Service"],
    songs: [],
    linkedEvent: null,
    ...overrides,
  };
}

describe("setlist event presentation", () => {
  it("does not expose legacy event metadata for a standalone setlist", () => {
    expect(getVisibleSetlistMetadata(makeSetlist())).toBeNull();
  });

  it("uses linked Timeline event metadata instead of legacy setlist fields", () => {
    const setlist = makeSetlist({
      linkedEvent: {
        id: "event-1",
        name: "Sunday Gathering",
        type: "service",
        serviceType: "Sunday Worship",
        date: "2026-08-16",
        startTime: "10:00",
        endTime: "12:00",
        callTime: "08:30",
        rehearsalDate: null,
        rehearsalStart: "09:00",
        rehearsalEnd: null,
        location: "Main Sanctuary",
        worshipLeader: "Jamie Cruz",
        assignments: [],
        notes: null,
        approvalStatus: "approved",
      },
    });

    expect(getVisibleSetlistMetadata(setlist)).toEqual({
      date: "2026-08-16",
      location: "Main Sanctuary",
      serviceLabel: "Service - Sunday Worship",
      worshipLeader: "Jamie Cruz",
    });
  });

  it("groups standalone setlists separately and dates linked setlists by their event", () => {
    const standalone = makeSetlist({ id: "standalone", date: "2099-01-01" });
    const upcoming = makeSetlist({
      id: "upcoming",
      linkedEvent: {
        id: "event-upcoming",
        name: "Upcoming",
        type: "service",
        serviceType: "Sunday Worship",
        date: "2026-08-20",
        startTime: "09:00",
        endTime: null,
        callTime: "08:00",
        rehearsalDate: null,
        rehearsalStart: null,
        rehearsalEnd: null,
        location: "Main Sanctuary",
        worshipLeader: "Leader",
        assignments: [],
        notes: null,
        approvalStatus: "approved",
      },
    });
    const past = makeSetlist({
      id: "past",
      date: "2099-01-01",
      linkedEvent: { ...upcoming.linkedEvent!, id: "event-past", date: "2026-08-01" },
    });

    expect(getSetlistGroups([standalone, upcoming, past], "2026-08-13")).toEqual({
      standalone: [standalone],
      upcoming: [upcoming],
      past: [past],
    });
  });
});
