import { describe, expect, it } from "vitest";
import { buildAssignmentConflicts, eventWindowsOverlap, getMissingSetlistRoles } from "@/lib/domain/setlist-readiness";

describe("setlist readiness", () => {
  it("lists uncovered core roles", () => {
    const missing = getMissingSetlistRoles([
      { assignment: "Worship Leader", memberId: "member-1" },
      { assignment: "Main Keys", memberId: "member-2" },
      { assignment: "Drums", memberId: "member-3" },
    ]);

    expect(missing.map((role) => role.label)).toEqual([
      "Acoustic Guitar",
      "Electric Guitar",
      "Bass",
      "Singer",
      "Dancer",
    ]);
  });

  it("detects same-day overlapping event windows", () => {
    expect(
      eventWindowsOverlap(
        { id: "event-1", name: "Sunday", date: "2026-07-12", startsAt: "08:00", endsAt: "11:00" },
        { id: "event-2", name: "Prayer", date: "2026-07-12", startsAt: "10:30", endsAt: "12:00" },
      ),
    ).toBe(true);

    expect(
      eventWindowsOverlap(
        { id: "event-1", name: "Sunday", date: "2026-07-12", startsAt: "08:00", endsAt: "10:00" },
        { id: "event-2", name: "Prayer", date: "2026-07-12", startsAt: "10:30", endsAt: "12:00" },
      ),
    ).toBe(false);
  });

  it("builds readable member conflict warnings", () => {
    const conflicts = buildAssignmentConflicts({
      currentEvent: { id: "event-1", name: "Sunday", date: "2026-07-12", startsAt: "08:00", endsAt: "11:00" },
      currentAssignments: [{ assignment: "Drums", memberId: "member-1", memberName: "Alex" }],
      otherAssignments: [
        {
          assignment: "Bass",
          memberId: "member-1",
          memberName: "Alex",
          event: { id: "event-2", name: "Youth Service", date: "2026-07-12", startsAt: "10:00", endsAt: "12:00" },
        },
      ],
    });

    expect(conflicts).toMatchObject([
      {
        memberName: "Alex",
        currentRole: "Drums",
        conflictingRole: "Bass",
        eventName: "Youth Service",
      },
    ]);
  });
});
