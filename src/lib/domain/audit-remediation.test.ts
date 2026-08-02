import { describe, expect, it } from "vitest";
import {
  canMutateTeamMember,
  joinRequestRoleSchema,
  setlistBulkInsertSchema,
  setlistReorderSchema,
  slideSettingsSchema,
} from "@/lib/domain/validators";

describe("audit remediation input and governance rules", () => {
  it("prevents generic member management from assigning or mutating an owner", () => {
    expect(canMutateTeamMember({ actorRole: "admin", targetRole: "member", action: "update", nextRole: "owner" })).toBe(false);
    expect(canMutateTeamMember({ actorRole: "admin", targetRole: "owner", action: "update", nextRole: "member" })).toBe(false);
    expect(canMutateTeamMember({ actorRole: "admin", targetRole: "owner", action: "delete" })).toBe(false);
    expect(canMutateTeamMember({ actorRole: "owner", targetRole: "owner", action: "delete" })).toBe(false);
  });

  it("allows owner/admin management of non-owner members without creating owners", () => {
    expect(canMutateTeamMember({ actorRole: "owner", targetRole: "admin", action: "update", nextRole: "pastor" })).toBe(true);
    expect(canMutateTeamMember({ actorRole: "admin", targetRole: "member", action: "update", nextRole: "band_member" })).toBe(true);
    expect(canMutateTeamMember({ actorRole: "pastor", targetRole: "member", action: "delete" })).toBe(false);
  });

  it("accepts only non-privileged join-request roles", () => {
    expect(joinRequestRoleSchema.safeParse("member").success).toBe(true);
    expect(joinRequestRoleSchema.safeParse("worship_leader").success).toBe(true);
    expect(joinRequestRoleSchema.safeParse("owner").success).toBe(false);
    expect(joinRequestRoleSchema.safeParse("admin").success).toBe(false);
    expect(joinRequestRoleSchema.safeParse("custom-role-id").success).toBe(false);
  });

  it("bounds and validates setlist bulk mutations", () => {
    expect(setlistBulkInsertSchema.safeParse({
      setlistId: "11111111-1111-4111-8111-111111111111",
      songs: [{ songId: "22222222-2222-4222-8222-222222222222", assignedKey: "C", type: "Worship" }],
    }).success).toBe(true);
    expect(setlistBulkInsertSchema.safeParse({
      setlistId: "11111111-1111-4111-8111-111111111111",
      songs: Array.from({ length: 101 }, () => ({
        songId: "22222222-2222-4222-8222-222222222222",
        assignedKey: "C",
        type: "Worship",
      })),
    }).success).toBe(false);
    expect(setlistReorderSchema.safeParse({
      setlistId: "11111111-1111-4111-8111-111111111111",
      updates: [{ id: "22222222-2222-4222-8222-222222222222", songOrder: 0 }],
    }).success).toBe(false);
  });

  it("accepts only stable slide background settings", () => {
    expect(slideSettingsSchema.safeParse({
      backgroundType: "color",
      backgroundValue: "#000000",
    }).success).toBe(true);
    expect(slideSettingsSchema.safeParse({
      backgroundType: "image",
      backgroundValue: "team-id/user-id/slide.png",
    }).success).toBe(true);
    expect(slideSettingsSchema.safeParse({
      backgroundType: "image",
      backgroundValue: "https://evil.example/track.png",
    }).success).toBe(false);
    expect(slideSettingsSchema.safeParse({
      backgroundType: "gradient",
      backgroundValue: "url(javascript:alert(1))",
    }).success).toBe(false);
  });
});
