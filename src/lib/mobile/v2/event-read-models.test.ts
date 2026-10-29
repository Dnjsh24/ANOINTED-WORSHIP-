// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mobileEventCacheSchema, mobileEventReadModelSchema } from "./event-cache";
import { getEventReadModel, getEventTimelineEvents, mobileEventRowSchema, mobileEventServiceOrderSchema, type MobileEventGraph, type MobileEventRow } from "./event-read-models";

const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const date = "2026-10-16T00:00:00Z";
const event: MobileEventRow = {
  id: id(1), team_id: id(2), name: "Worship", type: "service_rehearsal", event_date: "2026-10-18", starts_at: "09:00:00", ends_at: "10:30:00", call_time: "08:30:00",
  location: null, description: "Vocals, Band", rehearsal_date: "2026-10-17", rehearsal_time: "18:00:00", rehearsal_end_time: "19:00:00",
  recurrence_rule: "weekly", recurrence_parent_id: id(7), approval_status: "approved", requested_assignments: [], created_by: id(3), created_at: date, updated_at: date, deleted_at: null, sync_revision: 4,
};
const permissions = { canManage: true, canReview: false, canRequest: true, canConfirmAttendance: true, canManageSetlists: false };
function graph(): MobileEventGraph {
  return {
    members: [
      { id: id(4), team_id: id(2), profile_id: id(3), status: "active", profiles: null },
      { id: id(5), team_id: id(2), profile_id: id(6), status: "inactive", profiles: null },
    ],
    attendance: [
      { id: id(20), event_id: id(1), team_member_id: id(4), status: "maybe", note: "Later", responded_at: date, created_at: date, updated_at: date, sync_revision: 1 },
      { id: id(21), event_id: id(1), team_member_id: id(5), status: "available", note: null, responded_at: date, created_at: date, updated_at: date, sync_revision: 1 },
    ],
    ownAttendanceStates: [{ actor_id: id(3), team_id: id(2), event_id: id(1), member_id: id(4), attendance_id: id(20), revision: 1, deleted: false, changed_at: date }],
    assignments: [], setlists: [{ id: id(8), team_id: id(2), event_id: id(1), deleted_at: null }],
    orders: [], responses: [], templates: [],
    orderSongs: [
      { id: id(10), setlist_id: id(8), song_order: 2, deleted_at: null, song: null },
      { id: id(9), setlist_id: id(8), song_order: 1, deleted_at: null, song: { id: id(11), team_id: id(2), title: "Holy" } },
    ],
  };
}
describe("event website read projections", () => {
  it("preserves timeline and active-roster detail counts, own RSVP, rehearsal, recurrence and private-profile fallbacks", () => {
    const model = getEventReadModel(event, graph(), { userId: id(3), memberId: id(4) }, permissions);
    expect(model).toMatchObject({
      name: "Worship", time: "Rehearsal: 18:00 - 19:00 | Service: 09:00 - 10:30", location: "Main Sanctuary",
      rehearsalDate: "2026-10-17", rehearsalStart: "18:00", recurrenceRule: "weekly", confirmed: 1, pending: 1,
      createdByMe: true, myStatus: "maybe", setlistId: id(8), setlistIds: [id(8)], totalMembers: 1,
      roster: [{ status: "maybe", profileId: id(3), fullName: "Unknown", avatarUrl: null }],
      detail: { confirmed: 0, pending: 1, assignedTeams: ["Vocals", "Band"] },
      record: { sync_revision: 4, recurrence_parent_id: id(7) }, orderSongs: [{ id: id(9), title: "Holy" }],
    });
    expect(model.servicePlanning?.members).toEqual([{ id: id(4), name: "Team member" }]);
  });
  it("retains pending/rejected records for detail without making up running orders or RSVP metadata", () => {
    const model = getEventReadModel({ ...event, approval_status: "pending", description: "", requested_assignments: [{ team_member_id: id(4), assignment: "Media" }] }, { ...graph(), attendance: [] }, { userId: id(6), memberId: id(5) }, permissions);
    expect(model).toMatchObject({ approvalStatus: "pending", createdByMe: false, myStatus: "no_response", servicePlanning: null, orderSongs: [], detail: { assignedTeams: ["Worship Team"] } });
    expect(model.record.requested_assignments).toEqual([{ team_member_id: id(4), assignment: "Media" }]);
  });
  it("rejects malformed dates, unknown fields, invalid revisions, and duplicate service entries", () => {
    expect(mobileEventRowSchema.safeParse({ ...event, sync_revision: -1 }).success).toBe(false);
    expect(mobileEventRowSchema.safeParse({ ...event, event_date: "2026-02-30" }).success).toBe(false);
    expect(mobileEventRowSchema.safeParse({ ...event, secret: "unexpected" }).success).toBe(false);
    expect(mobileEventRowSchema.safeParse({ ...event, requested_assignments: [{ team_member_id: id(4), assignment: "Media", unexpected: true }] }).success).toBe(false);
    const entry = { id: id(12), kind: "prayer", title: "Prayer", slot_id: null, duration_seconds: 60, responsible_member_id: null, cue: "" };
    expect(mobileEventServiceOrderSchema.safeParse({ event_id: id(1), team_id: id(2), revision: 1, entries: [entry, entry], required_roles: [], updated_by: id(3), updated_at: date }).success).toBe(false);
  });

  it("strictly caches the actor-bound live revision, tombstone, and never-observed state", () => {
    const identity = { userId: id(3), teamId: id(2), memberId: id(4), teamName: "Team", role: "member", permissions: [] };
    const model = getEventReadModel(event, graph(), identity, permissions);
    const snapshot = { version: 2, identity, events: [model] };
    expect(mobileEventCacheSchema.safeParse(snapshot).success).toBe(true);
    expect(model.ownAttendanceState).toEqual({ actorId: id(3), teamId: id(2), eventId: id(1), memberId: id(4), attendanceId: id(20), revision: 1, deleted: false, changedAt: date });
    const tombstone = { ...model, attendance: [], ownAttendanceState: { ...model.ownAttendanceState!, revision: 3, deleted: true } };
    expect(mobileEventCacheSchema.safeParse({ ...snapshot, events: [tombstone] }).success).toBe(true);
    expect(mobileEventCacheSchema.safeParse({ ...snapshot, events: [{ ...model, attendance: [], ownAttendanceState: null }] }).success).toBe(true);
    const changes = [
      { actorId: id(99) }, { teamId: id(99) }, { eventId: id(99) }, { memberId: id(99) }, { attendanceId: id(99) },
      { revision: 2 }, { revision: 0 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { deleted: true }, { changedAt: "bad" }, { unexpected: true },
    ];
    for (const change of changes) {
      expect(mobileEventCacheSchema.safeParse({ ...snapshot, events: [{ ...model, ownAttendanceState: { ...model.ownAttendanceState, ...change } }] }).success).toBe(false);
    }
    expect(mobileEventCacheSchema.safeParse({ ...snapshot, events: [{ ...model, ownAttendanceState: null }] }).success).toBe(false);
    expect(mobileEventCacheSchema.safeParse({ ...snapshot, events: [{ ...model, ownAttendanceState: undefined }] }).success).toBe(false);
    expect(mobileEventReadModelSchema.safeParse({ ...model, attendance: [] }).success).toBe(false);
    expect(mobileEventCacheSchema.safeParse({ ...snapshot, events: [{ ...model, attendance: [{ ...model.attendance[0], sync_revision: undefined }] }] }).success).toBe(false);
  });

  it("keeps deleted/rejected detail data outside the website timeline", () => {
    const rows = [event, { ...event, approval_status: "rejected" as const }, { ...event, deleted_at: date }]
      .map(row => getEventReadModel(row, graph(), { userId: id(3), memberId: id(4) }, permissions));
    expect(getEventTimelineEvents(rows)).toEqual([rows[0]]);
  });
});
