import { describe, expect, it } from "vitest";
import {
  assertRole,
  can,
  canManageSetlists,
  canReviewEventRequests,
  canReviewJoinRequests,
  visibleNavigation,
} from "@/lib/domain/rbac";

describe("rbac", () => {
  it("allows owners to manage team access", () => {
    expect(can("owner", "team.manage")).toBe(true);
    expect(can("owner", "join_requests.review")).toBe(true);
  });

  it("prevents regular members from managing official setlists", () => {
    expect(can("member", "setlists.manage")).toBe(false);
    expect(can("member", "attendance.confirm")).toBe(true);
  });

  it("shows admin navigation only to member managers", () => {
    expect(visibleNavigation("owner")).toContain("members");
    expect(visibleNavigation("admin")).toContain("members");
    expect(visibleNavigation("band_member")).not.toContain("members");
    expect(visibleNavigation("dancer")).not.toContain("members");
  });

  it("orders the primary navigation with Home first and role-aware ministry tabs", () => {
    expect(visibleNavigation("owner")).toEqual(["home", "setlists", "events", "dance", "messages", "members", "profile"]);
    expect(visibleNavigation("dancer")).toEqual(["home", "setlists", "events", "dance", "messages", "profile"]);
    expect(visibleNavigation("member")).toEqual(["home", "setlists", "events", "messages", "profile"]);
  });

  it("exposes readable role helpers", () => {
    expect(canReviewJoinRequests("owner")).toBe(true);
    expect(canReviewJoinRequests("dancer")).toBe(false);
    expect(can("dancer", "dance_notes.manage")).toBe(true);
    expect(can("admin", "dance_notes.manage")).toBe(true);
    expect(canManageSetlists("band_leader")).toBe(true);
    expect(canManageSetlists("media")).toBe(false);
    expect(canReviewEventRequests("owner")).toBe(true);
    expect(canReviewEventRequests("admin")).toBe(true);
    expect(canReviewEventRequests("worship_leader")).toBe(false);
    expect(canReviewEventRequests("member")).toBe(false);
  });

  it("asserts valid role strings", () => {
    expect(assertRole("media")).toBe("media");
    expect(() => assertRole("visitor")).toThrow("Unsupported team role");
  });
});
