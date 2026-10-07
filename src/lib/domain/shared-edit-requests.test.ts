import { describe, expect, it } from "vitest";
import { canEditSongDirectly, canReviewSharedEdit, sharedEditRequestInputSchema } from "./shared-edit-requests";
import { can } from "./rbac";
import { defaultPreparationTasks } from "./team-workflows";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const submission = { targetType: "song", targetId: id(1), revision: 2, changes: { title: "New title" }, reason: "Correct spelling", requestNonce: id(2) };

describe("shared edit request boundary", () => {
  it("allows every active role to add songs but requires creator or owner/admin for direct edits", () => {
    for (const role of ["owner", "admin", "pastor", "worship_leader", "band_leader", "member", "band_member", "media", "dancer"]) {
      expect(can(role, "songs.create")).toBe(true);
      expect(canEditSongDirectly(role, id(3), id(3))).toBe(true);
      expect(canEditSongDirectly(role, id(3), id(4))).toBe(["owner", "admin"].includes(role));
    }
    expect(can("visitor", "songs.create")).toBe(false);
  });
  it("never grants song review to leaders or a custom song grant; dance authoring alone cannot approve", () => {
    expect(canReviewSharedEdit("worship_leader", "song", ["songs.review"])).toBe(false);
    expect(canReviewSharedEdit("band_leader", "song")).toBe(false);
    expect(canReviewSharedEdit("admin", "song")).toBe(true);
    expect(canReviewSharedEdit("dancer", "choreography", ["dance_notes.manage"])).toBe(false);
    expect(canReviewSharedEdit("member", "choreography", ["dance_notes.review"])).toBe(true);
    expect(canReviewSharedEdit("band_leader", "rehearsal_plan")).toBe(true);
    expect(canReviewSharedEdit("band_leader", "service_order")).toBe(false);
  });
  it("rejects protected identity, receipt/private targets and unbounded or empty changes", () => {
    for (const changes of [{ created_by: id(3) }, { title: "x".repeat(161) }, { status: "approved" }, { deleted_at: null }, { team_id: id(3) }, {}, { tags: [42] }]) {
      expect(sharedEditRequestInputSchema.safeParse({ ...submission, changes }).success).toBe(false);
    }
    for (const targetType of ["message", "song_readiness", "assignment_response", "profile"]) expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, actorId: id(3) }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "reminder", changes: { acknowledged_at: null } }).success).toBe(false);
  });
  it("requires explicit revision, stable nonce and reason, and accepts nullable clears", () => {
    expect(sharedEditRequestInputSchema.safeParse(submission).success).toBe(true);
    for (const extra of [{ revision: -1 }, { revision: 0.5 }, { reason: " " }, { requestNonce: "bad" }]) expect(sharedEditRequestInputSchema.safeParse({ ...submission, ...extra }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, changes: { bpm: null, youtube_url: null } }).success).toBe(true);
  });
  it("keeps preparation and service patches typed and bounded", () => {
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "rehearsal_plan", changes: { tasks: defaultPreparationTasks(), allocations: [{ slot_id: id(5), minutes: 8, focus: "Ending" }] } }).success).toBe(true);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "rehearsal_plan", changes: { tasks: [] } }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "service_order", changes: { entries: [{ id: id(6), kind: "song", title: "Opening", slot_id: null, duration_seconds: 300, responsible_member_id: null, cue: "" }] } }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "rehearsal_plan", changes: { tasks: Array(10).fill(defaultPreparationTasks()[0]) } }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "service_order", changes: { required_roles: ["Drums", "Drums"] } }).success).toBe(false);
    expect(sharedEditRequestInputSchema.safeParse({ ...submission, targetType: "event", changes: { assignments: [{ team_member_id: id(3), assignment: "Drums", actorId: id(9) }] } }).success).toBe(false);
  });
});
