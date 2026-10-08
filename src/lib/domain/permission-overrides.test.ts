import { describe, expect, it } from "vitest";
import { canForTeam, permissionOverrideInputSchema, resolvePermissionOverrides } from "./permission-overrides";
import { canEditSongDirectly } from "./shared-edit-requests";

describe("owner permission overrides", () => {
  it("applies a person decision before a role decision regardless of row order", () => {
    const rows = [
      { role: null, member_id: "person", permission: "setlists.manage", allowed: true },
      { role: "admin", member_id: null, permission: "setlists.manage", allowed: false },
    ];
    expect(canForTeam({ role: "admin", permissionOverrides: resolvePermissionOverrides(rows, "admin", "person") }, "setlists.manage")).toBe(true);
    expect(canForTeam({ role: "admin", permissionOverrides: resolvePermissionOverrides(rows, "admin", "other") }, "setlists.manage")).toBe(false);
  });
  it("protects owner access and ignores unknown capabilities", () => {
    expect(resolvePermissionOverrides([{ role: "owner", member_id: null, permission: "team.manage", allowed: false }], "owner")).toEqual({});
    expect(canForTeam({ role: "owner", permissionOverrides: { "team.manage": false } }, "team.manage")).toBe(true);
    expect(resolvePermissionOverrides([{ role: "member", member_id: null, permission: "unknown", allowed: true }], "member")).toEqual({});
  });
  it("preserves defaults and revokes custom grants and creator editing", () => {
    expect(canForTeam({ role: "admin" }, "members.manage")).toBe(true);
    expect(canForTeam({ role: "member", customPermissions: ["members.manage"], permissionOverrides: { "members.manage": false } }, "members.manage")).toBe(false);
    expect(canEditSongDirectly("member", "person", "person", { "songs.edit": false })).toBe(false);
    expect(canEditSongDirectly("member", "person", "other", { "songs.edit": true })).toBe(true);
  });
  it("rejects owner targets, unsupported capabilities and malformed identifiers", () => {
    expect(permissionOverrideInputSchema.safeParse({ teamId: "00000000-0000-0000-0000-000000000001", target: { kind: "role", role: "owner" }, permission: "team.manage", value: "deny" }).success).toBe(false);
    expect(permissionOverrideInputSchema.safeParse({ teamId: "invalid", target: { kind: "person", memberId: "invalid" }, permission: "members.manage", value: "allow" }).success).toBe(false);
  });
  it("inherits upload grants while keeping custom song edits subject to review", () => {
    const context = { role: "member", customPermissions: ["files.upload", "songs.edit"] as const };
    expect(canForTeam({ ...context, customPermissions: [...context.customPermissions] }, "files.upload")).toBe(true);
    expect(canForTeam({ ...context, customPermissions: [...context.customPermissions] }, "songs.edit")).toBe(false);
  });
});
